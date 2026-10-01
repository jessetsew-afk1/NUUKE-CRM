import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pkr0 = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-US');

export const usd = (n: number | null | undefined) => usd0.format(Number(n ?? 0));
export const pkr = (n: number | null | undefined) => `Rs ${pkr0.format(Math.round(Number(n ?? 0)))}`;
export const count = (n: number | null | undefined) => num.format(Number(n ?? 0));

/** $1.2k / $34k / $1.4M — for tight spaces. */
export function usdShort(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(v >= 100_000 ? 0 : v >= 10_000 ? 0 : 1)}k`;
  return `$${Math.round(v)}`;
}

export const pct = (n: number | null | undefined, digits = 0) => `${(Number(n ?? 0) * 100).toFixed(digits)}%`;

const toDate = (d: string | Date) => (typeof d === 'string' ? parseISO(d) : d);

export const day = (d: string | Date | null | undefined) => (d ? format(toDate(d), 'd MMM yyyy') : '—');
export const dayShort = (d: string | Date | null | undefined) => (d ? format(toDate(d), 'd MMM') : '—');
export const time = (d: string | Date | null | undefined) => (d ? format(toDate(d), 'h:mm a') : '—');
export const dateTime = (d: string | Date | null | undefined) => (d ? format(toDate(d), 'd MMM, h:mm a') : '—');

/** "Today, 9:30 PM" / "Tomorrow, 2:00 PM" / "Mon 6 Oct, 11:00 AM" */
export function friendly(d: string | Date | null | undefined) {
  if (!d) return '—';
  const v = toDate(d);
  const t = format(v, 'h:mm a');
  if (isToday(v)) return `Today, ${t}`;
  if (isTomorrow(v)) return `Tomorrow, ${t}`;
  if (isYesterday(v)) return `Yesterday, ${t}`;
  return format(v, 'EEE d MMM, h:mm a');
}

export const ago = (d: string | Date | null | undefined) =>
  d ? formatDistanceToNowStrict(toDate(d), { addSuffix: true }) : '—';

/** 3725 → "1:02:05" */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** 3725 → "1h 2m" */
export function duration(seconds: number) {
  const m = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

export const initials = (name: string | null | undefined) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export const firstName = (name: string | null | undefined) => (name ?? '').split(/\s+/)[0] ?? '';

/** YYYY-MM-DD in the company's timezone (Asia/Karachi). */
export function localISO(d: Date = new Date(), tz = 'Asia/Karachi') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A datetime-local input value for an instant, in the browser's timezone. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The pay period (20th → 19th) that contains a date. */
export function payPeriod(iso: string, cutoff = 20) {
  const [y, m, d] = iso.split('-').map(Number);
  const start = d >= cutoff ? new Date(Date.UTC(y, m - 1, cutoff)) : new Date(Date.UTC(y, m - 2, cutoff));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, cutoff - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night shift';
}
