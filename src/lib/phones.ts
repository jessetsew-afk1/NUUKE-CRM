/**
 * Phone numbers as they arrive from the lead sheet: often two or three in one cell,
 * split by "/", ",", ";", "or", new lines — or nothing but spaces.
 */

const digitsOf = (s: string) => s.replace(/\D/g, '');

/** "+1 555 123 4567 / (555) 987-6543" → ["+1 555 123 4567", "(555) 987-6543"] */
export function splitPhones(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(/\s*(?:[/,;|\n\\]|\s(?:or|and|&)\s|\balt[:.]?|\bmobile[:.]?|\bcell[:.]?|\bhome[:.]?|\bwork[:.]?|\boffice[:.]?)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const part of parts) {
    const d = digitsOf(part).length;
    if (d < 6) continue; // a stray word or an extension fragment
    if (d <= 15) { out.push(part); continue; }
    // Several numbers separated only by spaces: start a new one at a "+" or once
    // the current one has ten digits.
    let cur: string[] = [];
    let n = 0;
    const flush = () => { if (cur.length && n >= 6) out.push(cur.join(' ')); cur = []; n = 0; };
    for (const t of part.split(/\s+/)) {
      const td = digitsOf(t).length;
      if ((t.startsWith('+') && n >= 7) || (n >= 10 && td > 0)) flush();
      cur.push(t);
      n += td;
    }
    flush();
  }
  const seen = new Set<string>();
  const unique = out.filter((p) => {
    const k = digitsOf(p).slice(-10);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.length ? unique : [raw.trim()];
}

/** How several numbers are stored back in the one phone field. */
export const joinPhones = (list: string[]) => list.map((p) => p.trim()).filter(Boolean).join(' / ');

const DIAL_CODES: Record<string, string> = {
  'united states': '1', usa: '1', us: '1', canada: '1', 'united kingdom': '44', uk: '44', england: '44', scotland: '44',
  australia: '61', 'united arab emirates': '971', uae: '971', pakistan: '92', india: '91', 'new zealand': '64',
  ireland: '353', germany: '49', france: '33', 'saudi arabia': '966', qatar: '974', singapore: '65', 'south africa': '27',
};

/** A dialable +E.164 number, using the lead's country when the number has no code. */
export function toE164(phone: string, country?: string | null) {
  const raw = phone.trim().replace(/\s*(?:ext\.?|extension|x|#)\s*\d{1,6}\s*$/i, ''); // extensions are dialled after connecting
  let d = digitsOf(raw);
  if (raw.startsWith('+')) return `+${d}`;
  if (d.startsWith('00')) return `+${d.slice(2)}`;
  const code = DIAL_CODES[(country ?? '').trim().toLowerCase()];
  if (code && code !== '1') {
    if (d.startsWith(code) && d.length > 10) return `+${d}`;
    if (d.startsWith('0')) d = d.slice(1);
    return `+${code}${d}`;
  }
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return `+${d}`;
}

/** Zoom Phone's click-to-call link (opens the Zoom desktop app on that one number). */
export const zoomCallHref = (phone: string, country?: string | null) => `zoomphonecall://${encodeURIComponent(toE164(phone, country))}`;
