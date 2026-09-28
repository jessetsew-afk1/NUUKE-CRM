export const DAY = 86_400_000;

export const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Parses a YYYY-MM-DD string as a local calendar day. */
export function parseDay(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDay(value) {
  const d = parseDay(value);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
}

export function formatFullDay(value) {
  const d = parseDay(value);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function daysUntil(value) {
  const d = parseDay(value);
  return d ? Math.round((d - today()) / DAY) : null;
}

export function money(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = Number(n);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (abs >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

export const moneyFull = (n) =>
  n === null || n === undefined ? '' : `$${Number(n).toLocaleString('en-US')}`;

export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function relativeTime(value) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(then).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const sum = (list, pick) => list.reduce((total, item) => total + (Number(pick ? pick(item) : item) || 0), 0);

export function groupBy(list, pick) {
  const out = new Map();
  for (const item of list) {
    const key = pick(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

/** Near-black or white, whichever reads on the given fill. */
export function textOn(hex) {
  if (!hex || hex[0] !== '#') return '#fff';
  const channel = (i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(channel(0)) + 0.7152 * linear(channel(1)) + 0.0722 * linear(channel(2));
  return luminance > 0.42 ? '#111114' : '#FFFFFF';
}
