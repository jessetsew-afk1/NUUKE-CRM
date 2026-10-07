import Papa from 'papaparse';
import { strFromU8, unzipSync } from 'fflate';
import type { ColumnRole, FillField } from '@/lib/types';

export type Cell = string | number | boolean | Date | null;

/** One tab of a workbook: its cells, plus what Excel knows about each column. */
export interface Tab {
  name: string;
  rows: Cell[][];
  /** Dropdown choices set on a column (Data → Data validation → List). */
  lists: Map<number, string[]>;
  /** Columns whose cells are worked out by a formula. */
  formulas: Set<number>;
  /** Columns that only accept numbers. */
  numbers: Set<number>;
}

export const text = (v: Cell | undefined) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

/** Every tab of an Excel file (or the one table in a CSV). */
export async function readWorkbook(file: File): Promise<Tab[]> {
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    const rows = Papa.parse<string[]>(await file.text(), { skipEmptyLines: 'greedy' }).data as Cell[][];
    return [{ name: file.name.replace(/\.[^.]+$/, ''), rows, lists: new Map(), formulas: new Set(), numbers: new Set() }];
  }
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = (await readXlsxFile(file)) as unknown as { sheet: string; data: Cell[][] }[];
  let extras = new Map<string, Omit<Tab, 'name' | 'rows'>>();
  try {
    extras = readExtras(new Uint8Array(await file.arrayBuffer()), sheets);
  } catch { /* the cell values are what matter; dropdowns are a bonus */ }
  return sheets.map((s) => ({ name: s.sheet, rows: s.data, ...(extras.get(s.sheet) ?? { lists: new Map(), formulas: new Set(), numbers: new Set() }) }));
}

const colIndex = (letters: string) => [...letters.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function readExtras(buf: Uint8Array, sheets: { sheet: string; data: Cell[][] }[]) {
  const files = unzipSync(buf, { filter: (f) => f.name === 'xl/workbook.xml' || f.name === 'xl/_rels/workbook.xml.rels' || f.name.startsWith('xl/worksheets/') });
  const parse = (path: string) => (files[path] ? new DOMParser().parseFromString(strFromU8(files[path]), 'application/xml') : null);
  const all = (doc: Document | Element, tag: string) => Array.from(doc.getElementsByTagNameNS('*', tag));
  const wb = parse('xl/workbook.xml');
  const rels = parse('xl/_rels/workbook.xml.rels');
  const out = new Map<string, Omit<Tab, 'name' | 'rows'>>();
  if (!wb || !rels) return out;

  const target = new Map(all(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']));
  const values = new Map(sheets.map((s) => [s.sheet, s.data]));

  for (const sh of all(wb, 'sheet')) {
    const name = sh.getAttribute('name') ?? '';
    const rid = sh.getAttribute('r:id') ?? sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const t = target.get(rid);
    if (!t) continue;
    const doc = parse(t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`);
    if (!doc) continue;
    const lists = new Map<number, string[]>();
    const numbers = new Set<number>();
    const formulas = new Set<number>();

    for (const dv of all(doc, 'dataValidation')) {
      const type = dv.getAttribute('type');
      const sqref = dv.getAttribute('sqref') ?? all(dv, 'sqref')[0]?.textContent ?? '';
      const cols = sqref.split(/\s+/).flatMap((ref) => {
        const m = ref.match(/^\$?([A-Z]+)\$?\d*(?::\$?([A-Z]+)\$?\d*)?$/i);
        if (!m) return [];
        const a = colIndex(m[1]);
        const b = m[2] ? colIndex(m[2]) : a;
        return Array.from({ length: Math.max(0, b - a) + 1 }, (_, i) => a + i);
      });
      if (type === 'list') {
        const options = listOptions(all(dv, 'formula1')[0]?.textContent ?? '', name, values);
        if (options.length) cols.forEach((c) => lists.set(c, options));
      } else if (type === 'decimal' || type === 'whole') {
        cols.forEach((c) => numbers.add(c));
      }
    }
    for (const c of all(doc, 'c')) {
      if (!all(c, 'f').length) continue;
      const m = (c.getAttribute('r') ?? '').match(/^([A-Z]+)(\d+)$/i);
      if (m && +m[2] > 1) formulas.add(colIndex(m[1]));
    }
    out.set(name, { lists, numbers, formulas });
  }
  return out;
}

/** A dropdown's choices: a typed list ("Yes,No"), or a range of cells in the workbook. */
function listOptions(formula: string, sheet: string, values: Map<string, Cell[][]>): string[] {
  const f = formula.trim();
  if (f.startsWith('"')) return [...new Set(f.replace(/^"|"$/g, '').split(',').map((x) => x.trim()).filter(Boolean))];
  const m = f.match(/^(?:'?([^'!]+)'?!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i);
  if (!m) return [];
  const data = values.get(m[1] ?? sheet);
  if (!data) return [];
  const c1 = colIndex(m[2]);
  const c2 = m[4] ? colIndex(m[4]) : c1;
  const r1 = +m[3] - 1;
  const r2 = m[5] ? +m[5] - 1 : r1;
  const opts: string[] = [];
  for (let r = r1; r <= Math.min(r2, data.length - 1); r++) {
    for (let c = c1; c <= c2; c++) {
      const v = text(data[r]?.[c]);
      if (v && !opts.includes(v)) opts.push(v);
    }
  }
  return opts.slice(0, 40);
}

/* ------------------------------------------------------------------ reading a cold call sheet */
/** The header is the first row with at least three filled cells. */
export function tableOf(tab: Tab | undefined) {
  if (!tab) return { header: [] as string[], body: [] as Cell[][] };
  const hi = tab.rows.findIndex((r) => r.filter((c) => text(c)).length >= 3);
  if (hi < 0) return { header: [] as string[], body: [] as Cell[][] };
  const width = Math.max(...tab.rows.slice(hi).map((r) => r.length));
  const header = Array.from({ length: width }, (_, i) => text(tab.rows[hi][i]));
  const body = tab.rows.slice(hi + 1).filter((r) => r.some((c) => text(c)));
  return { header, body };
}

/** The tab that holds the list: the one with the most rows that look like table rows. */
export function bestTab(tabs: Tab[]) {
  let best = 0;
  let score = -1;
  tabs.forEach((t, i) => {
    const { header, body } = tableOf(t);
    const phoneCol = header.some((h) => PHONE_RE.test(h)) ? 1000 : 0;
    const s = body.filter((r) => r.filter((c) => text(c)).length >= 3).length + phoneCol;
    if (s > score) { score = s; best = i; }
  });
  return best;
}

const PHONE_RE = /phone|mobile|\btel\b|telephone|\bcell\b/i;
const NAME_EXACT = /^(business|business name|company|company name|practice|clinic|organi[sz]ation|account|account name|name)$/i;
const NAME_LOOSE = /business|company|practice|clinic|organi[sz]ation|brand/i;
const EMAIL_RE = /e-?mail/i;
const CONTACT_RE = /owner|contact|decision|person|manager|director|ask for/i;
const PRIORITY_RE = /priority|tier|grade/i;
const REF_RE = /^(#|no\.?|id|ref|row)$/i;
/** Columns the dialer's own call log already covers. */
const LOGGED_RE = /date called|call date|called on|call outcome|^outcome$|^result$|call notes?|^notes?$|next step|follow.?up/i;
const NUMBER_RE = /\(\$\)|\$|\/ ?(week|month|day)|per (week|month|day)|how many|number of|count|value|amount|price|revenue/i;

/** A first guess at what each column is for. */
export function guessRoles(tab: Tab, header: string[], body: Cell[][]): ColumnRole[] {
  const roles: ColumnRole[] = header.map(() => 'show');
  const filled = header.map((_, i) => body.some((r) => text(r[i])));
  const taken = new Set<ColumnRole>();
  const claim = (role: ColumnRole, test: (h: string, i: number) => boolean) => {
    if (taken.has(role)) return;
    const i = header.findIndex((h, ix) => roles[ix] === 'show' && filled[ix] && test(h, ix));
    if (i >= 0) { roles[i] = role; taken.add(role); }
  };
  header.forEach((h, i) => {
    if (filled[i]) return;
    roles[i] = !h || tab.formulas.has(i) ? 'skip' : LOGGED_RE.test(h) ? 'logged' : 'fill';
  });
  claim('name', (h) => NAME_EXACT.test(h.trim()));
  claim('phone', (h) => PHONE_RE.test(h));
  claim('email', (h) => EMAIL_RE.test(h));
  claim('contact', (h) => CONTACT_RE.test(h));
  claim('priority', (h) => PRIORITY_RE.test(h));
  claim('ref', (h) => REF_RE.test(h.trim()));
  claim('name', (h) => NAME_LOOSE.test(h));
  claim('name', (h) => /name/i.test(h));
  header.forEach((h, i) => { if (!h && roles[i] === 'show') roles[i] = 'skip'; });
  return roles;
}

export function fillFieldsFrom(tab: Tab, header: string[], roles: ColumnRole[]): FillField[] {
  return roles.flatMap((r, i) => {
    if (r !== 'fill') return [];
    const label = header[i] || `Column ${i + 1}`;
    const options = tab.lists.get(i);
    return [options?.length ? { label, options } : { label, number: tab.numbers.has(i) || NUMBER_RE.test(label) }];
  });
}

/** The notes on a "How to use" (or guide, instructions, script) tab, as plain lines. */
export function instructionsFrom(tabs: Tab[], skip: number) {
  const parts = tabs.flatMap((t, i) => {
    if (i === skip || !/how|guide|instruction|read ?me|script|tips|playbook/i.test(t.name)) return [];
    const lines = t.rows.map((r) => r.map((c) => text(c)).filter(Boolean).join('  '));
    return [lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()];
  });
  return parts.filter(Boolean).join('\n\n');
}
