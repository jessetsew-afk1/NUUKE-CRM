import { Fragment, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { KINDS, kindTotals, monthLabel, periodLabel, pnl, statFor, type Kind, type PnL } from '@/lib/finance';
import { Panel, PanelHeader } from '@/ui/kit';
import { Def, Line, show, useReport, useV } from './parts';

type Row =
  | { type: 'kind'; kind: Kind; sign: 1 | -1 }
  | { type: 'total'; label: string; key: keyof PnL; def: string; big?: boolean };

const ROWS: Row[] = [
  { type: 'kind', kind: 'revenue', sign: 1 },
  { type: 'kind', kind: 'refund', sign: -1 },
  { type: 'total', label: 'Net revenue', key: 'revenue', def: 'Revenue after refunds and chargebacks.' },
  { type: 'kind', kind: 'direct_cost', sign: -1 },
  { type: 'kind', kind: 'commission', sign: -1 },
  { type: 'total', label: 'Gross profit', key: 'grossProfit', def: 'Net revenue minus the cost of doing and selling the work.' },
  { type: 'kind', kind: 'salary', sign: -1 },
  { type: 'kind', kind: 'rent', sign: -1 },
  { type: 'kind', kind: 'marketing', sign: -1 },
  { type: 'kind', kind: 'software', sign: -1 },
  { type: 'kind', kind: 'expense', sign: -1 },
  { type: 'total', label: 'EBITDA (operating profit before depreciation)', key: 'ebitda', def: 'Gross profit minus operating expenses.' },
  { type: 'kind', kind: 'depreciation', sign: -1 },
  { type: 'total', label: 'Operating profit (EBIT)', key: 'ebit', def: 'EBITDA minus depreciation & amortisation.' },
  { type: 'kind', kind: 'interest', sign: -1 },
  { type: 'kind', kind: 'other_income', sign: 1 },
  { type: 'total', label: 'Profit before tax', key: 'ebt', def: 'Operating profit minus interest plus other income.' },
  { type: 'kind', kind: 'tax', sign: -1 },
  { type: 'total', label: 'Net profit', key: 'netProfit', def: 'The bottom line: what is left after every cost and tax.', big: true },
];

export function Statements() {
  const { mode } = useV();
  return (
    <div className="space-y-4">
      <ProfitAndLoss scope="company" detailed={mode === 'pro'} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CashFlow />
        <BalanceSheet />
      </div>
    </div>
  );
}

/** The P&L for the company or one investor's team. In detail, a column per month with type breakdowns. */
export function ProfitAndLoss({ scope, detailed, title }: { scope: 'company' | number; detailed: boolean; title?: string }) {
  const { data, months } = useV();
  const r = useReport(scope);
  const [open, setOpen] = useState<Set<Kind>>(new Set());
  // A column per month (from the first month with anything in it), when looking at more than one month.
  const firstUsed = months.findIndex((m) => data.entries.some((e) => e.month === m && (scope === 'company' || e.investor_id === scope)));
  const cols = detailed && months.length > 1 && months.length <= 24 && firstUsed >= 0 ? months.slice(firstUsed) : [];
  const cats = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);
  const set = useMemo(() => new Set(months), [months]);
  const inScope = (inv: number | null) => scope === 'company' || inv === scope;

  // Per-type breakdown for a kind: { name -> { month -> amount } }
  const breakdown = (kind: Kind) => {
    const out = new Map<string, Map<string, number>>();
    for (const e of data.entries) {
      if (e.kind !== kind || !set.has(e.month) || !inScope(e.investor_id)) continue;
      const name = (e.category_id && cats.get(e.category_id)) || e.label || 'Other';
      const m = out.get(name) ?? new Map<string, number>();
      m.set(e.month, (m.get(e.month) ?? 0) + Number(e.amount));
      out.set(name, m);
    }
    return [...out.entries()].sort((a, b) => sum(b[1]) - sum(a[1]));
  };
  const monthPnl = useMemo(() => new Map(cols.map((m) => [m, pnl(kindTotals(data.entries, [m], scope))])), [cols, data.entries, scope]);
  const monthKinds = useMemo(() => new Map(cols.map((m) => [m, kindTotals(data.entries, [m], scope)])), [cols, data.entries, scope]);

  const cell = (v: number, sign = 1, strong = false) => (
    <td className={clsx('tabular whitespace-nowrap px-2 py-2 text-right', strong && 'font-extrabold', v * sign < 0 && 'text-bad')}>
      {v ? (sign < 0 ? `(${show(v)})` : show(v)) : <span className="text-3">—</span>}
    </td>
  );

  return (
    <Panel>
      <PanelHeader title={title ?? 'Profit & loss statement'} sub={`${periodLabel(months)} · in USD${detailed ? ' · click a line to see its types' : ''}`} />
      <div className="scroll-x">
        <table className="w-full text-[13.5px]" style={{ minWidth: cols.length ? 260 + cols.length * 96 : undefined }}>
          {cols.length > 0 && (
            <thead className="text-3 text-[11.5px] font-bold uppercase tracking-wide">
              <tr>
                <th className="sticky left-0 bg-[var(--glass-solid,transparent)] py-2 text-left" />
                {cols.map((m) => <th key={m} className="whitespace-nowrap px-2 text-right">{monthLabel(m)}</th>)}
                <th className="px-2 text-right text-[color:var(--text)]">Total</th>
              </tr>
            </thead>
          )}
          <tbody>
            {ROWS.map((row) => {
              if (row.type === 'total') {
                return (
                  <tr key={`t-${row.key}`} className={clsx('border-t border-[color:var(--hairline,rgba(127,127,127,.2))]', row.big && 'bg-[var(--fill)]')}>
                    <td className={clsx('py-2 pr-3 font-extrabold', row.big && 'text-[15px]')}>
                      <span className="flex items-center gap-1">{row.label}<Def text={row.def} /></span>
                    </td>
                    {cols.map((m) => <Fragment key={m}>{cell(monthPnl.get(m)![row.key], 1, true)}</Fragment>)}
                    {cell(r.pnl[row.key], 1, true)}
                  </tr>
                );
              }
              const k = KINDS[row.kind];
              const total = r.kinds[row.kind];
              if (!total && !cols.some((m) => monthKinds.get(m)![row.kind])) {
                if (!detailed) return null;
              }
              const isOpen = open.has(row.kind);
              const parts = detailed && isOpen ? breakdown(row.kind) : [];
              return (
                <Fragment key={row.kind}>
                  <tr className={clsx(detailed && 'cursor-pointer hover:bg-[var(--fill)]')} onClick={() => detailed && setOpen((s) => { const n = new Set(s); if (n.has(row.kind)) n.delete(row.kind); else n.add(row.kind); return n; })}>
                    <td className="text-2 py-2 pl-3 pr-3">
                      <span className="flex items-center gap-1">
                        {detailed && <ChevronRight className={clsx('size-3.5 transition-transform', isOpen && 'rotate-90')} />}
                        {row.sign < 0 ? 'Less: ' : ''}{k.label}<Def text={k.plain} />
                      </span>
                    </td>
                    {cols.map((m) => <Fragment key={m}>{cell(monthKinds.get(m)![row.kind], row.sign)}</Fragment>)}
                    {cell(total, row.sign)}
                  </tr>
                  {parts.map(([name, byMonth]) => (
                    <tr key={name} className="text-3 text-[12.5px]">
                      <td className="py-1 pl-10 pr-3">{name}</td>
                      {cols.map((m) => <td key={m} className="tabular px-2 text-right">{byMonth.get(m) ? show(byMonth.get(m)) : '—'}</td>)}
                      <td className="tabular px-2 text-right">{show(sum(byMonth))}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {scope === 'company' && r.investorShares > 0 && (
              <>
                <tr><td className="text-2 py-2 pl-3">Less: investors' profit shares<Def className="ml-1" text="What investors earned from their teams under their agreements." /></td>{cols.map((m) => <td key={m} />)}{cell(r.investorShares, -1)}</tr>
                <tr className="border-t border-[color:var(--hairline,rgba(127,127,127,.2))]"><td className="py-2 font-extrabold">Profit kept by the company</td>{cols.map((m) => <td key={m} />)}{cell(r.metrics.retained_profit ?? 0, 1, true)}</tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

function CashFlow() {
  const { months } = useV();
  const r = useReport('company');
  const p = r.pnl;
  return (
    <Panel>
      <PanelHeader title="Cash flow statement" sub={`${periodLabel(months)} · where cash came from and went`} />
      <div className="text-3 mb-1 text-[11.5px] font-bold uppercase tracking-wide">Operating</div>
      <Line label="Net profit" value={p.netProfit} />
      <Line label="Add back depreciation" value={p.depreciation} def="Depreciation is a cost on paper only: no cash left this month for it." indent />
      <Line label="Cash from operations" value={p.operatingCashFlow} strong def="Cash the day-to-day business produced." />
      <div className="text-3 mb-1 mt-3 text-[11.5px] font-bold uppercase tracking-wide">Investing</div>
      <Line label="Equipment & assets bought" value={-p.capex} indent def="Laptops, furniture and other long-lasting purchases." />
      <Line label="Free cash flow" value={p.freeCashFlow} strong def="Cash left after running the business and buying equipment." />
      <div className="text-3 mb-1 mt-3 text-[11.5px] font-bold uppercase tracking-wide">Financing</div>
      <Line label="Investment received" value={p.capitalIn} indent />
      <Line label="Capital returned to investors" value={-p.capitalOut} indent />
      <Line label="Profit share paid to investors" value={-p.payouts} indent />
      <Line label="Net change in cash" value={p.netCashFlow} strong def="How much the cash pile grew or shrank over the period." />
    </Panel>
  );
}

function BalanceSheet() {
  const { data, months } = useV();
  const r = useReport('company');
  const end = months[months.length - 1];
  const g = (k: string) => statFor(data.stats, end, 'company', k);
  const cash = g('cash'); const ar = g('receivables'); const oa = g('other_assets'); const fa = g('fixed_assets');
  const ap = g('payables'); const ol = g('other_liabilities'); const debt = g('debt');
  const assets = (cash ?? 0) + (ar ?? 0) + (oa ?? 0) + (fa ?? 0);
  const liabilities = (ap ?? 0) + (ol ?? 0) + (debt ?? 0);
  const recorded = [cash, ar, oa, fa, ap, ol, debt].some((x) => x != null);
  const equityBook = r.metrics.equity ?? 0;
  const capital = data.entries.filter((e) => e.month <= end && e.kind === 'capital_in').reduce((a, e) => a + Number(e.amount), 0)
    - data.entries.filter((e) => e.month <= end && e.kind === 'capital_out').reduce((a, e) => a + Number(e.amount), 0);
  return (
    <Panel>
      <PanelHeader title="Balance sheet" sub={`At the end of ${monthLabel(end, true)}`} />
      {!recorded ? (
        <p className="text-2 text-[13.5px]">Add the month-end cash, money owed to us, bills we owe and loans in <b>Monthly numbers</b> to see the balance sheet.</p>
      ) : (
        <>
          <div className="text-3 mb-1 text-[11.5px] font-bold uppercase tracking-wide">What we own (assets)</div>
          <Line label="Cash in bank" value={cash} indent />
          <Line label="Owed to us (receivables)" value={ar} indent />
          <Line label="Other short-term assets" value={oa} indent />
          <Line label="Equipment (book value)" value={fa} indent />
          <Line label="Total assets" value={assets} strong />
          <div className="text-3 mb-1 mt-3 text-[11.5px] font-bold uppercase tracking-wide">What we owe (liabilities)</div>
          <Line label="Bills we owe (payables)" value={ap} indent />
          <Line label="Other short-term debts" value={ol} indent />
          <Line label="Loans" value={debt} indent />
          <Line label="Total liabilities" value={liabilities} strong />
          <Line label="Net assets (assets − liabilities)" value={assets - liabilities} strong def="What the company is worth on these numbers: everything owned minus everything owed." />
        </>
      )}
      <div className="text-3 mb-1 mt-3 text-[11.5px] font-bold uppercase tracking-wide">Equity from the books</div>
      <Line label="Investor capital (net of returns)" value={capital} indent />
      <Line label="Retained earnings" value={equityBook - capital} indent def="All net profit to date minus everything paid out to investors." />
      <Line label="Book equity" value={equityBook} strong />
      {recorded && Math.abs(assets - liabilities - equityBook) >= 1 && (
        <p className="text-3 mt-2 text-[12px]">
          Net assets and book equity differ by {show(assets - liabilities - equityBook)}. That usually means some money moved that is not in the ledger yet (e.g. an owner draw, an old balance or a missing month).
        </p>
      )}
    </Panel>
  );
}
