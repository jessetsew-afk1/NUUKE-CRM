import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';
import type { VaultData } from '@/data/vault';
import {
  addMonths, buildReport, fmtValue, type Report, metricDef, monthKey, monthLabel, monthRange, type Fmt, type PnL,
} from '@/lib/finance';
import { Picker, Segmented } from '@/ui/kit';

/* ================================================================ context */
export type Mode = 'simple' | 'pro';
export type PeriodPreset = 'month' | 'quarter' | 'ytd' | '12m' | 'all' | 'custom';
export interface Period { preset: PeriodPreset; from: string; to: string }
export interface VaultCtx {
  data: VaultData; mode: Mode; period: Period; months: string[];
  setPeriod: (p: Period) => void; setMode: (m: Mode) => void;
  /** Every month that has anything in it, plus this month: what pickers offer. */
  knownMonths: string[];
}
export const Ctx = createContext<VaultCtx | null>(null);
export const useV = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('Vault context missing');
  return c;
};

export const thisMonth = () => monthKey(new Date());
export function periodMonths(p: Period, known: string[]): string[] {
  const now = thisMonth();
  switch (p.preset) {
    case 'month': return [p.to];
    case 'quarter': { const q = Math.floor((Number(p.to.slice(5, 7)) - 1) / 3) * 3 + 1; const s = `${p.to.slice(0, 4)}-${String(q).padStart(2, '0')}-01`; return monthRange(s, addMonths(s, 2)); }
    case 'ytd': return monthRange(`${p.to.slice(0, 4)}-01-01`, p.to);
    case '12m': return monthRange(addMonths(p.to, -11), p.to);
    case 'all': return known.length ? monthRange(known[0], known[known.length - 1] > now ? known[known.length - 1] : now) : [now];
    default: return p.from <= p.to ? monthRange(p.from, p.to) : monthRange(p.to, p.from);
  }
}

export function useKnownMonths(data: VaultData | undefined) {
  return useMemo(() => {
    const s = new Set<string>([thisMonth()]);
    data?.entries.forEach((e) => s.add(e.month));
    data?.stats.forEach((x) => s.add(x.month));
    return [...s].sort();
  }, [data]);
}

/** Months to offer in a month picker: two years back to a year ahead, plus anything with data. */
export function monthOptions(known: string[]) {
  const now = thisMonth();
  const s = new Set([...known, ...monthRange(addMonths(now, -24), addMonths(now, 12))]);
  return [...s].sort().reverse().map((m) => ({ value: m, label: monthLabel(m, true) }));
}

export function PeriodBar() {
  const { period, setPeriod, mode, setMode, knownMonths } = useV();
  const opts = monthOptions(knownMonths);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="scroll-x no-scrollbar max-w-full">
      <Segmented<PeriodPreset> className="whitespace-nowrap" size="sm" value={period.preset} onChange={(preset) => setPeriod({ ...period, preset })}
        options={[
          { value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'ytd', label: 'Year to date' },
          { value: '12m', label: '12 months' }, { value: 'all', label: 'All time' }, { value: 'custom', label: 'Custom' },
        ]} />
      </div>
      {period.preset === 'custom' && (
        <Picker className="w-[170px]" value={period.from} onChange={(from) => setPeriod({ ...period, from })} options={opts} />
      )}
      {period.preset !== 'all' && (
        <Picker className="w-[170px]" value={period.to} onChange={(to) => setPeriod({ ...period, to })} options={opts} />
      )}
      <div className="ml-auto" />
      <Segmented<Mode> size="sm" value={mode} onChange={setMode}
        options={[{ value: 'simple', label: 'Simple' }, { value: 'pro', label: 'Pro' }]} />
    </div>
  );
}

/* ============================================================ definitions */
/** A little ⓘ that shows what a term means. */
export function Def({ text, formula, good, className }: { text: ReactNode; formula?: string; good?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={clsx('relative inline-flex', className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="What is this?" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="text-3 grid size-5 place-items-center rounded-full hover:text-[color:var(--text)]">
        <Info className="size-3.5" />
      </button>
      {open && (
        <span className="glass-strong absolute left-1/2 top-6 z-50 w-[280px] -translate-x-1/2 rounded-2xl p-3 text-left text-[12.5px] font-medium normal-case leading-snug tracking-normal shadow-xl">
          <span className="block">{text}</span>
          {formula && <span className="text-2 mt-1.5 block font-mono text-[11.5px]">= {formula}</span>}
          {good && <span className="mt-1.5 block text-[11.5px] font-semibold text-ok">Benchmark: {good}</span>}
        </span>
      )}
    </span>
  );
}

/** A metric from the registry, as a tile. */
export function MetricTile({ k, value, compare, big, className }: { k: string; value: number | null | undefined; compare?: number | null; big?: boolean; className?: string }) {
  const { mode } = useV();
  const d = metricDef(k);
  if (!d) return null;
  const delta = compare != null && value != null && compare !== 0 ? (value - compare) / Math.abs(compare) : null;
  const good = delta == null || !d.better ? null : d.better === 'higher' ? delta >= 0 : delta <= 0;
  return (
    <div className={clsx('glass relative rounded-[22px] p-4', className)}>
      <div className="text-2 flex items-start gap-1 text-[12px] font-semibold uppercase leading-tight tracking-wide">
        <span className="line-clamp-2">{d.name}{d.abbr && mode === 'pro' && !d.name.toUpperCase().includes(d.abbr.toUpperCase()) ? ` · ${d.abbr}` : ''}</span>
        <Def text={d.def} formula={mode === 'pro' ? d.formula : undefined} good={d.good} />
      </div>
      <div className={clsx('tabular mt-2 font-display font-extrabold leading-none tracking-tight', big ? 'text-[32px]' : 'text-[24px]', value != null && value < 0 && d.fmt === 'usd' && 'text-bad')}>
        {fmtValue(value, d.fmt)}
      </div>
      {delta != null && (
        <div className={clsx('mt-2 flex items-center gap-1 text-[12px] font-bold', good ? 'text-ok' : 'text-bad')}>
          {delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {fmtValue(delta, 'pct')} vs previous
        </div>
      )}
      {value == null && d.needs && <div className="text-3 mt-2 text-[11.5px]">Needs: {d.needs}</div>}
      {mode === 'simple' && value != null && <div className="text-3 mt-2 text-[12px] leading-snug">{d.def}</div>}
    </div>
  );
}

export const show = (v: number | null | undefined, f: Fmt = 'usd') => fmtValue(v, f);

/* ================================================================ charts */
/** Revenue, costs and profit per month as bars, with the net profit line. */
export function MonthChart({ rows, height = 220 }: { rows: { month: string; pnl: PnL }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, setBox] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setBox(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  if (!rows.length) return <div className="text-3 py-10 text-center text-[13px]">Nothing recorded yet.</div>;
  const costs = (p: PnL) => p.costOfSales + p.opex + p.depreciation + p.interest + p.tax;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.pnl.revenue, costs(r.pnl), Math.abs(r.pnl.netProfit))));
  const minNet = Math.min(0, ...rows.map((r) => r.pnl.netProfit));
  const top = 12; const bottom = 26; const h = height - top - bottom;
  const scale = (v: number) => (v / (max - minNet)) * h;
  const zero = top + scale(max);
  const w = Math.max(box || 320, rows.length * 44);
  const bw = Math.min(18, (w / rows.length - 14) / 2);
  return (
    <div className="relative" ref={ref}>
      <div className="scroll-x no-scrollbar">
        <svg width={w} height={height} className="block min-w-full" role="img" aria-label="Revenue, costs and net profit by month">
          <line x1={0} x2={w} y1={zero} y2={zero} stroke="var(--line, rgba(127,127,127,.25))" />
          {rows.map((r, i) => {
            const cx = (i + 0.5) * (w / rows.length);
            const rev = scale(Math.max(0, r.pnl.revenue)); const cost = scale(costs(r.pnl));
            return (
              <g key={r.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={cx - w / rows.length / 2} y={0} width={w / rows.length} height={height} fill="transparent" />
                <rect x={cx - bw - 1} y={zero - rev} width={bw} height={rev} rx={4} fill="#30C46C" opacity={hover == null || hover === i ? 1 : 0.45} />
                <rect x={cx + 1} y={zero - cost} width={bw} height={cost} rx={4} fill="#FF9F43" opacity={hover == null || hover === i ? 1 : 0.45} />
                <text x={cx} y={height - 8} textAnchor="middle" className="fill-[color:var(--text-3,#888)] text-[10.5px] font-semibold">{monthLabel(r.month).replace(' 20', " '")}</text>
              </g>
            );
          })}
          <polyline fill="none" stroke="#7C5CFF" strokeWidth={2.5} strokeLinejoin="round"
            points={rows.map((r, i) => `${(i + 0.5) * (w / rows.length)},${zero - scale(r.pnl.netProfit)}`).join(' ')} />
          {rows.map((r, i) => (
            <circle key={r.month} cx={(i + 0.5) * (w / rows.length)} cy={zero - scale(r.pnl.netProfit)} r={hover === i ? 5 : 3.5} fill="#7C5CFF" />
          ))}
        </svg>
      </div>
      <div className="text-2 mt-2 flex flex-wrap gap-4 text-[12px] font-semibold">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#30C46C]" />Revenue</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#FF9F43]" />Costs</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#7C5CFF]" />Net profit</span>
      </div>
      {hover != null && rows[hover] && (
        <div className="glass-strong pointer-events-none absolute right-2 top-0 rounded-2xl px-3 py-2 text-[12px] shadow-lg">
          <div className="font-bold">{monthLabel(rows[hover].month, true)}</div>
          <div className="tabular">Revenue {show(rows[hover].pnl.revenue)}</div>
          <div className="tabular">Costs {show(costs(rows[hover].pnl))}</div>
          <div className="tabular font-bold">Net {show(rows[hover].pnl.netProfit)}</div>
        </div>
      )}
    </div>
  );
}

/** A horizontal split bar (where the money went). */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  if (!total) return <div className="text-3 text-[13px]">Nothing recorded yet.</div>;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${show(p.value)}`} />
        ))}
      </div>
      <div className="mt-3 grid gap-y-1.5">
        {parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value).map((p) => (
          <div key={p.label} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="flex min-w-0 items-center gap-2"><i className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} /><span className="truncate">{p.label}</span></span>
            <span className="tabular shrink-0 font-semibold">{show(p.value)} <span className="text-3 font-medium">{fmtValue(p.value / total, 'pct')}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One statement line: label, ⓘ, amount. */
export function Line({ label, value, def, strong, indent, negative, sub }: {
  label: ReactNode; value: number | null | undefined; def?: string; strong?: boolean; indent?: boolean; negative?: boolean; sub?: ReactNode;
}) {
  const v = value ?? 0;
  return (
    <div className={clsx('flex items-center justify-between gap-3 py-2', strong ? 'border-t border-[color:var(--hairline,rgba(127,127,127,.18))] text-[15px] font-extrabold' : 'text-[14px]', indent && 'pl-4')}>
      <span className="flex min-w-0 items-center gap-1">
        <span className={clsx('truncate', !strong && 'text-2')}>{label}</span>
        {def && <Def text={def} />}
        {sub && <span className="text-3 text-[12px]">{sub}</span>}
      </span>
      <span className={clsx('tabular shrink-0', v < 0 && 'text-bad')}>{negative && v ? `(${show(Math.abs(v))})` : show(v)}</span>
    </div>
  );
}

/* ================================================================ report */
/** Everything worked out for the company (or one investor) over the chosen months. */
export function useReport(scope: 'company' | number, monthsOverride?: string[]): Report {
  const { data, months } = useV();
  const ms = monthsOverride ?? months;
  return useMemo(() => buildReport({
    scope, months: ms, entries: data.entries, stats: data.stats, categories: data.categories, investors: data.investors,
    taxRate: data.settings.tax_rate != null ? Number(data.settings.tax_rate) / 100 : undefined,
  }), [scope, ms, data]);
}
