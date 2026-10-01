import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Coffee, LogIn, Timer } from 'lucide-react';
import { useAttendanceBoard } from '@/data/admin';
import { usePayroll } from '@/data/pay';
import { rpc } from '@/lib/supabase';
import type { BoardRow } from '@/lib/types';
import { Agent } from '@/agent/Agent';
import { normaliseAgent } from '@/agent/catalog';
import { Button, Input, PageHeader, Picker, Pill, Sheet, Skeleton, type Tone } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { Calendar } from '@/pages/me/PayPage';
import { duration, localISO, payPeriod, pkr, time } from '@/lib/format';

const STATE: Record<string, { label: string; tone: Tone; order: number }> = {
  online: { label: 'Online', tone: 'good', order: 1 },
  break: { label: 'On break', tone: 'warn', order: 2 },
  absent: { label: 'Not signed in', tone: 'bad', order: 0 },
  signed_out: { label: 'Signed out', tone: 'info', order: 3 },
  not_started: { label: 'Shift not started', tone: 'neutral', order: 4 },
  day_off: { label: 'Day off', tone: 'neutral', order: 5 },
  paid_leave: { label: 'Paid leave', tone: 'info', order: 5 },
  unpaid_leave: { label: 'Unpaid leave', tone: 'neutral', order: 5 },
  holiday: { label: 'Holiday', tone: 'iris', order: 5 },
  absent_override: { label: 'Marked absent', tone: 'bad', order: 5 },
  untracked: { label: 'Before go-live', tone: 'neutral', order: 6 },
};

export default function AdminAttendance() {
  const [date, setDate] = useState(localISO());
  const isToday = date === localISO();
  const board = useAttendanceBoard(isToday ? null : date);
  const [open, setOpen] = useState<BoardRow | null>(null);

  const groups = useMemo(() => {
    const g = new Map<string, BoardRow[]>();
    for (const r of board.data ?? []) g.set(r.state, [...(g.get(r.state) ?? []), r]);
    return [...g.entries()].sort((a, b) => (STATE[a[0]]?.order ?? 9) - (STATE[b[0]]?.order ?? 9));
  }, [board.data]);

  const late = (board.data ?? []).filter((r) => r.first_in && r.late_minutes >= 15).length;
  const auto = (board.data ?? []).filter((r) => r.auto_signed_out).length;

  return (
    <>
      <PageHeader title="Attendance" sub="Who is in, who is late, who forgot to sign out. Tap a person to see their period or correct a day."
        right={<Input type="date" value={date} max={localISO()} onChange={(e) => setDate(e.target.value || localISO())} className="w-[170px]" />} />

      <div className="mb-5 flex flex-wrap gap-2">
        {groups.map(([s, rows]) => <Pill key={s} tone={STATE[s]?.tone ?? 'neutral'}>{rows.length} {STATE[s]?.label.toLowerCase() ?? s}</Pill>)}
        {late > 0 && <Pill tone="warn" solid>{late} late</Pill>}
        {auto > 0 && <Pill tone="bad" solid>{auto} auto signed out</Pill>}
      </div>

      {board.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-[26px]" />)}</div>
      ) : (
        <div className="space-y-6">
          {groups.map(([state, rows]) => (
            <section key={state}>
              <div className="text-3 mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.12em]">{STATE[state]?.label ?? state}</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((r, i) => <PersonCard key={r.profile_id} r={r} i={i} onOpen={() => setOpen(r)} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      <PersonAttendance row={open} defaultDate={date} onClose={() => setOpen(null)} />
    </>
  );
}

function PersonCard({ r, i, onOpen }: { r: BoardRow; i: number; onOpen: () => void }) {
  const st = STATE[r.state] ?? STATE.not_started;
  const lateTone = r.late_minutes >= 90 ? 'bad' : r.late_minutes >= 45 ? 'bad' : r.late_minutes >= 15 ? 'warn' : null;
  const mood = r.state === 'break' ? 'sleepy' : r.state === 'online' ? 'focus' : r.state === 'absent' ? 'idle' : 'idle';
  return (
    <motion.button type="button" onClick={onOpen} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
      whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} className="glass rounded-[26px] p-4 text-left">
      <div className="flex items-center gap-3">
        <Agent config={normaliseAgent(r.avatar, r.profile_id)} size={52} mood={mood} animated={r.state === 'online' || r.state === 'break'} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-extrabold">{r.full_name}</div>
          <div className="text-3 truncate text-[12px]">Shift {time(r.scheduled_start)} – {time(r.scheduled_end)}</div>
          <div className="mt-1"><Pill tone={st.tone}>{st.label}</Pill></div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <Mini icon={<LogIn className="size-3.5" />} label="In" value={r.first_in ? time(r.first_in) : '—'} />
        <Mini icon={<Timer className="size-3.5" />} label="Worked" value={r.worked_seconds ? duration(r.worked_seconds) : '—'} />
        <Mini icon={<Coffee className="size-3.5" />} label="Break" value={r.break_seconds ? duration(r.break_seconds) : '—'} warn={r.break_seconds > 3600} />
      </div>
      {(lateTone || r.auto_signed_out || r.override_status) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {lateTone && <Pill tone={lateTone}>{r.late_minutes} min late · {r.arrival === 'short' ? 'short day' : r.arrival === 'half' ? 'half day' : 'counted absent'}</Pill>}
          {r.auto_signed_out && <Pill tone="bad"><AlertTriangle className="size-3" />Auto signed out</Pill>}
          {r.override_status && <Pill tone="iris">Corrected: {r.override_status.replace('_', ' ')}</Pill>}
        </div>
      )}
    </motion.button>
  );
}

function Mini({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div className="fill rounded-xl px-2.5 py-1.5">
      <div className="text-3 flex items-center gap-1 text-[10px] font-bold uppercase">{icon}{label}</div>
      <div className={clsx('tabular text-[13px] font-extrabold', warn && 'text-warn')}>{value}</div>
    </div>
  );
}

const OVERRIDES = [
  { value: '__clear', label: 'No correction (use the clock)' },
  { value: 'present', label: 'Present — on time' },
  { value: 'short', label: 'Short day' },
  { value: 'half', label: 'Half day' },
  { value: 'absent', label: 'Absent' },
  { value: 'paid_leave', label: 'Paid leave' },
  { value: 'unpaid_leave', label: 'Unpaid leave' },
  { value: 'holiday', label: 'Holiday' },
];

function PersonAttendance({ row, defaultDate, onClose }: { row: BoardRow | null; defaultDate: string; onClose: () => void }) {
  const period = payPeriod(defaultDate);
  const pay = usePayroll(row?.profile_id, period.start);
  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState('__clear');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const save = async () => {
    if (!row) return;
    setBusy(true);
    try {
      await rpc('set_attendance_override', { p_profile: row.profile_id, p_date: date, p_status: status === '__clear' ? (null as never) : status, p_note: note || undefined });
      toast({ title: 'Attendance corrected', body: `${row.full_name} · ${date}`, tone: 'success' });
      setNote('');
      void qc.invalidateQueries({ queryKey: ['payroll'] });
      void qc.invalidateQueries({ queryKey: ['attendance-board'] });
      void qc.invalidateQueries({ queryKey: ['payroll-overview'] });
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!row} onClose={onClose} width={860} title={row?.full_name}>
      {row && (
        <div className="grid gap-6 pt-2 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="text-2 mb-3 text-[13px]">Pay period {period.start} → {period.end}{pay.data && <> · estimated pay <b className="text-[color:var(--text)]">{pkr(pay.data.net_pkr)}</b>, {pay.data.deduction_days} day(s) deducted</>}</div>
            {pay.data ? <Calendar days={pay.data.days ?? []} start={pay.data.period_start} end={pay.data.period_end} /> : <Skeleton className="h-80" />}
          </div>
          <div className="fill h-fit space-y-3 rounded-[24px] p-5">
            <h3 className="text-[15px] font-bold">Correct a day</h3>
            <p className="text-2 text-[13px]">Sick leave, a public holiday, or a late arrival you are forgiving. The note is kept in the activity log.</p>
            <Input label="Day" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Picker label="Count it as" value={status} onChange={setStatus} options={OVERRIDES} />
            <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Doctor's appointment, approved" />
            <Button variant="primary" block loading={busy} onClick={save}>Save correction</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
