import { textOn } from '../lib/format.js';
import { DEPARTMENT_COLOR } from '../lib/palette.js';

export function Pill({ label, color, style }) {
  if (!label) return null;
  return (
    <span className="pill" style={{ background: color, color: textOn(color), ...style }}>
      {label}
    </span>
  );
}

/** Squads get an outline chip with a colour dot, keeping solid fills for status alone. */
export function DeptChip({ value }) {
  if (!value) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  return (
    <span className="chip">
      <i style={{ background: DEPARTMENT_COLOR[value] ?? 'var(--line-strong)' }} />
      {value}
    </span>
  );
}

export function Progress({ value, color }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <>
      <span className="prog">
        <i style={{ width: `${pct}%`, background: color ?? 'var(--text)' }} />
      </span>
      <span className="num" style={{ fontSize: 11.5, color: 'var(--text-2)', minWidth: 32, textAlign: 'right' }}>
        {Math.round(pct)}%
      </span>
    </>
  );
}

/** Time left against a support SLA, coloured by how close it is. */
export function SlaPill({ due }) {
  if (!due) return null;
  const hours = Math.round((new Date(due).getTime() - Date.now()) / 3_600_000);
  let color = '#00C875';
  let label;
  if (hours < 0) { color = '#E2445C'; label = `${Math.abs(hours)}h over`; }
  else if (hours < 4) { color = '#FF642E'; label = `in ${hours}h`; }
  else if (hours < 24) { color = '#FDAB3D'; label = `in ${hours}h`; }
  else label = `in ${Math.round(hours / 24)}d`;
  return (
    <span className="pill mono" style={{ background: color, color: textOn(color) }}>{label}</span>
  );
}

export function Stars({ value }) {
  const n = Number(value) || 0;
  if (!n) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  return (
    <span style={{ letterSpacing: 1, fontSize: 12 }} aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= n ? 'var(--text)' : 'var(--line-strong)' }}>★</span>
      ))}
    </span>
  );
}
