import { clamp, sum } from '../lib/format.js';

/** Horizontal bars for magnitude. One hue; the label carries identity. */
export function MiniBars({ rows, format }) {
  if (!rows.length) return <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 13 }}>Nothing to show yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="mini">
      {rows.map((r, i) => (
        <div className="mini-r" key={`${r.label}-${i}`}>
          <span className="n" title={r.label}>{r.label}</span>
          <span className="bar">
            <i style={{ width: `${clamp((r.value / max) * 100, 0, 100)}%`, background: r.color ?? 'var(--ramp-5)' }} />
          </span>
          <span className="v">{format ? format(r.value) : r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Proportions of a whole, with a 2px gap so adjacent fills stay distinct. */
export function StackBar({ segments }) {
  const total = Math.max(1, sum(segments, (s) => s.value));
  return (
    <div className="sumbar" style={{ width: '100%', height: 12 }}>
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <i key={`${s.label}-${i}`} title={`${s.label}: ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="lg">
      {items.map((i, index) => (
        <span key={`${i.label}-${index}`}>
          <i style={{ background: i.color }} />
          {i.label}
          {i.value != null && <b style={{ fontVariantNumeric: 'tabular-nums' }}>&nbsp;{i.value}</b>}
        </span>
      ))}
    </div>
  );
}

/** Vertical bars with the value printed above each — never colour alone. */
export function ColumnChart({ data, height = 150, ariaLabel }) {
  if (!data.length) return null;
  const width = Math.max(260, data.length * 54);
  const pad = { top: 22, right: 6, bottom: 26, left: 6 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const band = (width - pad.left - pad.right) / data.length;
  const barWidth = Math.max(14, band - 16);

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={ariaLabel}>
      <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="var(--line)" strokeWidth="1" />
      {data.map((d, i) => {
        const x = pad.left + (i + 0.5) * band;
        const h = Math.max(2, (d.value / max) * (height - pad.top - pad.bottom));
        const y = height - pad.bottom - h;
        return (
          <g key={`${d.label}-${i}`}>
            <rect x={x - barWidth / 2} y={y} width={barWidth} height={h} rx="4" fill={d.color ?? 'var(--ramp-5)'}>
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            <text x={x} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text)">{d.value}</text>
            <text x={x} y={height - pad.bottom + 15} textAnchor="middle" fontSize="10.5" fill="var(--text-3)">{d.short ?? d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Two-series line, used for the sprint burndown. Ideal is a dashed reference. */
export function LineChart({ series, labels, height = 190, unit = '', ariaLabel }) {
  if (!labels.length) return null;
  const width = 560;
  const pad = { top: 14, right: 12, bottom: 26, left: 34 };
  const max = Math.max(1, ...series.flatMap((s) => s.data.filter((v) => v != null)));
  const x = (i) => pad.left + (labels.length === 1 ? 0 : i * ((width - pad.left - pad.right) / (labels.length - 1)));
  const y = (v) => height - pad.bottom - (v / max) * (height - pad.top - pad.bottom);
  const ticks = [0, Math.round(max / 2), max];
  const step = Math.ceil(labels.length / 7);

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={ariaLabel}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} y1={y(t)} x2={width - pad.right} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
          <text x={pad.left - 7} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-3)">{t}</text>
        </g>
      ))}
      {labels.map((label, i) =>
        labels.length <= 8 || i % step === 0 || i === labels.length - 1 ? (
          <text key={label + i} x={x(i)} y={height - pad.bottom + 15} textAnchor="middle" fontSize="10" fill="var(--text-3)">
            {label}
          </text>
        ) : null
      )}
      {series.map((s) => {
        const points = s.data.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
        if (!points.length) return null;
        const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
        const last = points[points.length - 1];
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
            {!s.dashed && <circle cx={last[0]} cy={last[1]} r="4.5" fill={s.color} stroke="var(--paper)" strokeWidth="2" />}
            {!s.dashed && points.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="9" fill="transparent">
                <title>{`${labels[i]}: ${s.data.filter((v) => v != null)[i]} ${unit}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** A single-hue ramp for magnitude, with over-capacity breaking out to the status red. */
export function heatCell(ratio) {
  if (ratio == null) return { background: 'var(--sunk)', color: 'var(--text-3)' };
  if (ratio > 1) return { background: 'var(--bad)', color: '#fff' };
  const steps = ['var(--ramp-1)', 'var(--ramp-2)', 'var(--ramp-3)', 'var(--ramp-4)', 'var(--ramp-5)'];
  const i = clamp(Math.floor(ratio * 5), 0, 4);
  return { background: steps[i], color: i >= 3 ? 'var(--paper)' : 'var(--text-2)' };
}
