import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { KINDS, addMonths, buildReport, fmtValue, investorLedger, investorSummary, monthRange, periodLabel, type Kind } from '@/lib/finance';
import { Panel, PanelHeader } from '@/ui/kit';
import { MetricTile, MonthChart, SplitBar, Waterfall, show, useReport, useV } from './parts';

const SIMPLE = ['revenue', 'total_costs', 'net_profit', 'retained_profit', 'gross_margin', 'net_margin', 'cti', 'new_clients', 'cac', 'ltv_cac', 'free_cash_flow', 'cash'];
const PRO = ['revenue', 'gross_profit', 'ebitda', 'net_profit', 'gross_margin', 'ebitda_margin', 'net_margin', 'cti', 'revenue_growth', 'mrr',
  'cac', 'ltv', 'ltv_cac', 'cac_payback', 'churn', 'arpa', 'free_cash_flow', 'runway', 'break_even', 'roi', 'current_ratio', 'dso', 'utilization', 'revenue_per_agent'];

export function Overview() {
  const { mode, months, data } = useV();
  const r = useReport('company');
  const end = months[months.length - 1];
  const chartMonths = months.length >= 6 ? months : monthRange(addMonths(end, -11), end);
  const chart = useReport('company', chartMonths);
  const m = r.metrics;
  const prevM = r.prev;
  const compare: Record<string, number | null | undefined> = prevM ? {
    revenue: prevM.revenue, gross_profit: prevM.grossProfit, ebitda: prevM.ebitda, net_profit: prevM.netProfit,
    total_costs: prevM.costOfSales + prevM.opex + prevM.depreciation + prevM.interest + prevM.tax, free_cash_flow: prevM.freeCashFlow,
  } : {};
  const keys = mode === 'simple' ? SIMPLE : PRO;
  // Each tile's last 8 months, for its little trend line.
  const series = useMemo(() => {
    const ms = monthRange(addMonths(end, -7), end);
    const reps = ms.map((mm) => buildReport({ scope: 'company', months: [mm], entries: data.entries, stats: data.stats, categories: data.categories, investors: data.investors }));
    const used = reps.map((x) => !!(x.pnl.revenue || x.pnl.opex || x.pnl.costOfSales));
    return (k: string) => reps.map((x, i) => (used[i] ? x.metrics[k] ?? null : null));
  }, [end, data]);
  const empty = !data.entries.length;

  const spend: Kind[] = ['direct_cost', 'commission', 'salary', 'rent', 'marketing', 'software', 'expense', 'depreciation', 'interest', 'tax'];
  const p = r.pnl;
  const sentences = [
    `In ${periodLabel(months)} the company brought in ${show(p.revenue)} and spent ${show(m.total_costs)}, so it ${p.netProfit >= 0 ? 'made' : 'lost'} ${show(Math.abs(p.netProfit))}.`,
    m.gross_margin != null ? `Of every $1 earned, ${Math.round((1 - (m.gross_margin ?? 0)) * 100)} cents went straight into doing and selling the work, and ${Math.round((m.net_margin ?? 0) * 100)} cents ended as profit.` : null,
    m.cti != null ? `It cost ${Math.round((m.cti ?? 0) * 100)} cents to earn each $1 (cost-to-income).` : null,
    m.cac != null ? `Each new client cost about ${show(m.cac)} to win${m.ltv != null ? ` and is worth about ${show(m.ltv)} in profit over their time with us` : ''}.` : null,
    r.investorShares ? `Investors earned ${show(r.investorShares)} from their teams; the company kept ${show(m.retained_profit)}.` : null,
    m.runway != null ? `At this pace cash lasts about ${fmtValue(m.runway, 'months')}.` : m.cash != null ? `Cash in the bank: ${show(m.cash)}.` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {empty && (
        <Panel className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-iris" />
          <div className="text-[14px]">
            <div className="font-bold">Start here</div>
            <div className="text-2 mt-0.5">Add each month's money in <b>Money in & out</b> (revenue, salaries, rent, commissions, taxes…) and the counts in <b>Monthly numbers</b> (agents, leads, clients, cash). Every figure, ratio and investor account on these pages fills itself from those.</div>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <Panel className="relative overflow-hidden">
          <div className="pointer-events-none absolute -left-10 -top-10 size-40 rounded-full bg-iris opacity-15 blur-3xl" />
          <PanelHeader title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-iris" />In plain words</span>} sub={periodLabel(months)} />
          <ul className="relative space-y-2.5 text-[14.5px] leading-relaxed">
            {sentences.map((s) => <li key={s} className="flex gap-2.5"><span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[linear-gradient(135deg,#7C5CFF,#5AB8FF)]" /><span>{s}</span></li>)}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Where every dollar went" sub="From what came in to what was left" />
          <Waterfall p={p} kinds={r.kinds} />
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {keys.map((k, i) => <MetricTile key={k} k={k} value={m[k]} compare={compare[k]} big={i < 4} series={series(k)} />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader title="Month by month" sub={`${periodLabel(chartMonths)} · revenue and costs as bars, net profit as the line`} />
          <MonthChart rows={chart.byMonth.filter((_, i) => i >= chart.byMonth.findIndex((y) => y.pnl.revenue || y.pnl.costOfSales || y.pnl.opex))} />
        </Panel>
        <Panel>
          <PanelHeader title="Costs by kind" sub={`${show(m.total_costs)} in total`} />
          <SplitBar parts={spend.map((k) => ({ label: KINDS[k].label, value: r.kinds[k], color: KINDS[k].color }))} />
        </Panel>
      </div>

      {data.investors.length > 0 && <InvestorStrip />}
    </div>
  );
}

function InvestorStrip() {
  const { data, months } = useV();
  const end = months[months.length - 1];
  const set = new Set(months);
  return (
    <Panel>
      <PanelHeader title="Investors at a glance" sub="Their share for this period and their account to date" />
      <div className="scroll-x">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead className="text-3 text-left text-[11.5px] font-bold uppercase tracking-wide">
            <tr><th className="py-2">Investor</th><th>Share</th><th className="text-right">Earned this period</th><th className="text-right">Invested</th><th className="text-right">Earned to date</th><th className="text-right">Paid</th><th className="text-right">Owed now</th><th className="text-right">ROI</th></tr>
          </thead>
          <tbody>
            {data.investors.map((inv) => {
              const L = investorLedger(inv, data.entries, data.stats, end);
              const s = investorSummary(inv, L);
              const period = L.filter((x) => set.has(x.month)).reduce((a, x) => a + x.share, 0);
              return (
                <tr key={inv.id} className="border-t border-[color:var(--hairline,rgba(127,127,127,.15))]">
                  <td className="py-2 font-bold"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: inv.color ?? '#7C5CFF' }} />{inv.name}</td>
                  <td>{inv.share_pct}%</td>
                  <td className="tabular text-right">{show(period)}</td>
                  <td className="tabular text-right">{show(s.invested)}</td>
                  <td className="tabular text-right">{show(s.earned)}</td>
                  <td className="tabular text-right">{show(s.paid)}</td>
                  <td className="tabular text-right font-bold">{show(s.owed)}</td>
                  <td className="tabular text-right">{fmtValue(s.roi, 'pct')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
