import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { addMonths, format, getISODay, parseISO } from 'date-fns';
import { BadgeCheck, CalendarDays, ChevronDown, Clock, Coffee, Info, Wallet } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useAttendance, useLiveClock } from '@/app/attendance';
import { usePayroll } from '@/data/pay';
import { useSettings } from '@/data/common';
import type { Payroll, PayrollDay } from '@/lib/types';
import { PageHeader, Panel, PanelHeader, Picker, Pill, Skeleton } from '@/ui/kit';
import { duration, localISO, payPeriod, pkr, time, usd } from '@/lib/format';

export const DAY_STYLE: Record<PayrollDay['status'], { label: string; bg: string; fg: string }> = {
  present: { label: 'On time', bg: 'rgba(48,196,108,.18)', fg: '#1E9C55' },
  short: { label: 'Short day', bg: 'rgba(255,159,10,.22)', fg: '#C77700' },
  half: { label: 'Half day', bg: 'rgba(255,107,61,.24)', fg: '#D9541E' },
  late_absent: { label: 'Too late', bg: 'rgba(255,69,58,.22)', fg: '#D7362C' },
  absent: { label: 'Absent', bg: 'rgba(255,69,58,.22)', fg: '#D7362C' },
  paid_leave: { label: 'Paid leave', bg: 'rgba(10,132,255,.16)', fg: '#0A6FD6' },
  unpaid_leave: { label: 'Unpaid leave', bg: 'rgba(142,138,160,.22)', fg: '#6D6880' },
  holiday: { label: 'Holiday', bg: 'rgba(124,92,255,.16)', fg: '#6A4BEA' },
  off: { label: 'Day off', bg: 'transparent', fg: 'var(--text-3)' },
  extra: { label: 'Extra day', bg: 'rgba(52,211,160,.16)', fg: '#1E9C75' },
  pending: { label: 'Today', bg: 'rgba(124,92,255,.10)', fg: '#7C5CFF' },
  untracked: { label: 'Before go-live', bg: 'transparent', fg: 'var(--text-3)' },
};

function periodOptions(n = 6) {
  const cur = payPeriod(localISO());
  return Array.from({ length: n }, (_, i) => {
    const start = format(addMonths(parseISO(cur.start), -i), 'yyyy-MM-dd');
    const end = format(addMonths(parseISO(cur.end), -i), 'yyyy-MM-dd');
    return { value: start, label: `${format(parseISO(start), 'd MMM')} – ${format(parseISO(end), 'd MMM yyyy')}`, hint: i === 0 ? 'Current period' : undefined };
  });
}

export default function PayPage() {
  const { profile } = useAuth();
  const options = useMemo(() => periodOptions(), []);
  const [period, setPeriod] = useState(options[0].value);
  const pay = usePayroll(profile?.id, period);
  return (
    <>
      <PageHeader
        title="Pay & attendance"
        sub="Pay runs from the 20th to the 20th. This is a live estimate until your admin releases the payslip."
        right={<Picker className="w-[250px]" align="right" value={period} onChange={setPeriod} options={options} />}
      />
      {!pay.data ? <Skeleton className="h-[480px] rounded-[30px]" /> : <PayView p={pay.data} showToday={period === options[0].value} />}
    </>
  );
}

export function PayView({ p, showToday }: { p: Payroll; showToday?: boolean }) {
  const settings = useSettings();
  const s = settings.data;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <div className="space-y-5">
        <Panel strong className="relative overflow-hidden !p-7">
          <div className="absolute -right-16 -top-16 size-56 rounded-full bg-mint/25 blur-3xl" />
          <div className="relative">
            <div className="text-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider">
              <Wallet className="size-4" />{p.released_at ? 'Released payslip' : p.is_current ? 'Estimated so far' : 'Estimated'}
              {p.released_at && <Pill tone="good"><BadgeCheck className="size-3" />Released</Pill>}
            </div>
            <div className="tabular mt-2 font-display text-[44px] font-black leading-none tracking-tight">{pkr(p.net_pkr)}</div>
            <div className="text-2 mt-2 text-[13px]">Pay day {format(parseISO(p.pay_day), 'EEEE d MMMM')}</div>

            <dl className="mt-6 space-y-2.5 text-[14px]">
              <Line label="Monthly salary" value={pkr(p.monthly_salary_pkr)} />
              <Line label={`Attendance deductions · ${p.deduction_days} day${p.deduction_days === 1 ? '' : 's'} × ${pkr(p.daily_rate_pkr)}`} value={p.deduction_pkr ? `− ${pkr(p.deduction_pkr)}` : pkr(0)} bad={p.deduction_pkr > 0} />
              {p.sales && p.sales.tier === 'below' && (
                <Line label={`Below 30% of target · paid ${Math.round(p.sales.salary_factor * 100)}% of salary`} value={`− ${pkr(p.after_attendance_pkr * (1 - p.sales.salary_factor))}`} bad />
              )}
              {p.sales && p.sales.commission_usd > 0 && (
                <Line label={`Commission · ${Math.round(p.sales.commission_rate * 100)}% of ${usd(p.sales.closed_usd)} (${usd(p.sales.commission_usd)} at ${p.sales.usd_to_pkr})`} value={`+ ${pkr(p.sales.commission_pkr)}`} good />
              )}
              <div className="hairline border-t pt-2.5"><Line label="Net pay" value={pkr(p.net_pkr)} strong /></div>
            </dl>
          </div>
        </Panel>

        {p.sales && <SalesTarget p={p} />}
        {showToday && <TodayShift />}
        <Rules settings={s} isSales={!!p.sales} />
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Attendance this period" sub={`${p.scheduled_days} scheduled days · ${format(parseISO(p.period_start), 'd MMM')} – ${format(parseISO(p.period_end), 'd MMM')}`} />
          <div className="mb-4 flex flex-wrap gap-2">
            {(['present', 'short', 'half', 'absent', 'late_absent', 'paid_leave', 'unpaid_leave', 'holiday'] as const)
              .filter((k) => p.counts[k])
              .map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: DAY_STYLE[k].bg, color: DAY_STYLE[k].fg }}>
                  {p.counts[k]} {DAY_STYLE[k].label.toLowerCase()}
                </span>
              ))}
          </div>
          <Calendar days={p.days ?? []} start={p.period_start} end={p.period_end} />
        </Panel>
      </div>
    </div>
  );
}

function Line({ label, value, bad, good, strong }: { label: string; value: string; bad?: boolean; good?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={clsx(strong ? 'font-bold' : 'text-2')}>{label}</dt>
      <dd className={clsx('tabular shrink-0 font-bold', bad && 'text-bad', good && 'text-ok', strong && 'text-[17px] font-extrabold')}>{value}</dd>
    </div>
  );
}

export function Calendar({ days, start, end }: { days: PayrollDay[]; start: string; end: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const all: string[] = [];
  for (let d = parseISO(start); d <= parseISO(end); d = new Date(d.getTime() + 86_400_000)) all.push(format(d, 'yyyy-MM-dd'));
  const lead = getISODay(parseISO(start)) - 1;
  const today = localISO();
  return (
    <div>
      <div className="text-3 mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold uppercase">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => <div key={`pad${i}`} />)}
        {all.map((iso, i) => {
          const d = byDate.get(iso);
          const st = d ? DAY_STYLE[d.status] : null;
          const future = iso > today;
          return (
            <motion.div
              key={iso}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.012 }}
              onPointerEnter={() => setHover(iso)}
              onPointerLeave={() => setHover(null)}
              className={clsx('relative aspect-square rounded-2xl p-1.5 text-left', future ? 'fill opacity-50' : !st || d?.status === 'off' || d?.status === 'untracked' ? 'fill' : '', d?.status === 'untracked' && 'opacity-60', iso === today && 'ring-2 ring-iris')}
              style={st && d?.status !== 'off' && d?.status !== 'untracked' ? { background: st.bg } : undefined}
            >
              <div className="tabular text-[13px] font-extrabold">{format(parseISO(iso), 'd')}</div>
              {d && d.status !== 'off' && d.status !== 'untracked' && (
                <div className="mt-0.5 hidden truncate text-[10px] font-bold leading-tight sm:block" style={{ color: st!.fg }}>
                  {d.deduction_days > 0 ? `−${d.deduction_days}d` : d.status === 'short' && d.note ? 'warning' : st!.label}
                </div>
              )}
              {hover === iso && d && (
                <div className="glass-strong pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 w-[200px] -translate-x-1/2 rounded-2xl px-3 py-2 text-[12px]">
                  <div className="font-bold">{format(parseISO(iso), 'EEEE d MMM')} · {st?.label}</div>
                  {d.first_in && <div className="text-2">In {time(d.first_in)}{d.last_out ? ` · out ${time(d.last_out)}` : ''}</div>}
                  {d.late_minutes > 0 && <div className="text-2">{d.late_minutes} min late</div>}
                  {d.deduction_days > 0 && <div className="font-semibold text-bad">{d.deduction_days} day deducted</div>}
                  {d.note && <div className="text-3">{d.note}</div>}
                  {d.auto_signed_out && <div className="text-warn">Signed out automatically</div>}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function SalesTarget({ p }: { p: Payroll }) {
  const s = p.sales!;
  const ratio = s.target_usd ? s.closed_usd / s.target_usd : 0;
  const tiers = [
    { at: 0, label: '30% pay', active: s.tier === 'below' },
    { at: 0.3, label: 'Full salary', active: s.tier === 'base' },
    { at: 1, label: '+25% commission', active: s.tier === 'commission' },
  ];
  return (
    <Panel>
      <PanelHeader title="Sales target" sub={s.target_usd ? `${usd(s.closed_usd)} closed of ${usd(s.target_usd)} this period` : 'Your admin has not set a target yet'} />
      {s.target_usd > 0 && (
        <>
          <div className="fill relative h-4 rounded-full">
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (ratio / 1.25) * 100)}%` }} transition={{ type: 'spring', stiffness: 140, damping: 22 }}
              className="absolute inset-y-0 left-0 rounded-full" style={{ background: s.tier === 'commission' ? 'linear-gradient(90deg,#30C46C,#34D3A0)' : s.tier === 'below' ? 'linear-gradient(90deg,#FF9F0A,#FFB547)' : 'linear-gradient(90deg,#7C5CFF,#5AB8FF)' }} />
            {[0.3, 1].map((m) => <div key={m} className="absolute -top-1 h-6 w-0.5 rounded bg-[color:var(--text)] opacity-40" style={{ left: `${(m / 1.25) * 100}%` }} />)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {tiers.map((t) => (
              <div key={t.label} className={clsx('rounded-2xl px-3 py-2 text-center text-[12px] font-bold', t.active ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'fill text-2')}>
                <div>{t.at === 0 ? `≤ ${usd(s.low_threshold_usd)}` : t.at === 0.3 ? `${usd(s.low_threshold_usd)}+` : `${usd(s.target_usd)}+`}</div>
                <div className={clsx('text-[11px] font-semibold', !t.active && 'text-3')}>{t.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function TodayShift() {
  const { tracksAttendance } = useAuth();
  const { state, fetchedAt } = useAttendance();
  const live = useLiveClock(state, fetchedAt);
  if (!tracksAttendance || !state) return null;
  return (
    <Panel>
      <PanelHeader title="Today" sub={state.scheduled_start ? `Shift ${time(state.scheduled_start)} – ${time(state.scheduled_end)}` : undefined} />
      <div className="grid grid-cols-3 gap-2">
        <Mini icon={<Clock className="size-4" />} label="Signed in" value={state.first_in ? time(state.first_in) : '—'} sub={state.late_minutes >= 15 ? `${state.late_minutes} min late` : 'on time'} />
        <Mini icon={<CalendarDays className="size-4" />} label="Worked" value={duration(live.worked)} />
        <Mini icon={<Coffee className="size-4" />} label="Break used" value={duration(live.breakUsed)} sub={`of ${duration(state.break_allowance_seconds)}`} />
      </div>
    </Panel>
  );
}

function Mini({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="fill rounded-2xl px-3 py-2.5">
      <div className="text-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">{icon}{label}</div>
      <div className="tabular mt-1 text-[17px] font-extrabold">{value}</div>
      {sub && <div className="text-3 text-[12px]">{sub}</div>}
    </div>
  );
}

function Rules({ settings, isSales }: { settings: ReturnType<typeof useSettings>['data']; isSales: boolean }) {
  const [open, setOpen] = useState(false);
  if (!settings) return null;
  const s = settings;
  return (
    <Panel>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left text-[15px] font-bold">
        <Info className="size-4 text-iris" /> How your pay is worked out
        <ChevronDown className={clsx('ml-auto size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="text-2 mt-3 list-disc space-y-1.5 pl-5 text-[13px]">
          <li>A day's pay is your monthly salary divided by your scheduled working days in the period.</li>
          <li>Absent with no leave: <b>one day</b> deducted.</li>
          {s.attendance_starts_on && <li>Attendance is counted from <b>{format(parseISO(s.attendance_starts_on), 'd MMMM yyyy')}</b>, the day NUUKE went live. Days before that are never deducted.</li>}
          <li>{s.grace_minutes}–{s.short_day_max_minutes} min late is a <b>short day</b>. The first {s.free_short_days === 1 ? 'one is' : `${s.free_short_days} are`} a warning; every one after deducts a full day.</li>
          <li>Up to {s.half_day_max_minutes} min late is a <b>half day</b>. The first {s.reduced_half_days === 1 ? 'one costs' : `${s.reduced_half_days} cost`} half a day; every one after deducts a full day.</li>
          <li>More than {s.half_day_max_minutes} min late counts as absent.</li>
          <li>Your shift includes a {s.break_allowance_minutes}-minute break. Forget to sign out and you are signed out {s.signout_grace_minutes} minutes after the reminder.</li>
          {isSales && (
            <>
              <li>Close {Math.round(Number(s.low_performance_ratio) * 100)}% of your target or less and you are paid {Math.round(Number(s.low_performance_salary_factor) * 100)}% of salary.</li>
              <li>Between {Math.round(Number(s.low_performance_ratio) * 100)}% and 100%: full salary.</li>
              <li>100% or more: full salary plus {Math.round(Number(s.commission_rate) * 100)}% commission on everything you closed, at Rs {s.usd_to_pkr} per dollar.</li>
            </>
          )}
        </ul>
      )}
    </Panel>
  );
}
