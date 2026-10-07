import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { AlertTriangle, BookOpen, Check, ChevronDown, Clock, ExternalLink, Lightbulb, Loader2, MapPin, NotebookPen, Star, UserRound, Zap } from 'lucide-react';
import type { ColdDetails, FillField, Lead } from '@/lib/types';
import { saveLeadAnswers } from '@/data/sheets';
import { useSettings } from '@/data/common';
import { useToast } from '@/ui/toast';
import { Chip, Input, Pill, type Tone } from '@/ui/kit';
import { QuickMessages } from './QuickMessages';

/* ------------------------------------------------------------- reading the sheet */
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const HOOK_RE = /hook|pitch|angle|opener|talking point|reason to call|why call/i;
const PAIN_RE = /pain|signal|complain|problem/i;
const RATING_RE = /rating|stars?\b/i;
const REVIEWS_RE = /reviews?\b/i;
const HOURS_RE = /hours|opening|open times/i;
const ADDRESS_RE = /address|street/i;
const AREA_RE = /^(area|city|town|neighbou?rhood|region|suburb|zone|market|county)$/i;

type Field = { label: string; value: string };

/** Sorts a business's sheet columns into what the card shows where. */
export function readCold(cold: ColdDetails) {
  const out = {
    links: [] as { label: string; url: string }[],
    hooks: [] as Field[],
    pains: [] as Field[],
    rating: null as Field | null,
    reviews: null as Field | null,
    hours: null as Field | null,
    address: null as Field | null,
    area: null as Field | null,
    long: [] as Field[],
    short: [] as Field[],
  };
  for (const f of cold.fields ?? []) {
    const v = f.value.trim();
    if (!v) continue;
    if (URL_RE.test(v)) out.links.push({ label: f.label, url: /^www\./i.test(v) ? `https://${v}` : v });
    else if (HOOK_RE.test(f.label)) out.hooks.push(f);
    else if (PAIN_RE.test(f.label)) out.pains.push(f);
    else if (!out.rating && RATING_RE.test(f.label) && /^\d+(\.\d+)?$/.test(v)) out.rating = f;
    else if (!out.reviews && REVIEWS_RE.test(f.label) && /^\d[\d,]*$/.test(v)) out.reviews = f;
    else if (!out.hours && HOURS_RE.test(f.label)) out.hours = f;
    else if (!out.address && ADDRESS_RE.test(f.label)) out.address = f;
    else if (!out.area && AREA_RE.test(f.label.trim())) out.area = f;
    else if (v.length > 60) out.long.push(f);
    else out.short.push(f);
  }
  return out;
}

export function priorityTone(p: string | undefined): Tone {
  const c = (p ?? '').trim().charAt(0).toUpperCase();
  return c === 'A' || c === '1' || c === 'H' ? 'bad' : c === 'B' || c === '2' || c === 'M' || c === 'W' ? 'warn' : 'neutral';
}

/** The little pills at the top of a cold card. */
export function ColdPills({ cold }: { cold: ColdDetails }) {
  const r = readCold(cold);
  return (
    <>
      {cold.priority && <Pill tone={priorityTone(cold.priority)} solid>Priority {cold.priority}</Pill>}
      {r.area && <Pill tone="neutral">{r.area.value}</Pill>}
      {cold.ref && <Pill tone="neutral">Sheet #{cold.ref}</Pill>}
    </>
  );
}

/** Under the business name: rating, hours, address. */
export function ColdSubline({ cold }: { cold: ColdDetails }) {
  const r = readCold(cold);
  return (
    <>
      {r.rating && (
        <span className="inline-flex items-center gap-1.5"><Star className="size-3.5 fill-current text-warn" />{r.rating.value}{r.reviews && <> · {r.reviews.value} {r.reviews.label.toLowerCase().replace(/^google\s+/, 'Google ')}</>}</span>
      )}
      {r.hours && <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" />{r.hours.value}</span>}
    </>
  );
}

/** "Ask for": the owner or contact person from the sheet. */
export function ColdContact({ cold }: { cold: ColdDetails }) {
  if (!cold.contact) return null;
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="fill text-2 grid size-9 shrink-0 place-items-center rounded-xl"><UserRound className="size-4" /></span>
      <div className="min-w-0 pt-0.5">
        <div className="text-3 text-[11px] font-bold uppercase tracking-wider">Ask for</div>
        <div className="text-[15px] font-semibold [overflow-wrap:anywhere]">{cold.contact}</div>
      </div>
    </div>
  );
}

/** Everything else the sheet says about the business, and the fill-in fields. */
export function ColdBody({ lead, cold, fillFields, editable, onSaved }: {
  lead: Lead;
  cold: ColdDetails;
  fillFields: FillField[];
  editable: boolean;
  onSaved?: (answers: Record<string, string>) => void;
}) {
  const r = readCold(cold);
  const mapUrl = r.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address.value)}` : null;
  return (
    <>
      {(r.links.length > 0 || r.address) && (
        <div className="space-y-2.5">
          {r.address && (
            <div className="text-2 flex items-start gap-2 text-[13.5px] font-medium">
              <MapPin className="mt-0.5 size-4 shrink-0" /><span className="[overflow-wrap:anywhere]">{r.address.value}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {r.links.map((l) => <LinkChip key={l.label + l.url} href={l.url}>{l.label}</LinkChip>)}
            {mapUrl && <LinkChip href={mapUrl}>Map</LinkChip>}
          </div>
        </div>
      )}

      {(r.hooks.length > 0 || r.pains.length > 0) && (
        <div className="space-y-2">
          {r.hooks.map((f) => (
            <Callout key={f.label} tone="iris" icon={<Lightbulb className="size-4" />} label={f.label}>{f.value}</Callout>
          ))}
          {r.pains.map((f) => (
            <Callout key={f.label} tone="warn" icon={<AlertTriangle className="size-4" />} label={f.label}>{f.value}</Callout>
          ))}
        </div>
      )}

      {(r.short.length > 0 || r.long.length > 0) && (
        <div className="fill rounded-[22px] p-4">
          <div className="text-3 mb-3 text-[11px] font-bold uppercase tracking-[0.14em]">From the sheet</div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {r.short.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-2 text-[12px] font-medium">{f.label}</dt>
                <dd className="mt-0.5 text-[14px] font-semibold [overflow-wrap:anywhere]">{f.value}</dd>
              </div>
            ))}
            {r.long.map((f) => (
              <div key={f.label} className="min-w-0 sm:col-span-2">
                <dt className="text-2 text-[12px] font-medium">{f.label}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-[14px] font-semibold [overflow-wrap:anywhere]">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {fillFields.length > 0 && (
        <SheetAnswers key={lead.id} leadId={lead.id} fields={fillFields} initial={cold.answers ?? {}} editable={editable} onSaved={onSaved} />
      )}
    </>
  );
}

function LinkChip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="fill inline-flex h-9 max-w-full items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold text-iris hover:bg-[var(--fill-2)]">
      <ExternalLink className="size-3.5 shrink-0" /><span className="truncate">{children}</span>
    </a>
  );
}

function Callout({ tone, icon, label, children }: { tone: 'iris' | 'warn'; icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className={clsx('flex items-start gap-3 rounded-[20px] px-4 py-3', tone === 'iris' ? 'bg-iris/10 ring-1 ring-iris/25' : 'bg-warn/12')}>
      <span className={clsx('mt-0.5 shrink-0', tone === 'iris' ? 'text-iris' : 'text-warn')}>{icon}</span>
      <div className="min-w-0">
        <div className={clsx('text-[11px] font-bold uppercase tracking-[0.12em]', tone === 'iris' ? 'text-iris' : 'text-warn')}>{label}</div>
        <div className="mt-0.5 text-[14.5px] font-semibold [overflow-wrap:anywhere]">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- fill-in fields */
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * The columns the sheet leaves for the caller ("After-hours call", "Reached owner?",
 * "New patient value ($)"…), filled in right on the card. Choices save on tap,
 * typed answers when the box is left.
 */
function SheetAnswers({ leadId, fields, initial, editable, onSaved }: {
  leadId: number;
  fields: FillField[];
  initial: Record<string, string>;
  editable: boolean;
  onSaved?: (answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const saved = useRef<Record<string, string>>(initial);
  const toast = useToast();

  const save = async (label: string, value: string) => {
    if ((saved.current[label] ?? '') === value) return;
    setState('saving');
    try {
      const res = await saveLeadAnswers(leadId, { [label]: value });
      saved.current = res;
      setState('saved');
      onSaved?.(res);
    } catch (e) {
      setState('error');
      toast({ title: (e as Error).message, tone: 'danger' });
    }
  };

  const filled = fields.filter((f) => answers[f.label]).length;

  return (
    <div className="rounded-[22px] border border-dashed border-warn/50 bg-warn/[0.06] p-4">
      <div className="mb-3 flex items-center gap-2">
        <NotebookPen className="size-4 text-warn" />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-warn">Fill in while calling</span>
        <span className="text-3 tabular text-[12px]">{filled}/{fields.length}</span>
        <span className="text-3 ml-auto inline-flex items-center gap-1 text-[12px] font-semibold">
          {state === 'saving' && <><Loader2 className="size-3.5 animate-spin" />Saving</>}
          {state === 'saved' && <><Check className="size-3.5 text-ok" />Saved</>}
        </span>
      </div>
      <div className="space-y-3.5">
        {fields.map((f) => {
          const v = answers[f.label] ?? '';
          return (
            <div key={f.label}>
              <div className="text-2 mb-1.5 text-[12.5px] font-semibold">{f.label}</div>
              {f.options?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {f.options.map((o) => (
                    <Chip key={o} active={v === o} className={clsx('!h-8 !px-3 !text-[12.5px]', !editable && 'pointer-events-none')}
                      onClick={() => { if (!editable) return; const next = v === o ? '' : o; setAnswers((a) => ({ ...a, [f.label]: next })); void save(f.label, next); }}>
                      {o}
                    </Chip>
                  ))}
                </div>
              ) : (
                <Input
                  value={v}
                  disabled={!editable}
                  inputMode={f.number ? 'decimal' : undefined}
                  placeholder={f.number ? 'A number' : 'Type what they said'}
                  className="max-w-sm"
                  onChange={(e) => setAnswers((a) => ({ ...a, [f.label]: f.number ? e.target.value.replace(/[^\d.,$\s-]/g, '') : e.target.value }))}
                  onBlur={(e) => void save(f.label, e.target.value.trim())}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- dialer side panel */
const GUIDE_OPEN = 'nuuke-sheet-guide-open';
const GUIDE_TAB = 'nuuke-sheet-guide-tab';

/**
 * In place of message ideas on a cold sheet (those are written for people who
 * enquired): the sheet's own "How to use" notes, and the rep's quick messages.
 */
export function SheetGuide({ lead, sheetName, instructions }: { lead: Lead; sheetName: string; instructions: string | null }) {
  const settings = useSettings();
  const has = !!instructions?.trim();
  const [tab, setTabState] = useState<'how' | 'quick'>(() => { try { return (localStorage.getItem(GUIDE_TAB) as 'how' | 'quick') || 'how'; } catch { return 'how'; } });
  const setTab = (t: 'how' | 'quick') => { setTabState(t); try { localStorage.setItem(GUIDE_TAB, t); } catch { /* ignore */ } };
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(GUIDE_OPEN) !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem(GUIDE_OPEN, open ? '1' : '0'); } catch { /* ignore */ } }, [open]);
  const shown = has ? tab : 'quick';

  return (
    <section className="glass rounded-[28px]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-iris/15 text-iris"><BookOpen className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold">How to work this sheet</span>
          <span className="text-2 block truncate text-[12.5px]">{sheetName}{has ? ' · from the sheet’s own notes' : ''}</span>
        </span>
        <ChevronDown className={clsx('size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
            <div className="px-5 pb-5">
              {has && (
                <div className="fill mb-4 grid grid-cols-2 gap-1 rounded-[14px] p-1" role="tablist">
                  {([['how', 'How to', <BookOpen key="i" className="size-4" />], ['quick', 'My quick messages', <Zap key="i" className="size-4" />]] as const).map(([k, label, icon]) => (
                    <button key={k} type="button" role="tab" aria-selected={shown === k} onClick={() => setTab(k)}
                      className={clsx('flex items-center justify-center gap-1.5 rounded-[11px] px-2 py-1.5 text-[13px] font-semibold transition-colors',
                        shown === k ? 'bg-[var(--glass-strong)] shadow-[0_2px_8px_rgba(0,0,0,0.08)]' : 'text-2 hover:text-[color:var(--text)]')}>
                      {icon}{label}
                    </button>
                  ))}
                </div>
              )}
              {shown === 'how' ? <Instructions text={instructions!} /> : <QuickMessages lead={lead} company={settings.data?.company_name ?? 'NUUKE'} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** The sheet's notes, with its short title lines picked out as headings. */
export function Instructions({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n');
  return (
    <div className={clsx('space-y-1 text-[13.5px] leading-relaxed', className)}>
      {lines.map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-2" />;
        const heading = t.length <= 48 && !/[.:?!,]$/.test(t) && !/^[-•\d]/.test(t) && (lines[i + 1] ?? '').trim() !== '';
        return heading
          ? <div key={i} className="pt-1 text-[12px] font-extrabold uppercase tracking-[0.1em] text-iris">{t}</div>
          : <p key={i} className="[overflow-wrap:anywhere]">{t}</p>;
      })}
    </div>
  );
}
