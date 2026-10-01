import { useMemo, useState } from 'react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { CalendarCheck, Headphones, PhoneIncoming, Sparkles, Trophy } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { OUTCOME_TONE, STAGES, outcomeMap, useOutcomes, useSalesStats } from '@/data/sales';
import { usePayroll } from '@/data/pay';
import { BarList, ColumnChart, ForecastChart } from '@/ui/charts';
import { PageHeader, Panel, PanelHeader, ProgressBar, Segmented, Skeleton, Stat, toneColor } from '@/ui/kit';
import { addDaysISO, count, localISO, payPeriod, pct, pkr, usd, usdShort } from '@/lib/format';

/** Share of the previous funnel step; blank when it would exceed 100% (steps from different weeks). */
const step = (n: number, of: number, digits = 0) => (of && n <= of ? pct(n / of, digits) : '');

type Range = 'week' | 'period' | 'month30' | 'month90';

export default function AnalyticsPage() {
  const { profile, employment } = useAuth();
  const [range, setRange] = useState<Range>('period');
  const today = localISO();
  const period = payPeriod(today);
  const [from, to] = useMemo(() => ({
    week: [addDaysISO(today, -6), today],
    period: [period.start, today],
    month30: [addDaysISO(today, -29), today],
    month90: [addDaysISO(today, -89), today],
  }[range]), [range, today, period.start]);
  const stats = useSalesStats(profile?.id, from, to);
  const periodStats = useSalesStats(profile?.id, period.start, today);
  const outcomes = useOutcomes();
  const pay = usePayroll(profile?.id);
  const map = useMemo(() => outcomeMap(outcomes.data), [outcomes.data]);
  const s = stats.data;
  const t = s?.totals;
  const dailyTarget = employment?.daily_dial_target ?? 250;

  const workDaysOnly = (s?.daily ?? []).filter((d) => {
    const dow = parseISO(d.date).getDay();
    return dow !== 0 && dow !== 6;
  });

  return (
    <>
      <PageHeader
        title="Your analytics"
        sub="Only you (and your admin) can see these numbers."
        right={<Segmented value={range} onChange={setRange} options={[
          { value: 'week', label: '7 days' }, { value: 'period', label: 'This pay period' }, { value: 'month30', label: '30 days' }, { value: 'month90', label: '90 days' },
        ]} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Dialled" value={t ? count(t.dials) : '–'} sub={t ? `${t.work_days ? Math.round(t.dials / t.work_days) : 0} a day on average` : ' '} icon={<Headphones className="size-4" />} accent="#7C5CFF" />
        <Stat label="Connected" value={t ? count(t.connected) : '–'} sub={t && t.dials ? `${pct(t.connected / t.dials)} pick-up rate` : ' '} icon={<PhoneIncoming className="size-4" />} accent="#2FB98C" />
        <Stat label="Prospects" value={t ? count(t.prospects) : '–'} sub={t && t.connected ? `${pct(t.prospects / t.connected, 1)} of connects` : ' '} icon={<Sparkles className="size-4" />} accent="#5AB8FF" />
        <Stat label="Meetings" value={t ? count(t.meetings_booked) : '–'} sub={t ? `${t.meetings_held} held` : ' '} icon={<CalendarCheck className="size-4" />} accent="#F08A4B" />
        <Stat label="Closed" value={t ? usdShort(t.won_usd) : '–'} sub={t ? `${t.won_count} deal${t.won_count === 1 ? '' : 's'}` : ' '} icon={<Trophy className="size-4" />} accent="#30C46C" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader title="Numbers dialled per day" sub={`Your daily target is ${dailyTarget}. Hover a day for the detail.`} />
          {!s ? <Skeleton className="h-[230px]" /> : (
            <ColumnChart
              ariaLabel="Numbers dialled per working day"
              data={workDaysOnly.map((d) => ({
                key: d.date,
                label: format(parseISO(d.date), 'EEE d MMM'),
                value: d.dials,
                highlight: d.dials >= dailyTarget ? true : undefined,
                detail: [
                  { name: 'Connected', value: String(d.connected) },
                  { name: 'Prospects', value: String(d.prospects) },
                ],
              }))}
              reference={{ value: dailyTarget, label: `Target ${dailyTarget}` }}
              height={240}
            />
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Your funnel" sub="From the first dial to a signed deal" />
          {!t ? <Skeleton className="h-[230px]" /> : (
            <BarList
              rows={[
                { key: 'd', label: 'Dialled', value: t.dials },
                { key: 'c', label: 'Connected', value: t.connected, sub: step(t.connected, t.dials) },
                { key: 'p', label: 'Prospects', value: t.prospects, sub: step(t.prospects, t.connected, 1) },
                { key: 'm', label: 'Meetings booked', value: t.meetings_booked, sub: step(t.meetings_booked, t.prospects) },
                { key: 'w', label: 'Won', value: t.won_count, sub: step(t.won_count, t.meetings_booked) },
              ]}
              max={Math.max(1, t.dials)}
            />
          )}
          <p className="text-3 mt-4 text-[12px]">Percentages are the share of the step above.</p>
        </Panel>

        <Panel>
          <PanelHeader title="How your calls ended" sub="Every Done in the range" />
          {!s ? <Skeleton className="h-[280px]" /> : (
            <BarList
              rows={s.outcomes.map((o) => {
                const meta = map.get(o.outcome);
                return { key: o.outcome, label: meta?.label ?? o.outcome, value: o.count, dot: toneColor[OUTCOME_TONE[meta?.tone ?? 'neutral']], sub: t?.dials ? pct(o.count / t.dials) : '' };
              })}
            />
          )}
        </Panel>

        <div className="space-y-5">
          <Projection
            dailyTarget={dailyTarget}
            periodDials={periodStats.data?.totals.dials ?? 0}
            periodDays={periodStats.data?.totals.work_days ?? 0}
            periodEnd={period.end}
            weighted={periodStats.data?.totals.weighted_pipeline_usd ?? 0}
            pay={pay.data}
          />
        </div>

        <Panel>
          <PanelHeader title="Pipeline by stage" sub="All your live and closed deals" />
          {!s ? <Skeleton className="h-[200px]" /> : (
            <BarList
              rows={STAGES.map((st) => {
                const row = s.stages.find((x) => x.stage === st.key);
                return { key: st.key, label: st.label, value: Number(row?.amount ?? 0), valueLabel: usd(row?.amount ?? 0), sub: `${row?.count ?? 0} deals`, dot: st.color };
              })}
            />
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Forecast" sub="Open deals by expected close month" />
          {!s ? <Skeleton className="h-[200px]" /> : s.forecast.length === 0 ? (
            <p className="text-3 py-10 text-center text-[13px]">Add expected close dates to your deals to see a forecast.</p>
          ) : (
            <ForecastChart format={usdShort} data={s.forecast.map((f) => ({ label: format(parseISO(f.month), 'MMM'), total: Number(f.amount), weighted: Number(f.weighted) }))} />
          )}
        </Panel>
      </div>
    </>
  );
}

function Projection({
  dailyTarget, periodDials, periodDays, periodEnd, weighted, pay,
}: {
  dailyTarget: number; periodDials: number; periodDays: number; periodEnd: string; weighted: number;
  pay: ReturnType<typeof usePayroll>['data'];
}) {
  const today = localISO();
  const daysLeft = Math.max(0, differenceInCalendarDays(parseISO(periodEnd), parseISO(today)));
  const workLeft = Math.round((daysLeft * 5) / 7);
  const perDay = periodDays ? periodDials / periodDays : 0;
  const projectedDials = Math.round(periodDials + perDay * workLeft);
  const sales = pay?.sales;
  const closed = sales?.closed_usd ?? 0;
  const target = sales?.target_usd ?? 0;
  const likely = closed + weighted * 0.35;
  const tierLabel = { none: 'No target set', below: 'Below 30% — 30% of salary', base: 'Full salary', commission: 'Full salary + 25% commission' };

  return (
    <Panel strong>
      <PanelHeader title="Projection to pay day" sub={`Pay period ends ${format(parseISO(periodEnd), 'd MMM')} · about ${workLeft} work days left`} />
      <div className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold">Dials this period</span>
            <span className="tabular"><b>{count(periodDials)}</b><span className="text-3"> → ~{count(projectedDials)} at your pace</span></span>
          </div>
          <ProgressBar className="mt-2" value={periodDials} max={Math.max(1, (periodDays + workLeft) * dailyTarget)} />
          <div className="text-3 mt-1 text-[12px]">{Math.round(perDay)} a day now vs a {dailyTarget} target</div>
        </div>
        {target > 0 && (
          <div>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-semibold">Closed vs monthly target</span>
              <span className="tabular"><b>{usd(closed)}</b><span className="text-3"> of {usd(target)}</span></span>
            </div>
            <div className="fill relative mt-2 h-3 rounded-full">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (closed / target) * 100)}%`, background: closed >= target ? '#30C46C' : 'var(--viz-1)' }} />
              <div className="absolute -top-1 h-5 w-0.5 rounded bg-[color:var(--text-3)]" style={{ left: '30%' }} title="30% of target" />
            </div>
            <div className="text-3 mt-1 flex justify-between text-[11px] font-semibold"><span>30% line {usdShort(target * 0.3)}</span><span>Target {usdShort(target)}</span></div>
            <div className="fill mt-3 rounded-2xl px-3.5 py-2.5 text-[13px]">
              <div>Right now: <b>{tierLabel[sales?.tier ?? 'none']}</b></div>
              {pay && <div className="text-2 mt-0.5">Estimated pay so far: <b className="text-[color:var(--text)]">{pkr(pay.net_pkr)}</b>{sales && sales.commission_usd > 0 && <> incl. {usd(sales.commission_usd)} commission</>}</div>}
              {closed < target && <div className="text-2 mt-0.5">If a third of your weighted pipeline lands: ~<b className="text-[color:var(--text)]">{usd(likely)}</b>.</div>}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
