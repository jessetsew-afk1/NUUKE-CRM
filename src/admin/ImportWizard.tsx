import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import Papa from 'papaparse';
import { ArrowLeft, ArrowRight, Check, Download, FileSpreadsheet, Shuffle, Upload, User, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { rpc } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Chip, Picker, ProgressBar, Segmented, Sheet, Switch } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { count } from '@/lib/format';

/* ------------------------------------------------------------------ fields */
type FieldKey =
  | 'lead_date' | 'platform' | 'country' | 'name' | 'personal_email' | 'work_email' | 'phone' | 'post_link' | 'query'
  | 'service' | 'assigned' | 'status' | 'comments' | 'f1' | 'f2' | 'f3' | 'f4';

const FIELDS: { key: FieldKey; label: string; match: RegExp; hint?: string }[] = [
  { key: 'lead_date', label: 'Date', match: /^(date|lead date|received|created)/i },
  { key: 'platform', label: 'Platform', match: /platform|source/i },
  { key: 'country', label: 'Country', match: /country|location/i },
  { key: 'name', label: 'Name', match: /^(name|full name|client|customer|lead name)/i },
  { key: 'personal_email', label: 'Personal email', match: /personal.?e-?mail|^e-?mail$/i },
  { key: 'work_email', label: 'Work email', match: /work.?e-?mail|business.?e-?mail/i },
  { key: 'phone', label: 'Phone', match: /phone|mobile|number|contact/i },
  { key: 'post_link', label: 'Post link', match: /post|link|url/i },
  { key: 'query', label: 'Query', match: /query|details|requirement|message|description/i },
  { key: 'service', label: 'Service', match: /service|category/i },
  { key: 'assigned', label: 'Assigned to', match: /assign|owner|agent|rep/i, hint: 'used if you assign from the sheet' },
  { key: 'status', label: 'Status (old)', match: /^status/i, hint: 'kept as a note' },
  { key: 'comments', label: 'Comments (old)', match: /comment|note/i, hint: 'kept as a note' },
  { key: 'f1', label: '1st follow-up (old)', match: /^1(st)?\s*follow/i },
  { key: 'f2', label: '2nd follow-up (old)', match: /^2(nd)?\s*follow/i },
  { key: 'f3', label: '3rd follow-up (old)', match: /^3(rd)?\s*follow/i },
  { key: 'f4', label: '4th follow-up (old)', match: /^4(th)?\s*follow/i },
];

type Cell = string | number | boolean | Date | null;
type DateMode = 'auto' | 'mdy' | 'dmy';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);

export function parseDate(v: Cell, mode: DateMode): string | null {
  if (v === null || v === '' || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    // An Excel serial day.
    if (v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 86_400_000); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [a, b, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
    if (mode === 'dmy' || (mode === 'auto' && a > 12)) return iso(y, b, a);
    return iso(y, a, b);
  }
  const t = Date.parse(s);
  if (!isNaN(t)) { const d = new Date(t); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  return null;
}

const text = (v: Cell) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

/* ------------------------------------------------------------------ wizard */
type Assign = 'none' | 'single' | 'round_robin' | 'sheet';

export function ImportWizard({ open, onClose, reps }: { open: boolean; onClose: () => void; reps: Profile[] }) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Cell[][]>([]);
  const [header, setHeader] = useState<string[]>([]);
  const [map, setMap] = useState<Partial<Record<FieldKey, number>>>({});
  const [dateMode, setDateMode] = useState<DateMode>('auto');
  const [assign, setAssign] = useState<Assign>('round_robin');
  const [single, setSingle] = useState<string | null>(null);
  const [rr, setRr] = useState<string[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [skipDupes, setSkipDupes] = useState(false);
  const [progress, setProgress] = useState<{ done: number; inserted: number; duplicates: number; invalid: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const reset = () => {
    setStep(0); setFileName(''); setRows([]); setHeader([]); setMap({}); setProgress(null); setError(null);
  };

  const close = () => { if (progress && progress.done < rows.length) return; reset(); onClose(); };

  const load = useCallback(async (file: File) => {
    setError(null);
    try {
      let data: Cell[][];
      if (/\.(xlsx|xlsm)$/i.test(file.name)) {
        // The first worksheet in the workbook.
        const { readSheet } = await import('read-excel-file/browser');
        data = (await readSheet(file)) as unknown as Cell[][];
      } else {
        const textContent = await file.text();
        data = Papa.parse<string[]>(textContent, { skipEmptyLines: 'greedy' }).data as Cell[][];
      }
      // The header is the first row with at least three filled cells.
      const hi = data.findIndex((r) => r.filter((c) => text(c)).length >= 3);
      if (hi < 0) throw new Error('Could not find a header row in that file');
      const h = data[hi].map((c) => text(c));
      const body = data.slice(hi + 1).filter((r) => r.some((c) => text(c)));
      const auto: Partial<Record<FieldKey, number>> = {};
      const used = new Set<number>();
      for (const f of FIELDS) {
        const i = h.findIndex((name, idx) => !used.has(idx) && f.match.test(name));
        if (i >= 0) { auto[f.key] = i; used.add(i); }
      }
      setFileName(file.name);
      setHeader(h);
      setRows(body);
      setMap(auto);
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const get = (r: Cell[], k: FieldKey) => (map[k] === undefined ? '' : text(r[map[k]!]));

  const parsed = useMemo(() => rows.map((r) => {
    const followups = (['f1', 'f2', 'f3', 'f4'] as const).map((k) => get(r, k)).filter(Boolean);
    const legacy: Record<string, unknown> = {};
    if (get(r, 'comments')) legacy.comments = get(r, 'comments');
    if (get(r, 'status')) legacy.status = get(r, 'status');
    if (get(r, 'assigned')) legacy.assigned = get(r, 'assigned');
    if (followups.length) legacy.followups = followups;
    return {
      lead_date: map.lead_date === undefined ? null : parseDate(r[map.lead_date], dateMode),
      platform: get(r, 'platform') || null,
      country: get(r, 'country') || null,
      name: get(r, 'name'),
      personal_email: get(r, 'personal_email') || null,
      work_email: get(r, 'work_email') || null,
      phone: get(r, 'phone') || null,
      post_link: get(r, 'post_link') || null,
      query: get(r, 'query') || null,
      service: get(r, 'service') || null,
      sheetAssigned: get(r, 'assigned'),
      legacy: Object.keys(legacy).length ? legacy : null,
    };
  }), [rows, map, dateMode]);

  const stats = useMemo(() => ({
    total: parsed.length,
    phone: parsed.filter((p) => p.phone).length,
    email: parsed.filter((p) => p.personal_email || p.work_email).length,
    dated: parsed.filter((p) => p.lead_date).length,
    services: new Set(parsed.map((p) => p.service).filter(Boolean)).size,
    blank: parsed.filter((p) => !p.name.trim() && !p.phone && !p.personal_email && !p.work_email).length,
  }), [parsed]);

  const sheetNames = useMemo(() => [...new Set(parsed.map((p) => p.sheetAssigned).filter(Boolean))].sort(), [parsed]);

  // Match "Zoya" / "Zoya Malik" in the sheet to a rep automatically.
  const autoNameMap = useMemo(() => {
    const out: Record<string, string> = {};
    for (const n of sheetNames) {
      const lower = n.toLowerCase();
      const rep = reps.find((r) => r.full_name.toLowerCase() === lower)
        ?? reps.find((r) => r.full_name.toLowerCase().split(' ')[0] === lower.split(' ')[0]);
      if (rep) out[n] = rep.id;
    }
    return out;
  }, [sheetNames, reps]);

  const ownerFor = (p: (typeof parsed)[number], i: number): string | null => {
    switch (assign) {
      case 'single': return single;
      case 'round_robin': return rr.length ? rr[i % rr.length] : null;
      case 'sheet': {
        const v = nameMap[p.sheetAssigned] ?? autoNameMap[p.sheetAssigned];
        return v && v !== '__none' ? v : null;
      }
      default: return null;
    }
  };

  const run = async () => {
    setError(null);
    setStep(3);
    const total = parsed.length;
    setProgress({ done: 0, inserted: 0, duplicates: 0, invalid: 0 });
    try {
      const importId = await rpc<number>('start_lead_import', { p_file_name: fileName, p_total: total });
      let acc = { done: 0, inserted: 0, duplicates: 0, invalid: 0 };
      const CHUNK = 1000;
      for (let i = 0; i < total; i += CHUNK) {
        const chunk = parsed.slice(i, i + CHUNK).map((p, j) => {
          const { sheetAssigned: _s, ...row } = p;
          void _s;
          return { ...row, assigned_to: ownerFor(p, i + j) };
        });
        const res = await rpc<{ inserted: number; duplicates: number; invalid: number }>('import_leads', { p_import_id: importId, p_rows: chunk as never, p_skip_duplicates: skipDupes });
        acc = { done: Math.min(total, i + CHUNK), inserted: acc.inserted + res.inserted, duplicates: acc.duplicates + res.duplicates, invalid: acc.invalid + res.invalid };
        setProgress(acc);
      }
      await rpc('finish_lead_import', { p_import_id: importId });
      celebrate('big');
      toast({ title: `${count(acc.inserted)} leads imported`, body: [acc.invalid ? `${count(acc.invalid)} blank rows removed` : '', acc.duplicates ? `${count(acc.duplicates)} duplicates skipped` : ''].filter(Boolean).join(' · ') || undefined, tone: 'celebrate' });
      void qc.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const canNext = step === 1 ? map.name !== undefined || map.phone !== undefined : step === 2 ? (assign !== 'single' || !!single) && (assign !== 'round_robin' || rr.length > 0) : true;
  const finished = progress && progress.done >= parsed.length && step === 3;

  return (
    <Sheet open={open} onClose={close} title="Import leads" width={980}
      footer={
        step === 0 ? <Button variant="glass" onClick={close}>Cancel</Button>
          : step < 3 ? (
            <>
              <Button variant="ghost" className="mr-auto" icon={<ArrowLeft className="size-4" />} onClick={() => setStep((s) => s - 1)}>Back</Button>
              {step === 1 && <Button variant="primary" disabled={!canNext} iconRight={<ArrowRight className="size-4" />} onClick={() => setStep(2)}>Choose who gets them</Button>}
              {step === 2 && <Button variant="primary" disabled={!canNext} icon={<Upload className="size-4" />} onClick={run}>Import {count(stats.total - stats.blank)} leads</Button>}
            </>
          ) : finished ? <Button variant="primary" onClick={() => { reset(); onClose(); }}>Done</Button> : null
      }>
      <Steps step={step} />

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }}>
          {step === 0 && (
            <div>
              <motion.div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void load(f); }}
                onClick={() => input.current?.click()}
                animate={{ scale: drag ? 1.02 : 1 }}
                className={clsx('grid cursor-pointer place-items-center rounded-[26px] border-2 border-dashed px-6 py-14 text-center transition-colors', drag ? 'border-iris bg-iris/8' : 'border-[var(--hairline)] hover:bg-[var(--fill)]')}
              >
                <div className="grid size-16 place-items-center rounded-[22px] bg-iris/15 text-iris"><FileSpreadsheet className="size-8" /></div>
                <h3 className="mt-4 text-lg font-extrabold">Drop your lead sheet here</h3>
                <p className="text-2 mt-1 max-w-md text-[14px]">CSV or Excel (.xlsx). From Google Sheets use <b>File → Download → CSV</b>. 10,000 rows is no problem.</p>
                <Button variant="primary" className="mt-5" icon={<Upload className="size-4" />}>Choose a file</Button>
                <input ref={input} type="file" accept=".csv,.xlsx,.xlsm,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
              </motion.div>
              <button type="button" onClick={downloadTemplate} className="text-2 mt-4 inline-flex items-center gap-2 text-[13px] font-bold hover:text-[color:var(--text)]">
                <Download className="size-4" /> Download a template with the right columns
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="fill flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl px-4 py-3 text-[13px]">
                <span className="font-bold">{fileName}</span>
                <span><b>{count(stats.total)}</b> rows</span>
                <span><b>{count(stats.phone)}</b> with a phone</span>
                <span><b>{count(stats.email)}</b> with an email</span>
                <span><b>{stats.services}</b> services</span>
                {stats.blank > 0 && <span className="font-bold text-warn">{count(stats.blank)} blank rows will be removed</span>}
                {map.lead_date !== undefined && <span className={clsx(stats.dated < stats.total * 0.9 && 'font-bold text-warn')}><b>{count(stats.dated)}</b> dates read</span>}
              </div>
              <div>
                <h4 className="mb-2 text-[14px] font-bold">Match the columns</h4>
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  {FIELDS.map((f) => (
                    <Picker
                      key={f.key}
                      label={<span>{f.label}{f.hint && <span className="text-3 font-medium"> · {f.hint}</span>}</span>}
                      value={map[f.key] === undefined ? '__none' : String(map[f.key])}
                      onChange={(v) => setMap((m) => ({ ...m, [f.key]: v === '__none' ? undefined : Number(v) }))}
                      options={[{ value: '__none', label: '— not in this sheet —' }, ...header.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))]}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] font-bold">Dates are written</span>
                <Segmented size="sm" value={dateMode} onChange={setDateMode} options={[{ value: 'auto', label: 'Work it out' }, { value: 'mdy', label: 'Month first (US)' }, { value: 'dmy', label: 'Day first' }]} />
              </div>
              <Preview rows={parsed.slice(0, 6)} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid gap-2 sm:grid-cols-4">
                {([
                  ['round_robin', 'Split evenly', <Shuffle key="i" className="size-5" />, 'Round-robin across reps you pick'],
                  ['single', 'One rep', <User key="i" className="size-5" />, 'Every lead to one person'],
                  ['sheet', 'From the sheet', <FileSpreadsheet key="i" className="size-5" />, 'Use the “Assigned to” column'],
                  ['none', 'Leave unassigned', <Users key="i" className="size-5" />, 'Hand them out later'],
                ] as const).map(([k, label, icon, hint]) => (
                  <motion.button key={k} type="button" whileTap={{ scale: 0.97 }} onClick={() => setAssign(k)} disabled={k === 'sheet' && map.assigned === undefined}
                    className={clsx('rounded-[22px] p-4 text-left transition-colors disabled:opacity-40', assign === k ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'fill hover:bg-[var(--fill-2)]')}>
                    {icon}
                    <div className="mt-2 text-[14px] font-extrabold">{label}</div>
                    <div className={clsx('text-[12px]', assign === k ? 'opacity-70' : 'text-3')}>{hint}</div>
                  </motion.button>
                ))}
              </div>

              {assign === 'round_robin' && (
                <div>
                  <div className="label">Reps to share between · {rr.length ? `about ${count(Math.ceil(stats.total / rr.length))} each` : 'pick at least one'}</div>
                  <div className="flex flex-wrap gap-2">
                    {reps.map((r) => (
                      <Chip key={r.id} active={rr.includes(r.id)} onClick={() => setRr((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))}>
                        <AgentAvatar who={r} size={22} />{r.full_name}
                      </Chip>
                    ))}
                    <button type="button" className="text-[13px] font-bold text-iris" onClick={() => setRr(reps.map((r) => r.id))}>Everyone</button>
                  </div>
                </div>
              )}
              {assign === 'single' && (
                <Picker className="max-w-sm" label="Give every lead to" value={single} onChange={setSingle} placeholder="Choose a rep"
                  options={reps.map((r) => ({ value: r.id, label: r.full_name, hint: r.title ?? undefined }))} />
              )}
              {assign === 'sheet' && (
                <div>
                  <div className="label">Names in the sheet → reps</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sheetNames.map((n) => (
                      <div key={n} className="fill flex items-center gap-3 rounded-2xl px-3 py-2">
                        <span className="w-[140px] truncate text-[13px] font-bold">{n}</span>
                        <ArrowRight className="text-3 size-4" />
                        <Picker className="flex-1" value={nameMap[n] ?? autoNameMap[n] ?? '__none'} onChange={(v) => setNameMap((m) => ({ ...m, [n]: v }))}
                          options={[{ value: '__none', label: 'Leave unassigned' }, ...reps.map((r) => ({ value: r.id, label: r.full_name }))]} />
                      </div>
                    ))}
                    {sheetNames.length === 0 && <p className="text-3 text-[13px]">The “Assigned to” column is empty.</p>}
                  </div>
                </div>
              )}
              <div className="fill space-y-2 rounded-[20px] p-4">
                <p className="text-[13px]">
                  Every row is imported, <b>including people who appear more than once</b>. Only blank rows — no name, phone or email — are removed
                  {stats.blank > 0 ? <> ({count(stats.blank)} in this file)</> : null}. Old comments and follow-ups are kept on each card.
                </p>
                <Switch checked={skipDupes} onChange={setSkipDupes}
                  label={<span className="text-[13px]">Skip numbers that are already in NUUKE <span className="text-3">(only tick this if you are re-uploading the same sheet)</span></span>} />
              </div>
            </div>
          )}

          {step === 3 && progress && (
            <div className="py-6 text-center">
              <motion.div animate={finished ? { scale: [1, 1.15, 1] } : { rotate: 360 }} transition={finished ? { duration: 0.5 } : { duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className={clsx('mx-auto grid size-16 place-items-center rounded-[22px]', finished ? 'bg-ok text-white' : 'bg-iris/15 text-iris')}>
                {finished ? <Check className="size-8" /> : <Upload className="size-7" />}
              </motion.div>
              <h3 className="mt-4 text-xl font-extrabold">{finished ? 'Import complete' : 'Importing…'}</h3>
              <ProgressBar className="mx-auto mt-5 max-w-md" value={progress.done} max={parsed.length} height={12} />
              <p className="text-2 tabular mt-2 text-[13px]">{count(progress.done)} of {count(parsed.length)} rows</p>
              <div className={clsx('mx-auto mt-6 grid max-w-md gap-2', skipDupes ? 'grid-cols-3' : 'grid-cols-2')}>
                <Result label="Imported" value={progress.inserted} color="#30C46C" />
                {skipDupes && <Result label="Duplicates skipped" value={progress.duplicates} color="#FF9F0A" />}
                <Result label="Blank rows removed" value={progress.invalid} color="#8E8AA0" />
              </div>
              {finished && assign !== 'none' && <p className="text-2 mt-5 text-[13px]">Each rep has been notified about their new leads.</p>}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {error && <p className="mt-4 rounded-2xl bg-bad/12 px-4 py-3 text-[13px] font-semibold text-bad">{error}</p>}
    </Sheet>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ['Upload', 'Match columns', 'Assign', 'Import'];
  return (
    <div className="mb-6 flex items-center gap-2">
      {labels.map((l, i) => (
        <div key={l} className="flex flex-1 items-center gap-2">
          <span className={clsx('grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-extrabold transition-colors', i < step ? 'bg-ok text-white' : i === step ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'fill text-3')}>
            {i < step ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={clsx('hidden text-[13px] font-bold sm:inline', i > step && 'text-3')}>{l}</span>
          {i < labels.length - 1 && <span className="fill-2 h-0.5 flex-1 rounded-full" />}
        </div>
      ))}
    </div>
  );
}

function Result({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="fill rounded-2xl px-3 py-2.5">
      <div className="text-[11px] font-bold" style={{ color }}>{label}</div>
      <div className="tabular text-[22px] font-extrabold">{count(value)}</div>
    </div>
  );
}

function Preview({ rows }: { rows: { lead_date: string | null; name: string; phone: string | null; personal_email: string | null; service: string | null; platform: string | null; legacy: unknown }[] }) {
  return (
    <div>
      <h4 className="mb-2 text-[14px] font-bold">Preview</h4>
      <div className="scroll-x fill rounded-2xl">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="text-3 text-[11px] font-bold uppercase tracking-wide">
            <tr>{['Date', 'Name', 'Phone', 'Email', 'Service', 'Platform', 'Old notes'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[var(--hairline)]">
                <td className={clsx('tabular px-3 py-2', !r.lead_date && 'text-warn')}>{r.lead_date ?? 'unreadable'}</td>
                <td className="px-3 py-2 font-semibold">{r.name || '—'}</td>
                <td className="tabular px-3 py-2 font-mono">{r.phone ?? '—'}</td>
                <td className="px-3 py-2">{r.personal_email ?? '—'}</td>
                <td className="px-3 py-2">{r.service ?? '—'}</td>
                <td className="px-3 py-2">{r.platform ?? '—'}</td>
                <td className="text-3 max-w-[180px] truncate px-3 py-2">{r.legacy ? 'yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function downloadTemplate() {
  const csv = [
    'Date,Platform,Country,Name,Personal Email,Work Email,Phone,Post Link,Query,Service,Status,Assigned to,Comments,1st Follow,2nd Follow,3rd Follow,4th Follow',
    '2025-04-05,Bark,United States,Cassidy,cjzeichner@example.com,,(734) 388-6019,,"Mobile Software Development\nWhat type of project is this?\nApplication",Mobile App Development,,,,,,,',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nuuke-lead-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
