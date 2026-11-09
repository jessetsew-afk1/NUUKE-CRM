import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';
import { animate, motion } from 'framer-motion';
import type { VaultData } from '@/data/vault';
import {
  addMonths, buildReport, fmtValue, type Report, metricDef, monthKey, monthLabel, monthRange, type Fmt, type PnL,
} from '@/lib/finance';
import { Picker, Segmented, spring } from '@/ui/kit';

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

/** Each group of metrics has its own colour, so the page reads at a glance. */
export const GROUP_COLOR: Record<string, string> = {
  'Profit & loss': '#30C46C', Margins: '#7C5CFF', Growth: '#00C2D1', 'Clients & sales': '#FF9F43',
  'Team & productivity': '#54A0FF', 'Cash & liquidity': '#1DD1A1', 'Returns & balance sheet': '#F368E0', Tax: '#EE5253',
};

/** A number that counts up to its value. */
export function CountUp({ value, fmt, className }: { value: number | null | undefined; fmt: Fmt; className?: string }) {
  const [shown, setShown] = useState<number | null>(value ?? null);
  const last = useRef<number>(0);
  useEffect(() => {
    if (value == null || !Number.isFinite(value)) { setShown(null); return; }
    const from = last.current; last.current = value;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    const c = animate(from, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(v) });
    return () => c.stop();
  }, [value]);
  return <span className={className}>{fmtValue(shown, fmt)}</span>;
}

/** A tiny trend line. */
export function Sparkline({ values, color, height = 34, className }: { values: (number | null)[]; color: string; height?: number; className?: string }) {
  const pts = values.map((v) => (v == null || !Number.isFinite(v) ? null : v));
  const real = pts.filter((v): v is number => v != null);
  if (real.length < 2) return null;
  const min = Math.min(...real); const max = Math.max(...real);
  const w = 120; const h = height; const span = max - min || 1;
  const xy = pts.map((v, i) => (v == null ? null : [(i / (pts.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const)).filter(Boolean) as (readonly [number, number])[];
  const id = `sp${color.replace('#', '')}${real.length}`;
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={clsx('block w-full', className)} style={{ height }} aria-hidden>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${xy[xy.length - 1][0]},${h} L${xy[0][0]},${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={2.6} fill={color} />
    </svg>
  );
}

/** A metric from the registry, as a tile: coloured by its group, counting up, with its recent trend. */
export function MetricTile({ k, value, compare, big, className, series }: {
  k: string; value: number | null | undefined; compare?: number | null; big?: boolean; className?: string; series?: (number | null)[];
}) {
  const { mode } = useV();
  const d = metricDef(k);
  if (!d) return null;
  const color = GROUP_COLOR[d.group] ?? '#7C5CFF';
  const delta = compare != null && value != null && compare !== 0 ? (value - compare) / Math.abs(compare) : null;
  const good = delta == null || !d.better ? null : d.better === 'higher' ? delta >= 0 : delta <= 0;
  return (
    <motion.div whileHover={{ y: -3 }} transition={spring}
      className={clsx('glass group relative overflow-hidden rounded-[22px] p-4', className)}>
      <div className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full opacity-[.22] blur-2xl transition-opacity group-hover:opacity-40" style={{ background: color }} />
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div className="text-2 relative flex items-start gap-1 text-[11.5px] font-bold uppercase leading-tight tracking-wide">
        <span className="line-clamp-2">{d.name}{d.abbr && mode === 'pro' && !d.name.toUpperCase().includes(d.abbr.toUpperCase()) ? ` · ${d.abbr}` : ''}</span>
        <Def text={d.def} formula={mode === 'pro' ? d.formula : undefined} good={d.good} />
      </div>
      <div className="relative mt-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
        <CountUp value={value} fmt={d.fmt}
          className={clsx('tabular font-display font-extrabold leading-none tracking-tight', big ? 'text-[26px] sm:text-[32px]' : 'text-[22px] sm:text-[24px]', value == null && 'text-3', value != null && value < 0 && d.fmt === 'usd' && 'text-bad')} />
        {delta != null && (
          <span className={clsx('mb-0.5 flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-extrabold', good ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad')}>
            {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{fmtValue(Math.abs(delta), 'pct')}
          </span>
        )}
      </div>
      {series && <Sparkline className="relative mt-2" values={series} color={color} height={big ? 38 : 28} />}
      {value == null && d.needs && <div className="text-3 relative mt-2 text-[11.5px]">Needs: {d.needs}</div>}
      {mode === 'simple' && value != null && <div className="text-3 relative mt-2 line-clamp-2 text-[12px] leading-snug">{d.def}</div>}
    </motion.div>
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

/* ================================================================ waterfall */
/** Revenue at the top, each cost taking its bite, net profit at the end. */
export function Waterfall({ p, kinds }: { p: PnL; kinds: Record<string, number> }) {
  const steps: { label: string; value: number; color: string; total?: boolean }[] = [
    { label: 'Revenue', value: p.revenue, color: '#30C46C', total: true },
    { label: 'Delivery & commissions', value: -p.costOfSales, color: '#FF9F43' },
    { label: 'Salaries', value: -kinds.salary, color: '#7C5CFF' },
    { label: 'Rent & office', value: -kinds.rent, color: '#54A0FF' },
    { label: 'Marketing', value: -kinds.marketing, color: '#00C2D1' },
    { label: 'Tools & other', value: -(kinds.software + kinds.expense), color: '#A29BFE' },
    { label: 'Interest, depreciation', value: -(kinds.depreciation + kinds.interest - kinds.other_income), color: '#8395A7' },
    { label: 'Tax', value: -kinds.tax, color: '#EE5253' },
    { label: 'Net profit', value: p.netProfit, color: p.netProfit >= 0 ? '#1DD1A1' : '#EE5253', total: true },
  ].filter((s) => s.total || Math.abs(s.value) >= 0.005);
  const top = Math.max(1, p.revenue, ...steps.map((s) => Math.abs(s.value)));
  const floor = Math.min(0, p.netProfit);
  const span = top - floor || 1;
  let run = 0;
  const bars = steps.map((s) => {
    let a: number; let b: number;
    if (s.total) { a = 0; b = s.value; run = s.value; } else { a = run; b = run + s.value; run = b; }
    return { ...s, lo: Math.min(a, b), hi: Math.max(a, b) };
  });
  const pct = (v: number) => ((v - floor) / span) * 100;
  return (
    <div className="space-y-2">
      {bars.map((b, i) => (
        <div key={b.label} className="grid grid-cols-[132px_1fr_88px] items-center gap-3 text-[12.5px] sm:grid-cols-[170px_1fr_96px]">
          <span className={clsx('truncate', b.total ? 'font-extrabold' : 'text-2')}>{b.label}</span>
          <div className="fill relative h-[22px] overflow-hidden rounded-lg">
            <motion.div className="absolute inset-y-0 rounded-lg" style={{ background: b.total ? `linear-gradient(90deg, ${b.color}, ${b.color}cc)` : b.color, left: `${pct(b.lo)}%` }}
              initial={{ width: 0 }} animate={{ width: `${Math.max(0.6, pct(b.hi) - pct(b.lo))}%` }} transition={{ duration: 0.7, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }} />
          </div>
          <span className={clsx('tabular text-right', b.total ? 'font-extrabold' : 'font-semibold', b.value < 0 && !b.total && 'text-2')}>
            {b.value < 0 && !b.total ? '−' : ''}{fmtValue(Math.abs(b.value), 'usd')}
          </span>
        </div>
      ))}
    </div>
  );
}
