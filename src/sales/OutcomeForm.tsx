import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowRight, CalendarClock, Info, SkipForward } from 'lucide-react';
import type { Lead, LeadOutcome } from '@/lib/types';
import { OUTCOME_TONE, type MeetingExtras } from '@/data/sales';
import { useSettings } from '@/data/common';
import { Button, Input, Kbd, Label, Picker, Textarea, toneColor, type PickerOption } from '@/ui/kit';
import { friendly, toLocalInput } from '@/lib/format';
import { MeetingFields, draftExtras, draftForLead, draftStartsAt, type MeetingDraft } from './MeetingFields';

export interface OutcomePayload {
  outcome: string;
  comment: string | null;
  followupAt: string | null;
  meetingAt: string | null;
  meetingMinutes: number;
  dealAmount: number | null;
  meeting: MeetingExtras | null;
}

const GROUPS: Record<string, string> = {
  contact_not_established: 'No contact', voicemail: 'No contact',
  busy_callback: 'Spoke to them', contact_established: 'Spoke to them',
  interested: 'Prospect', meeting_booked: 'Prospect', proposal_presentation: 'Prospect', proposal_sent: 'Prospect',
  negotiation: 'Prospect', won: 'Prospect',
  not_interested: 'Take off my list', wrong_person: 'Take off my list', invalid_number: 'Take off my list',
  do_not_call: 'Take off my list', duplicate: 'Take off my list',
};

const QUICK = ['contact_not_established', 'voicemail', 'busy_callback', 'contact_established', 'interested', 'meeting_booked'];

const presetsCallback = () => {
  const now = new Date();
  const at = (h: number) => new Date(now.getTime() + h * 3600_000);
  const tomorrow = new Date(now.getTime() + 24 * 3600_000);
  return [
    { label: 'In 1 hour', value: at(1) },
    { label: 'In 3 hours', value: at(3) },
    { label: 'Tomorrow', value: tomorrow },
    { label: 'In 2 days', value: new Date(now.getTime() + 48 * 3600_000) },
  ];
};

export function OutcomeForm({
  lead, outcomes, busy, onSubmit, onSkip, submitLabel = 'Done, next card', autoFocusKeys = true,
}: {
  lead: Lead;
  outcomes: LeadOutcome[];
  busy?: boolean;
  onSubmit: (p: OutcomePayload) => void;
  onSkip?: () => void;
  submitLabel?: string;
  autoFocusKeys?: boolean;
}) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [followup, setFollowup] = useState('');
  const [customFollowup, setCustomFollowup] = useState(false);
  const [meeting, setMeeting] = useState<MeetingDraft>(() => draftForLead(lead));
  const [zoneWhy, setZoneWhy] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const settings = useSettings();
  const gapDays = settings.data?.followup_gap_days ?? 2;
  const inDays = <b>{gapDays} day{gapDays === 1 ? '' : 's'}</b>;
  const [error, setError] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // A fresh card means a fresh form.
  useEffect(() => {
    const d = draftForLead(lead);
    setOutcome(null); setComment(''); setFollowup(''); setCustomFollowup(false); setMeeting(d); setZoneWhy(d.why); setAmount(''); setError(null);
    // Leave the notes box so the number shortcuts work straight away on the new card.
    if (autoFocusKeys && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [lead.id, autoFocusKeys]);

  const o = outcomes.find((x) => x.key === outcome) ?? null;
  const options: PickerOption[] = useMemo(
    () => outcomes.map((x) => ({ value: x.key, label: x.label, group: GROUPS[x.key], dot: toneColor[OUTCOME_TONE[x.tone] ?? 'neutral'] })),
    [outcomes],
  );


  const submit = () => {
    setError(null);
    if (!o) { setError('Choose how the call went'); return; }
    const iso = (v: string) => (v ? new Date(v).toISOString() : null);
    if (o.effect === 'callback' && !followup) { setError('Pick when to call them back'); return; }
    const meetingAt = o.key === 'meeting_booked' ? draftStartsAt(meeting) : null;
    if (o.key === 'meeting_booked' && !meetingAt) { setError('Pick the meeting date and time'); return; }
    const amt = amount ? Number(amount.replace(/[^\d.]/g, '')) : null;
    if (o.key === 'won' && !(amt && amt > 0)) { setError('Enter the amount you closed'); return; }
    onSubmit({
      outcome: o.key,
      comment: comment.trim() || null,
      followupAt: o.effect === 'callback' || customFollowup || o.effect === 'pipeline' ? iso(followup) : null,
      meetingAt,
      meetingMinutes: Number(meeting.minutes),
      dealAmount: amt,
      meeting: o.key === 'meeting_booked' ? draftExtras(meeting) : null,
    });
  };

  // Keyboard: 1–6 quick outcomes, S skip, ⌘/Ctrl+Enter done.
  useEffect(() => {
    if (!autoFocusKeys) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= QUICK.length) { e.preventDefault(); setOutcome(QUICK[n - 1]); window.setTimeout(() => commentRef.current?.focus(), 50); }
      if ((e.key === 's' || e.key === 'S') && onSkip) { e.preventDefault(); onSkip(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-4">
      <div>
        <Label hint={<span className="hidden sm:inline">press 1–6</span>}>How did the call go?</Label>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((k, i) => {
            const x = outcomes.find((y) => y.key === k);
            if (!x) return null;
            const active = outcome === k;
            const c = toneColor[OUTCOME_TONE[x.tone] ?? 'neutral'];
            return (
              <motion.button
                key={k}
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => { setOutcome(k); window.setTimeout(() => commentRef.current?.focus(), 50); }}
                className={clsx('inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold transition-all', active ? 'text-white' : 'fill hover:bg-[var(--fill-2)]')}
                style={active ? { background: c, boxShadow: `0 6px 18px -6px ${c}` } : undefined}
              >
                <span className="text-[11px] opacity-60">{i + 1}</span>
                {x.short_label}
              </motion.button>
            );
          })}
        </div>
        <Picker
          className="mt-3"
          size="lg"
          value={outcome}
          onChange={(v) => { setOutcome(v); window.setTimeout(() => commentRef.current?.focus(), 50); }}
          options={options}
          placeholder="Status: pick from the full list"
        />
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {o && (
          <motion.div
            key={o.key}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pb-1">
              {o.effect === 'callback' && (
                <WhenField label="Call them back" value={followup} onChange={setFollowup} presets={presetsCallback()} />
              )}

              {o.key === 'meeting_booked' && <MeetingFields draft={meeting} onChange={setMeeting} why={zoneWhy} />}

              {o.pipeline_stage && (
                <Input
                  label={o.key === 'won' ? 'Amount closed (USD)' : 'Estimated deal value (USD)'}
                  hint={o.key === 'won' ? 'required' : 'optional'}
                  inputMode="decimal"
                  placeholder="e.g. 8,500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  leading={<span className="text-[13px] font-bold">$</span>}
                />
              )}

              {o.effect === 'pipeline' && (
                <WhenField label="Remind me to call again" optional value={followup} onChange={setFollowup} presets={presetsCallback()} />
              )}
              {o.effect === 'pipeline' && o.pipeline_stage === 'prospect' && !followup && (
                <p className="text-2 -mt-2 text-[12.5px]">No time picked? They come back to your cards in {inDays}, until a meeting is set.</p>
              )}
              {o.effect === 'pipeline' && o.pipeline_stage !== 'prospect' && (
                <div className="fill flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[13px]">
                  <Info className="size-4 text-iris" /> Off the dialer cards now, and off any colleague's cards who has the same number.
                </div>
              )}

              {o.effect === 'retry' && !customFollowup && (
                <div className="fill flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[13px]">
                  <CalendarClock className="size-4 text-iris" />
                  <span className="flex-1">Comes back to your cards in {inDays}, mixed in with the rest.</span>
                  <button type="button" className="font-bold text-iris" onClick={() => setCustomFollowup(true)}>Pick a time</button>
                </div>
              )}
              {o.effect === 'retry' && customFollowup && (
                <WhenField label="Call again" value={followup} onChange={setFollowup} presets={presetsCallback()} />
              )}

              {o.effect === 'closed' && o.key === 'do_not_call' && (
                <div className="flex items-center gap-2 rounded-2xl bg-bad/10 px-3.5 py-2.5 text-[13px] font-medium text-bad">
                  <Info className="size-4" /> Never called again. Every copy of this number leaves every dialer's cards.
                </div>
              )}
              {o.effect === 'closed' && o.key !== 'won' && o.key !== 'do_not_call' && (
                <div className="flex items-center gap-2 rounded-2xl bg-warn/12 px-3.5 py-2.5 text-[13px] font-medium text-warn">
                  <Info className="size-4" /> Leaves your cards for good: it's a second copy of a client you already have.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Textarea
        ref={commentRef}
        label="Notes from the call"
        placeholder="What did they say? Budget, timeline, who decides…"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      {error && <p className="text-[13px] font-semibold text-bad">{error}</p>}

      <div className="flex items-center gap-2">
        {onSkip && (
          <Button variant="glass" size="lg" onClick={onSkip} disabled={busy} icon={<SkipForward className="size-4" />}>
            Skip <span className="hidden sm:inline"><Kbd>S</Kbd></span>
          </Button>
        )}
        <Button variant="primary" size="lg" className="flex-1" onClick={submit} loading={busy} iconRight={<ArrowRight className="size-4" />}>
          {submitLabel} <span className="hidden opacity-60 sm:inline"><Kbd>⌘↵</Kbd></span>
        </Button>
      </div>
    </div>
  );
}

function WhenField({
  label, value, onChange, presets, optional,
}: { label: string; value: string; onChange: (v: string) => void; presets: { label: string; value: Date }[]; optional?: boolean }) {
  return (
    <div>
      <Label hint={optional ? 'optional' : value ? friendly(new Date(value)) : undefined}>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => onChange(toLocalInput(p.value))}
            className="fill h-9 rounded-full px-3 text-[13px] font-semibold hover:bg-[var(--fill-2)]">
            {p.label}
          </button>
        ))}
        <input type="datetime-local" className="field h-9 !w-auto !py-0" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
