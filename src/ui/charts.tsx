/**
 * Small, quiet charts in plain SVG/HTML. Thin marks with 4px rounded data-ends,
 * hairline grids, a hover layer on every mark, and values that are always also
 * readable without hovering (tip labels or the tooltip-free summary beside them).
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  /** Extra rows shown in the tooltip. */
  detail?: { name: string; value: string }[];
  highlight?: boolean;
}

/** One series of columns, with an optional reference line (e.g. the daily target). */
export function ColumnChart({
  data, height = 220, reference, format = (n) => n.toLocaleString(), color = 'var(--viz-1)', ariaLabel,
}: {
  data: ColumnDatum[];
  height?: number;
  reference?: { value: number; label: string };
  format?: (n: number) => string;
  color?: string;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(reference?.value ?? 0, ...data.map((d) => d.value)) * 1.08);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const plotH = height - 26;
  const y = (v: number) => plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(data.length / 10);

  return (
    <div className="relative" style={{ height }} role="img" aria-label={ariaLabel}>
      <div className="absolute inset-0 left-10">
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t" style={{ top: y(t), borderColor: 'var(--viz-grid)' }} />
        ))}
        {reference && reference.value <= max && (
          <div className="absolute inset-x-0 z-10 border-t-[1.5px]" style={{ top: y(reference.value), borderColor: 'var(--text-3)' }}>
            <span className="text-2 absolute -top-[18px] right-0 rounded-md bg-[var(--glass-strong)] px-1.5 text-[11px] font-bold">{reference.label}</span>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-end" style={{ height: plotH }}>
          {data.map((d, i) => {
            const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * plotH);
            return (
              <div
                key={d.key}
                className="relative flex h-full flex-1 cursor-default items-end justify-center"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((c) => (c === i ? null : c))}
                tabIndex={0}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: h }}
                  transition={{ type: 'spring', stiffness: 200, damping: 26, delay: Math.min(i, 30) * 0.012 }}
                  className="w-[62%] max-w-[24px] rounded-t-[4px]"
                  style={{ background: color, opacity: hover === null || hover === i ? (d.highlight === false ? 0.45 : 1) : 0.4 }}
                />
                {hover === i && (
                  <div className="glass-strong pointer-events-none absolute bottom-[calc(100%+6px)] z-20 min-w-[130px] -translate-y-0 rounded-2xl px-3 py-2 text-left" style={{ bottom: h + 10 }}>
                    <div className="tabular text-[16px] font-extrabold leading-tight">{format(d.value)}</div>
                    <div className="text-3 text-[12px] font-semibold">{d.label}</div>
                    {d.detail?.map((r) => (
                      <div key={r.name} className="mt-1 flex justify-between gap-3 text-[12px]">
                        <span className="text-2">{r.name}</span><b className="tabular">{r.value}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[20px]">
          {data.map((d, i) => (
            <div key={d.key} className="text-3 flex-1 truncate text-center text-[11px] font-medium">
              {i % labelEvery === 0 ? d.label.split(' ').slice(0, 2).join(' ') : ''}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-y-0 left-0 w-9" style={{ height: plotH }}>
        {ticks.map((t) => (
          <div key={t} className="text-3 tabular absolute right-1 -translate-y-1/2 text-[11px]" style={{ top: y(t) }}>
            {t >= 1000 ? `${Math.round(t / 100) / 10}k` : Math.round(t)}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  valueLabel?: string;
  sub?: string;
  dot?: string;
}

/** Horizontal bars with the value at the tip. One hue: these are magnitudes. */
export function BarList({ rows, color = 'var(--viz-1)', max: forcedMax }: { rows: BarRow[]; color?: string; max?: number }) {
  const max = forcedMax ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.key} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              {r.dot && <span className="size-2 shrink-0 rounded-full" style={{ background: r.dot }} />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="tabular shrink-0">
              <b>{r.valueLabel ?? r.value.toLocaleString()}</b>
              {r.sub && <span className="text-3 ml-1.5 text-[12px]">{r.sub}</span>}
            </span>
          </div>
          <div className="fill h-2 overflow-hidden rounded-full">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ type: 'spring', stiffness: 160, damping: 24, delay: i * 0.04 }}
              className="h-full rounded-full group-hover:brightness-110"
              style={{ background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Months ahead: the full open value as a wash, the likely (weighted) part solid. */
export function ForecastChart({ data, height = 200, format }: { data: { label: string; total: number; weighted: number }[]; height?: number; format: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.map((d) => d.total)) * 1.05);
  const plotH = height - 26;
  return (
    <div>
      <div className="text-2 mb-3 flex items-center gap-4 text-[12px] font-semibold">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: 'var(--viz-1)' }} />Likely (weighted)</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: 'var(--viz-wash)', boxShadow: 'inset 0 0 0 1px var(--viz-1)' }} />If everything closes</span>
      </div>
      <div className="relative flex items-end gap-2" style={{ height: plotH }}>
        {data.map((d, i) => (
          <div key={d.label} className="relative flex h-full flex-1 flex-col items-center justify-end" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            {hover === i && (
              <div className="glass-strong pointer-events-none absolute z-20 rounded-2xl px-3 py-2 text-[12px]" style={{ bottom: (d.total / max) * plotH + 10 }}>
                <div className="tabular text-[15px] font-extrabold">{format(d.weighted)}</div>
                <div className="text-3">likely in {d.label}</div>
                <div className="text-2 mt-1">of <b className="tabular">{format(d.total)}</b> open</div>
              </div>
            )}
            <div className="text-2 tabular mb-1 text-[11px] font-bold">{d.weighted > 0 ? format(d.weighted) : ''}</div>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: Math.max(d.total ? 4 : 0, (d.total / max) * plotH - 18) }}
              transition={{ type: 'spring', stiffness: 180, damping: 24, delay: i * 0.05 }}
              className="relative w-full max-w-[44px] overflow-hidden rounded-t-[6px]"
              style={{ background: 'var(--viz-wash)' }}
            >
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${d.total ? (d.weighted / d.total) * 100 : 0}%` }}
                transition={{ type: 'spring', stiffness: 180, damping: 24, delay: 0.15 + i * 0.05 }}
                className="absolute inset-x-0 bottom-0 rounded-t-[4px]"
                style={{ background: 'var(--viz-1)' }}
              />
            </motion.div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {data.map((d) => <div key={d.label} className="text-3 flex-1 text-center text-[11px] font-semibold">{d.label}</div>)}
      </div>
    </div>
  );
}

/** A thin sparkline for stat tiles. */
export function Sparkline({ values, width = 120, height = 34, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const path = useMemo(() => {
    if (values.length < 2) return '';
    const max = Math.max(1, ...values);
    const step = width / (values.length - 1);
    return values.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${(height - 3 - (v / max) * (height - 6)).toFixed(1)}`).join(' ');
  }, [values, width, height]);
  if (!path) return null;
  return (
    <svg width={width} height={height} className={clsx('overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--viz-1)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--viz-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${width} ${height} L0 ${height} Z`} fill={`url(#sp-${id})`} />
      <path d={path} fill="none" stroke="var(--viz-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
