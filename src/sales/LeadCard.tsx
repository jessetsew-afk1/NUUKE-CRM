import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  CalendarClock, Check, ChevronDown, Copy, ExternalLink, Globe, History as HistoryIcon, Mail, MessageSquare, Pencil, Phone, PhoneCall,
  Recycle, Repeat,
} from 'lucide-react';
import type { Lead, LeadOutcome } from '@/lib/types';
import { useLeadHistory, OUTCOME_TONE } from '@/data/sales';
import { usePeople } from '@/data/common';
import { splitPhones, zoomCallHref as zoomHref } from '@/lib/phones';
import { Button, Pill, spring } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { ago, day, dateTime, friendly } from '@/lib/format';
import { EditLeadSheet } from './EditLeadSheet';

/* ---------------------------------------------------------------- helpers */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/** Zoom Phone's click-to-call link for one number. Works when the Zoom desktop app is installed. */
export const zoomCallHref = zoomHref;

/**
 * Bark-style queries arrive as "Title\nQuestion?\nAnswer\nQuestion?\nAnswer", with or without
 * blank lines. Lines ending in "?" are questions; what follows until the next question
 * is its answer; anything before the first question is shown as a heading line.
 */
export function parseQuery(text: string | null | undefined): { q: string; a: string }[] | null {
  if (!text?.trim()) return null;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.some((l) => l.endsWith('?'))) return [{ q: '', a: lines.join('\n') }];
  const out: { q: string; a: string }[] = [];
  const intro: string[] = [];
  let cur: { q: string; a: string[] } | null = null;
  for (const l of lines) {
    if (l.endsWith('?')) {
      if (cur) out.push({ q: cur.q, a: cur.a.join(', ') || '—' });
      cur = { q: l, a: [] };
    } else if (cur) {
      cur.a.push(l);
    } else {
      intro.push(l);
    }
  }
  if (cur) out.push({ q: cur.q, a: cur.a.join(', ') || '—' });
  return [...(intro.length ? [{ q: '', a: intro.join(' · ') }] : []), ...out];
}

export function attemptLabel(lead: Lead, maxAttempts: number) {
  if (lead.status === 'busy_callback' && lead.next_action_at) return { text: `Call-back · ${friendly(lead.next_action_at)}`, tone: 'info' as const };
  if (lead.stage === 'pipeline') return { text: 'Pipeline follow-up', tone: 'great' as const };
  if (lead.attempts === 0) return { text: 'First call', tone: 'iris' as const };
  return { text: `Follow-up ${lead.attempts + 1} of ${maxAttempts}`, tone: 'warn' as const };
}

export function CopyButton({ value, label, quiet, className }: { value: string; label: string; quiet?: boolean; className?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      transition={spring}
      onClick={async (e) => {
        e.stopPropagation();
        await copyText(value);
        setDone(true);
        toast({ title: `${label} copied`, body: quiet ? 'Paste it into Zoom Phone or your email.' : value, tone: 'success', duration: 1800 });
        window.setTimeout(() => setDone(false), 1600);
      }}
      className={clsx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold transition-colors',
        done ? 'bg-ok text-white' : 'fill hover:bg-[var(--fill-2)]', className,
      )}
      aria-label={`Copy ${label}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={done ? 'y' : 'n'} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
          {done ? <Check className="size-4" /> : <Copy className="size-4" />}
        </motion.span>
      </AnimatePresence>
      {done ? 'Copied' : 'Copy'}
    </motion.button>
  );
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="fill text-2 grid size-9 shrink-0 place-items-center rounded-xl">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------- card */
export function LeadCard({
  lead, outcomes, maxAttempts, showHistory = true, compact, onEdited,
}: {
  lead: Lead;
  outcomes: Map<string, LeadOutcome>;
  maxAttempts: number;
  showHistory?: boolean;
  compact?: boolean;
  /** Shows an Edit button; called with the saved lead. */
  onEdited?: (lead: Lead) => void;
}) {
  const [editing, setEditing] = useState(false);
  const phones = splitPhones(lead.phone);
  const qa = parseQuery(lead.query);
  const label = attemptLabel(lead, maxAttempts);
  const status = outcomes.get(lead.status);
  const legacy = (lead.legacy ?? null) as null | { comments?: string; followups?: string[]; status?: string; assigned?: string };
  const legacyFollowups = (legacy?.followups ?? []).filter(Boolean);

  return (
    <div className={clsx('space-y-5', compact && 'space-y-4')}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={label.tone} solid>{label.text}</Pill>
        {lead.service && <Pill tone="neutral">{lead.service}</Pill>}
        {lead.platform && <Pill tone="info">{lead.platform}</Pill>}
        {status && lead.status !== 'new' && <Pill tone={OUTCOME_TONE[status.tone] ?? 'neutral'}>{status.short_label}</Pill>}
      </div>

      {lead.recycle_count > 0 && <PreviousRound lead={lead} outcomes={outcomes} />}

      <div>
        <div className="flex items-start gap-3">
          <h2 className={clsx('min-w-0 flex-1 font-extrabold leading-tight tracking-tight', compact ? 'text-[26px]' : 'text-[32px] sm:text-[38px]')}>
            {lead.name || 'Unnamed lead'}
          </h2>
          {onEdited && (
            <Button size="sm" variant="glass" className="mt-1.5 shrink-0" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>Edit</Button>
          )}
        </div>
        <div className="text-2 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium">
          {lead.country && <span className="inline-flex items-center gap-1.5"><Globe className="size-3.5" />{lead.country}</span>}
          <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5" />Enquired {day(lead.lead_date)}</span>
          {lead.last_attempt_at && <span className="inline-flex items-center gap-1.5"><Repeat className="size-3.5" />Last call {ago(lead.last_attempt_at)}</span>}
        </div>
      </div>

      <div className="space-y-3">
        {phones.length ? phones.map((p, i) => (
          <Row key={p + i} icon={<Phone className="size-4" />}>
            <span className="flex min-w-0 flex-col">
              {phones.length > 1 && <span className="text-3 text-[11px] font-bold uppercase tracking-wider">Number {i + 1} of {phones.length}</span>}
              <span className={clsx('tabular font-mono font-semibold tracking-tight', phones.length > 1 ? 'text-[19px]' : 'text-[22px]')}>{p}</span>
            </span>
            <span className="flex gap-2">
              <CopyButton value={p} label={phones.length > 1 ? `Number ${i + 1}` : 'Number'} />
              <a
                href={zoomCallHref(p, lead.country)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0B5CFF] px-3 text-[13px] font-bold text-white hover:brightness-110"
                title={`Opens Zoom Phone with ${p} only`}
              >
                <PhoneCall className="size-4" /> {phones.length > 1 ? `Call #${i + 1}` : 'Call in Zoom'}
              </a>
            </span>
          </Row>
        )) : (
          <Row icon={<Phone className="size-4" />}><span className="text-3">No phone number</span></Row>
        )}
        {lead.personal_email && (
          <Row icon={<Mail className="size-4" />}>
            <a href={`mailto:${lead.personal_email}`} className="min-w-0 truncate font-semibold hover:underline">{lead.personal_email}</a>
            <span className="text-3 text-xs">personal</span>
            <CopyButton value={lead.personal_email} label="Email" />
          </Row>
        )}
        {lead.work_email && (
          <Row icon={<Mail className="size-4" />}>
            <a href={`mailto:${lead.work_email}`} className="min-w-0 truncate font-semibold hover:underline">{lead.work_email}</a>
            <span className="text-3 text-xs">work</span>
            <CopyButton value={lead.work_email} label="Email" />
          </Row>
        )}
        {lead.post_link && (
          <Row icon={<ExternalLink className="size-4" />}>
            <a href={lead.post_link} target="_blank" rel="noreferrer" className="min-w-0 truncate font-semibold text-iris hover:underline">Open the original post</a>
          </Row>
        )}
      </div>

      {qa && (
        <div className="fill rounded-[22px] p-4">
          <div className="text-3 mb-3 text-[11px] font-bold uppercase tracking-[0.14em]">Query details</div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {qa.map((p, i) => (
              <div key={i} className={clsx(!p.q && 'sm:col-span-2')}>
                {p.q && <dt className="text-2 text-[12px] font-medium">{p.q}</dt>}
                <dd className="mt-0.5 whitespace-pre-wrap text-[14px] font-semibold">{p.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {(lead.last_comment || legacy?.comments || legacyFollowups.length > 0) && (
        <div className="rounded-[22px] border border-dashed border-[var(--hairline)] p-4">
          <div className="text-3 mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
            <MessageSquare className="size-3.5" /> Notes
          </div>
          {lead.last_comment && <p className="text-[14px] font-medium">“{lead.last_comment}”</p>}
          {legacy?.comments && <p className="text-2 mt-1 text-[13px]"><b>From the sheet:</b> {legacy.comments}</p>}
          {legacyFollowups.map((f, i) => (
            <p key={i} className="text-2 mt-1 text-[13px]"><b>Follow-up {i + 1} (sheet):</b> {f}</p>
          ))}
        </div>
      )}

      {showHistory && (lead.attempts > 0 || lead.recycle_count > 0) && <History leadId={lead.id} outcomes={outcomes} />}

      {onEdited && <EditLeadSheet lead={editing ? lead : null} onClose={() => setEditing(false)} onSaved={(l) => { setEditing(false); onEdited(l); }} />}
    </div>
  );
}

interface PreviousRoundInfo { round?: number; closed_reason?: string | null; status?: string | null; attempts?: number; closed_at?: string | null; comment?: string | null; rep_id?: string | null }

/** A recycled lead says how its last round ended, so the rep isn't calling blind. */
function PreviousRound({ lead, outcomes }: { lead: Lead; outcomes: Map<string, LeadOutcome> }) {
  const people = usePeople();
  const prev = (lead.previous_round ?? {}) as PreviousRoundInfo;
  const reason = prev.closed_reason === 'exhausted'
    ? `No answer after ${prev.attempts ?? 'several'} call${prev.attempts === 1 ? '' : 's'}${prev.status && outcomes.get(prev.status) ? ` (last: ${outcomes.get(prev.status)!.label.toLowerCase()})` : ''}`
    : outcomes.get(prev.closed_reason ?? '')?.label ?? outcomes.get(prev.status ?? '')?.label ?? 'Closed';
  const rep = people.data?.find((p) => p.id === prev.rep_id)?.full_name;
  return (
    <div className="flex items-start gap-3 rounded-[20px] bg-warn/12 px-4 py-3 text-[13px]">
      <Recycle className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="min-w-0">
        <div className="font-bold text-warn">Dialed before · now round {lead.recycle_count + 1}</div>
        <div className="mt-0.5">
          Last round: <b>{reason}</b>
          {prev.closed_at && <> on {day(prev.closed_at)}</>}
          {rep && <> by {rep}</>}
          {prev.attempts ? <> · {prev.attempts} call{prev.attempts === 1 ? '' : 's'}</> : null}
        </div>
        {prev.comment && <div className="text-2 mt-0.5">Their note: “{prev.comment}”</div>}
      </div>
    </div>
  );
}

function History({ leadId, outcomes }: { leadId: number; outcomes: Map<string, LeadOutcome> }) {
  const [open, setOpen] = useState(false);
  const { data } = useLeadHistory(open ? leadId : null);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-2 flex items-center gap-2 text-[13px] font-bold hover:text-[color:var(--text)]">
        <HistoryIcon className="size-4" /> Call history
        <ChevronDown className={clsx('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 overflow-hidden border-l-2 border-[var(--fill-2)] pl-4"
          >
            {(data ?? []).map((a) => {
              const o = a.outcome ? outcomes.get(a.outcome) : null;
              return (
                <li key={a.id} className="relative pb-3">
                  <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-[var(--canvas)] ring-2 ring-iris" />
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <b>{a.action === 'skip' ? 'Skipped' : a.action === 'note' ? 'Note' : o?.label ?? 'Call'}</b>
                    {a.attempt_no && <span className="text-3">attempt {a.attempt_no}</span>}
                    <span className="text-3">· {dateTime(a.created_at)}</span>
                  </div>
                  {a.comment && <p className="text-2 mt-0.5 text-[13px]">{a.comment}</p>}
                  {a.followup_at && <p className="text-3 mt-0.5 text-[12px]">Next: {friendly(a.followup_at)}</p>}
                </li>
              );
            })}
            {data && data.length === 0 && <li className="text-3 text-[13px]">No calls yet.</li>}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}
