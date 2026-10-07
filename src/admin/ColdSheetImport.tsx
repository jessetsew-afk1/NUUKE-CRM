import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, Inbox, PhoneOutgoing, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { must, rpc, supabase } from '@/lib/supabase';
import { clientKey } from '@/lib/phones';
import type { ColdDetails, ColumnRole, FillField, Lead, Profile, SheetColumn } from '@/lib/types';
import { fillFieldsOf, useLeadSheets } from '@/data/sheets';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { LeadCard } from '@/sales/LeadCard';
import { Button, Chip, Input, Picker, ProgressBar, Sheet, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { count } from '@/lib/format';
import { bestTab, fillFieldsFrom, guessRoles, instructionsFrom, readWorkbook, tableOf, text, type Tab } from './workbook';

/* ------------------------------------------------------------------ the choice on the first step */
export type ImportKindValue = 'leads' | 'cold';

export function ImportKind({ kind, onChange }: { kind: ImportKindValue; onChange: (k: ImportKindValue) => void }) {
  const options: [ImportKindValue, string, string, ReactNode][] = [
    ['leads', 'Lead sheet', 'Enquiries (Bark and others), shared out to your dialers', <Inbox key="i" className="size-5" />],
    ['cold', 'Cold call sheet', 'Businesses to cold call, only for the dialers you pick', <PhoneOutgoing key="i" className="size-5" />],
  ];
  return (
    <div className="mb-5 grid gap-2 sm:grid-cols-2">
      {options.map(([k, label, hint, icon]) => (
        <motion.button key={k} type="button" whileTap={{ scale: 0.97 }} onClick={() => onChange(k)} aria-pressed={kind === k}
          className={clsx('flex items-start gap-3 rounded-[22px] p-4 text-left transition-colors', kind === k ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'fill hover:bg-[var(--fill-2)]')}>
          <span className="mt-0.5 shrink-0">{icon}</span>
          <span>
            <span className="block text-[14px] font-extrabold">{label}</span>
            <span className={clsx('block text-[12px]', kind === k ? 'opacity-70' : 'text-3')}>{hint}</span>
          </span>
        </motion.button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ column roles */
const ROLES: { value: ColumnRole; label: string }[] = [
  { value: 'name', label: 'Business name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'contact', label: 'Ask for (owner / contact)' },
  { value: 'priority', label: 'Priority (A is called first)' },
  { value: 'ref', label: 'Sheet number' },
  { value: 'show', label: 'Show on the card' },
  { value: 'fill', label: 'Dialers fill this in' },
  { value: 'logged', label: 'NUUKE logs this itself' },
  { value: 'skip', label: 'Leave out' },
];
/** Roles only one column can have. */
const SINGLE = new Set<ColumnRole>(['name', 'phone', 'email', 'contact', 'priority', 'ref']);
const RANK: Record<string, number> = { A: 1, '1': 1, H: 1, B: 2, '2': 2, M: 2, W: 2, C: 3, '3': 3, L: 3 };
const rank = (p?: string) => RANK[(p ?? '').trim().charAt(0).toUpperCase()] ?? 4;

interface Row { name: string; phone: string | null; personal_email: null; work_email: string | null; details: ColdDetails }

/**
 * Upload a cold call sheet: any layout. Finds the tab with the list, works out what
 * each column is, keeps the sheet's "How to use" notes, turns the columns left empty
 * for the caller (and their dropdowns) into fields on the card, and gives the sheet
 * to the dialers the admin picks.
 */
export function ColdSheetImport({ open, onClose, reps, kind, onKind }: {
  open: boolean;
  onClose: () => void;
  reps: Profile[];
  kind: ImportKindValue;
  onKind: (k: ImportKindValue) => void;
}) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [tabIx, setTabIx] = useState(0);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [target, setTarget] = useState<string>('new');
  const [members, setMembers] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; inserted: number; duplicates: number; invalid: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sheets = useLeadSheets(open);
  const toast = useToast();
  const qc = useQueryClient();

  const tab = tabs[tabIx];
  const { header, body } = useMemo(() => tableOf(tab), [tab]);

  const pickTab = (all: Tab[], i: number) => {
    const t = tableOf(all[i]);
    setTabIx(i);
    setRoles(guessRoles(all[i], t.header, t.body));
    setInstructions(instructionsFrom(all, i));
  };

  const reset = () => {
    setStep(0); setFileName(''); setTabs([]); setTabIx(0); setRoles([]); setName(''); setInstructions('');
    setTarget('new'); setMembers([]); setProgress(null); setError(null);
  };

  const load = useCallback(async (file: File) => {
    setError(null);
    try {
      const all = await readWorkbook(file);
      const i = bestTab(all);
      if (!tableOf(all[i]).header.length) throw new Error('Could not find a header row in that file');
      setTabs(all);
      pickTab(all, i);
      setFileName(file.name);
      setName(file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim());
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const setRole = (i: number, role: ColumnRole) => setRoles((rs) => rs.map((r, ix) => (ix === i ? role : SINGLE.has(role) && r === role ? 'show' : r)));

  const rows: Row[] = useMemo(() => body.map((r, i) => {
    const get = (role: ColumnRole) => { const ix = roles.indexOf(role); return ix < 0 ? '' : text(r[ix]); };
    const fields = roles.flatMap((role, ix) => (role === 'show' && text(r[ix]) ? [{ label: header[ix] || `Column ${ix + 1}`, value: text(r[ix]) }] : []));
    const details: ColdDetails = { row: i + 1, fields };
    if (get('contact')) details.contact = get('contact');
    if (get('priority')) details.priority = get('priority');
    if (get('ref')) details.ref = get('ref');
    return { name: get('name'), phone: get('phone') || null, personal_email: null, work_email: get('email') || null, details };
  }), [body, roles, header]);

  const blank = (p: Row) => !p.name.trim() && !p.phone && !p.work_email;
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((p) => {
      if (blank(p)) return false;
      const k = clientKey({ ...p, post_link: null, query: null });
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [rows]);

  const fill: FillField[] = useMemo(() => (tab ? fillFieldsFrom(tab, header, roles) : []), [tab, header, roles]);
  const priorities = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of unique) if (r.details.priority) m.set(r.details.priority, (m.get(r.details.priority) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  }, [unique]);
  const stats = {
    total: rows.length,
    blank: rows.filter(blank).length,
    repeats: rows.length - rows.filter(blank).length - unique.length,
    phone: unique.filter((r) => r.phone).length,
  };

  const preview = useMemo(() => {
    const first = [...unique].sort((a, b) => rank(a.details.priority) - rank(b.details.priority) || (a.details.row ?? 0) - (b.details.row ?? 0))[0];
    if (!first) return null;
    return {
      id: -1, name: first.name, phone: first.phone, personal_email: null, work_email: first.work_email, details: first.details,
      sheet_id: null, platform: 'Cold call', service: null, country: null, lead_date: null, query: null, post_link: null,
      status: 'new', stage: 'queue', attempts: 0, recycle_count: 0, last_attempt_at: null, last_comment: null, legacy: null,
      previous_round: null, next_action_at: null, closed_reason: null,
    } as unknown as Lead;
  }, [unique]);

  const existing = sheets.data?.find((s) => String(s.id) === target) ?? null;
  const chooseTarget = (v: string) => {
    setTarget(v);
    const s = sheets.data?.find((x) => String(x.id) === v);
    setMembers(s ? s.lead_sheet_members.map((m) => m.user_id) : []);
  };

  const run = async () => {
    setError(null);
    setStep(3);
    const total = unique.length;
    setProgress({ done: 0, inserted: 0, duplicates: 0, invalid: 0 });
    try {
      const columns: SheetColumn[] = header.flatMap((h, i) => (h ? [{ label: h, role: roles[i] }] : []));
      let sheetId: number;
      if (existing) {
        sheetId = existing.id;
        const had = fillFieldsOf(existing);
        const hadCols = (existing.columns ?? []) as unknown as SheetColumn[];
        must(await supabase.from('lead_sheets').update({
          fill_fields: [...had, ...fill.filter((f) => !had.some((x) => x.label === f.label))] as never,
          columns: [...hadCols, ...columns.filter((c) => !hadCols.some((x) => x.label === c.label))] as never,
          instructions: existing.instructions?.trim() ? existing.instructions : instructions.trim() || null,
        }).eq('id', sheetId).select('id'));
      } else {
        const created = must(await supabase.from('lead_sheets').insert({
          name: name.trim(), instructions: instructions.trim() || null, fill_fields: fill as never, columns: columns as never,
        }).select('id').single()) as { id: number };
        sheetId = created.id;
      }
      await rpc('set_sheet_members', { p_sheet: sheetId, p_members: members, p_notify: false });
      const importId = await rpc<number>('start_lead_import', { p_file_name: fileName, p_total: total });
      let acc = { done: 0, inserted: 0, duplicates: 0, invalid: 0 };
      const CHUNK = 500;
      for (let i = 0; i < total; i += CHUNK) {
        const res = await rpc<{ inserted: number; duplicates: number; invalid: number }>('import_sheet_leads', {
          p_import_id: importId, p_sheet: sheetId, p_rows: unique.slice(i, i + CHUNK) as never,
        });
        acc = { done: Math.min(total, i + CHUNK), inserted: acc.inserted + res.inserted, duplicates: acc.duplicates + res.duplicates, invalid: acc.invalid + res.invalid };
        setProgress(acc);
      }
      await rpc('finish_sheet_import', { p_import_id: importId, p_sheet: sheetId });
      celebrate('big');
      toast({ title: `${count(acc.inserted)} businesses ready to cold call`, body: `${members.length} ${members.length === 1 ? 'dialer has' : 'dialers have'} been told.`, tone: 'celebrate' });
      void qc.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const finished = progress && progress.done >= unique.length && step === 3;
  const close = () => { if (progress && !finished && !error) return; reset(); onClose(); };
  const hasKey = roles.includes('name') || roles.includes('phone');
  const canNext = step === 1 ? hasKey && unique.length > 0 && (target !== 'new' || !!name.trim()) : step === 2 ? members.length > 0 : true;

  return (
    <Sheet open={open} onClose={close} title="Import a cold call sheet" width={980}
      footer={
        step === 0 ? <Button variant="glass" onClick={close}>Cancel</Button>
          : step < 3 ? (
            <>
              <Button variant="ghost" className="mr-auto" icon={<ArrowLeft className="size-4" />} onClick={() => setStep((s) => s - 1)}>Back</Button>
              {step === 1 && <Button variant="primary" disabled={!canNext} iconRight={<ArrowRight className="size-4" />} onClick={() => setStep(2)}>Choose who dials it</Button>}
              {step === 2 && (
                <Button variant="primary" disabled={!canNext} icon={<Upload className="size-4" />} onClick={run}>
                  Upload {count(unique.length)} businesses{members.length ? ` for ${members.length} ${members.length === 1 ? 'dialer' : 'dialers'}` : ''}
                </Button>
              )}
            </>
          ) : finished || error ? <Button variant="primary" onClick={() => { reset(); onClose(); }}>Done</Button> : null
      }>
      <Steps step={step} />

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }}>
          {step === 0 && (
            <div>
              <ImportKind kind={kind} onChange={onKind} />
              <motion.div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void load(f); }}
                onClick={() => input.current?.click()}
                animate={{ scale: drag ? 1.02 : 1 }}
                className={clsx('grid cursor-pointer place-items-center rounded-[26px] border-2 border-dashed px-6 py-14 text-center transition-colors', drag ? 'border-iris bg-iris/8' : 'border-[var(--hairline)] hover:bg-[var(--fill)]')}
              >
                <div className="grid size-16 place-items-center rounded-[22px] bg-iris/15 text-iris"><FileSpreadsheet className="size-8" /></div>
                <h3 className="mt-4 text-lg font-extrabold">Drop your cold call sheet here</h3>
                <p className="text-2 mt-1 max-w-md text-[14px]">Excel (.xlsx) or CSV, in any layout. NUUKE finds the tab with the list, reads every column, and keeps the sheet's dropdowns and “How to use” notes.</p>
                <Button variant="primary" className="mt-5" icon={<Upload className="size-4" />}>Choose a file</Button>
                <input ref={input} type="file" accept=".csv,.xlsx,.xlsm,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
              </motion.div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="fill flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-3 text-[13px]">
                <span className="font-bold">{fileName}</span>
                {tabs.length > 1 && (
                  <Picker className="w-[200px]" value={String(tabIx)} onChange={(v) => pickTab(tabs, Number(v))}
                    options={tabs.map((t, i) => ({ value: String(i), label: `Tab: ${t.name}` }))} />
                )}
                <span><b>{count(unique.length)}</b> businesses</span>
                <span><b>{count(stats.phone)}</b> with a phone</span>
                {priorities.map(([p, n]) => <span key={p}>Priority {p}: <b>{n}</b></span>)}
                {stats.repeats > 0 && <span className="font-bold text-warn">{count(stats.repeats)} repeated rows added once</span>}
                {stats.blank > 0 && <span className="font-bold text-warn">{count(stats.blank)} blank rows left out</span>}
              </div>

              <Input label="Name this sheet" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Miami med spas" className="max-w-md"
                hint="Dialers pick it by this name on the dialer." />

              <div>
                <h4 className="text-[14px] font-bold">What each column is</h4>
                <p className="text-3 mb-3 text-[12.5px]">Worked out from the sheet. Columns left empty for the caller become fields they fill in on the card; call date, outcome, notes and next step are logged by NUUKE on every call.</p>
                <div className="grid gap-x-5 gap-y-2 lg:grid-cols-2">
                  {header.map((h, i) => {
                    if (!h && roles[i] === 'skip') return null;
                    const sample = body.map((r) => text(r[i])).find(Boolean);
                    const options = tab?.lists.get(i);
                    return (
                      <div key={i} className="fill flex items-center gap-3 rounded-2xl px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-bold" title={h}>{h || `Column ${i + 1}`}</div>
                          <div className="text-3 truncate text-[12px]" title={sample}>
                            {sample ?? (options?.length ? `Choices: ${options.join(', ')}` : tab?.formulas.has(i) ? 'Worked out by a formula' : 'Empty in every row')}
                          </div>
                        </div>
                        <Picker className="w-[210px] shrink-0" align="right" value={roles[i]} onChange={(v) => setRole(i, v as ColumnRole)} options={ROLES} />
                      </div>
                    );
                  })}
                </div>
                {!hasKey && <p className="mt-2 text-[13px] font-semibold text-warn">Pick the column with the business name or the phone number.</p>}
              </div>

              <Textarea label="How to work this sheet" rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)}
                placeholder="Anything dialers should know: who to ask for, what to say, what to find out."
                hint={instructions ? 'From the sheet’s own notes. Dialers see this next to the card; change anything that only made sense in Excel.' : 'Dialers see this next to the card.'} />

              {preview && (
                <div>
                  <h4 className="mb-2 text-[14px] font-bold">How the first card will look</h4>
                  <div className="glass rounded-[28px] p-5 sm:p-6">
                    <LeadCard lead={preview} outcomes={new Map()} maxAttempts={4} compact showHistory={false} fillFields={fill} />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {(sheets.data?.length ?? 0) > 0 && (
                <Picker className="max-w-md" label="Upload into" value={target} onChange={chooseTarget}
                  options={[{ value: 'new', label: `A new sheet: ${name.trim() || 'untitled'}` },
                    ...sheets.data!.map((s) => ({ value: String(s.id), label: `Add to ${s.name}`, hint: 'only businesses it doesn’t have yet' }))]} />
              )}
              <div>
                <div className="label">Who can dial {existing ? existing.name : 'this sheet'} · {members.length ? `${members.length} picked` : 'pick at least one'}</div>
                <div className="flex flex-wrap gap-2">
                  {reps.map((r) => (
                    <Chip key={r.id} active={members.includes(r.id)} onClick={() => setMembers((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))}>
                      <AgentAvatar who={r} size={22} />{r.full_name}
                    </Chip>
                  ))}
                  <button type="button" className="text-[13px] font-bold text-iris" onClick={() => setMembers(reps.map((r) => r.id))}>Everyone</button>
                </div>
              </div>
              <div className="fill space-y-1.5 rounded-[20px] p-4 text-[13px]">
                <p>Only the people you pick see this sheet. On the dialer they choose it under <b>What to dial</b>, and that session shows only its businesses, Priority A first.</p>
                <p className="text-2">They share one pile: each business goes to whoever gets it first and comes back to them every 2 days, so no business is called by two people. Do not call and meetings work like everywhere else. Their normal leads stay exactly as they are.</p>
              </div>
            </div>
          )}

          {step === 3 && progress && (
            <div className="py-6 text-center">
              <motion.div animate={finished ? { scale: [1, 1.15, 1] } : { rotate: 360 }} transition={finished ? { duration: 0.5 } : { duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className={clsx('mx-auto grid size-16 place-items-center rounded-[22px]', finished ? 'bg-ok text-white' : 'bg-iris/15 text-iris')}>
                {finished ? <Check className="size-8" /> : <Upload className="size-7" />}
              </motion.div>
              <h3 className="mt-4 text-xl font-extrabold">{finished ? 'Sheet uploaded' : 'Uploading…'}</h3>
              <ProgressBar className="mx-auto mt-5 max-w-md" value={progress.done} max={unique.length} height={12} />
              <p className="text-2 tabular mt-2 text-[13px]">{count(progress.done)} of {count(unique.length)} businesses</p>
              <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-2">
                <Result label="Added" value={progress.inserted} color="#30C46C" />
                <Result label="Already on it, or Do not call" value={progress.duplicates} color="#FF9F0A" />
              </div>
              {finished && <p className="text-2 mt-5 text-[13px]">Everyone on the sheet has been told it's ready on their dialer.</p>}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {error && <p className="mt-4 rounded-2xl bg-bad/12 px-4 py-3 text-[13px] font-semibold text-bad">{error}</p>}
    </Sheet>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ['Upload', 'Read the sheet', 'Who dials it', 'Import'];
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
