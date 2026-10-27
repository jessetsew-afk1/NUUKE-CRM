/**
 * One prospect, step by step, built for a phone: check them, record the memo,
 * paste the text under it, mark it sent. Later: follow-ups, replies, booking,
 * reminders. Every message is one tap to copy and open the chat.
 */
import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AtSign, CalendarCheck, Camera, Check, CheckCircle2, ChevronDown, Copy, ExternalLink, Globe, Mic, MessageCircle, RotateCcw, Search, Send, X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { act, dmLink, etTime, etToday, etToIso, addDays, igProfile, STATUS, READY, type OutreachAction, type Prospect, type ReplyKind } from '@/data/outreach';
import { afterMemo, followUp, memoScript, noShowText, REPLIES, reminderText, bookingText, type ScriptContext } from './scripts';
import { Button, Input, Pill, Sheet } from '@/ui/kit';
import { useToast } from '@/ui/toast';

const CHECKS = [
  'It\'s really them: the name or practice matches',
  'They posted in the last 60 days',
  'They have content to clip: podcast, videos, Reels, talks or a book',
  'They sell something: a call, consult, program or membership in their bio',
  'Your one line is true: you saw it with your own eyes',
];

/** Copy the words, then open the chat: on a phone that's the Instagram app. */
export function copyAndOpen(text: string, url: string | null | undefined, toast: ReturnType<typeof useToast>) {
  void navigator.clipboard?.writeText(text).then(
    () => toast({ title: 'Copied', body: url ? 'Paste it in the chat.' : 'Paste it where you need it.', tone: 'success', duration: 1800 }),
    () => toast({ title: 'Copy it from the box', tone: 'info' }),
  );
  if (url) window.open(url, '_blank', 'noopener');
}

export function ProspectSheet({ prospect, ctx, runs, onClose, onSent }: {
  prospect: Prospect | null;
  ctx: ScriptContext;
  /** The closer or an admin: can mark calls held and put people back on the list. */
  runs: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const p = prospect;
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (action: OutreachAction, opts: { note?: string | null; callAt?: string | null; ok?: string; close?: boolean } = {}) => {
    if (!p) return;
    setBusy(action);
    try {
      await act(p.id, action, opts.note, opts.callAt);
      await qc.invalidateQueries({ queryKey: ['outreach'] });
      if (opts.ok) toast({ title: opts.ok, tone: 'success' });
      if (opts.close) onClose();
    } catch (e) {
      toast({ title: 'That didn\'t save', body: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={!!p} onClose={onClose} width={600}
      title={p && (
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate">{p.name}</span>
          <Pill tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Pill>
        </span>
      )}>
      {p && (
        <div className="grid gap-4 pb-2">
          <Facts p={p} />
          {p.status === 'not_sent' && <FirstTouch key={p.id} p={p} ctx={ctx} busy={busy} run={run} onSent={onSent} />}
          {(p.status === 'sent' || p.status === 'info') && <Waiting key={p.id} p={p} ctx={ctx} busy={busy} run={run} />}
          {p.status === 'replied' && <Replied key={p.id} p={p} ctx={ctx} busy={busy} run={run} />}
          {p.status === 'booked' && <Booked key={p.id} p={p} ctx={ctx} busy={busy} run={run} runs={runs} />}
          {p.status === 'no_show' && <NoShow key={p.id} p={p} ctx={ctx} busy={busy} run={run} />}
          {['held', 'no', 'no_reply', 'no_ig'].includes(p.status) && (
            <Box>
              <p className="text-[14px]">
                {p.status === 'held' ? `Call held${p.held_at ? ` on ${new Date(p.held_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}. That's $${ctx.payPerHeld} for you.`
                  : p.status === 'no_reply' ? 'No answer after the last note. They\'re done; no more messages.'
                    : p.status === 'no_ig' ? 'No Instagram or Facebook to message. Isaiah keeps handling email.'
                      : 'They\'re off the list. Never message them again.'}
              </p>
              {(p.outcome_note || p.reply_note) && <p className="text-2 mt-2 text-[13px]">{p.outcome_note ?? p.reply_note}</p>}
              {runs && (
                <Button className="mt-3" size="sm" icon={<RotateCcw className="size-4" />} loading={busy === 'reopen'}
                  onClick={() => run('reopen', { ok: 'Back on the list' })}>Put back on the list</Button>
              )}
            </Box>
          )}
        </div>
      )}
    </Sheet>
  );
}

type Run = (action: OutreachAction, opts?: { note?: string | null; callAt?: string | null; ok?: string; close?: boolean }) => Promise<void>;
interface StepProps { p: Prospect; ctx: ScriptContext; busy: string | null; run: Run }

function Box({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('fill rounded-2xl p-4', className)}>{children}</div>;
}

function StepTitle({ n, children, done }: { n: number; children: ReactNode; done?: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-2.5 text-[15px] font-bold">
      <span className={clsx('grid size-6 place-items-center rounded-full text-[12px] font-extrabold', done ? 'bg-ok text-white' : 'bg-[var(--btn)] text-[color:var(--btn-text)]')}>
        {done ? <Check className="size-3.5" /> : n}
      </span>
      {children}
    </div>
  );
}

/** The words to send: shown in full, one tap copies them and opens the chat. */
function Words({ text, p, label = 'Copy & open chat' }: { text: string; p: Prospect; label?: string }) {
  const toast = useToast();
  const url = dmLink(p);
  return (
    <div>
      <p className="whitespace-pre-wrap rounded-2xl border border-[var(--hairline)] bg-[var(--glass-strong)] px-4 py-3 text-[14.5px] leading-relaxed">{text}</p>
      <div className="mt-2 flex gap-2">
        <Button variant="primary" block size="lg" icon={url ? <MessageCircle className="size-5" /> : <Copy className="size-5" />}
          onClick={() => copyAndOpen(text, url, toast)}>{url ? label : 'Copy'}</Button>
        {url && (
          <Button size="lg" aria-label="Copy only" onClick={() => copyAndOpen(text, null, toast)} icon={<Copy className="size-5" />} />
        )}
      </div>
    </div>
  );
}

function Facts({ p }: { p: Prospect }) {
  const [more, setMore] = useState(false);
  return (
    <div className="grid gap-2">
      <div className="text-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        {p.full_name && <span className="text-[color:var(--text)] font-semibold">{p.full_name}</span>}
        {p.practice && <a className="underline-offset-2 hover:underline" href={`https://${p.practice.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer">{p.practice}</a>}
        <span>· List {p.list} · #{p.position}</span>
        {p.status === 'not_sent' && <Pill tone={READY[p.ready].tone}>{READY[p.ready].label}</Pill>}
      </div>
      {p.latest_title && (
        <a href={p.latest_url ?? undefined} target="_blank" rel="noreferrer" className="fill flex items-start gap-3 rounded-2xl px-3.5 py-2.5 text-[13.5px]">
          <Mic className="mt-0.5 size-4 shrink-0 text-iris" />
          <span className="min-w-0 flex-1"><span className="font-semibold">{p.latest_title}</span>{p.latest_date && <span className="text-3"> · {p.latest_date}</span>}</span>
          {p.latest_url && <ExternalLink className="text-3 mt-0.5 size-3.5 shrink-0" />}
        </a>
      )}
      <button type="button" onClick={() => setMore((m) => !m)} className="text-2 flex items-center gap-1 justify-self-start text-[12.5px] font-semibold">
        <ChevronDown className={clsx('size-4 transition-transform', more && 'rotate-180')} /> {more ? 'Less' : 'What they sell, the hook and notes'}
      </button>
      <AnimatePresence initial={false}>
        {more && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <dl className="fill grid gap-2 rounded-2xl px-4 py-3 text-[13px]">
              {p.hook && <div><dt className="text-3 text-[11px] font-bold uppercase tracking-wider">Hook</dt><dd>{p.hook}</dd></div>}
              {p.sells && <div><dt className="text-3 text-[11px] font-bold uppercase tracking-wider">They sell</dt><dd>{p.sells}</dd></div>}
              {p.active && <div><dt className="text-3 text-[11px] font-bold uppercase tracking-wider">Posting lately</dt><dd>{p.active}</dd></div>}
              {p.notes && <div><dt className="text-3 text-[11px] font-bold uppercase tracking-wider">Notes</dt><dd className="whitespace-pre-wrap">{p.notes}</dd></div>}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FirstTouch({ p, ctx, busy, run, onSent }: StepProps & { onSent?: () => void }) {
  const toast = useToast();
  const [ticks, setTicks] = useState<boolean[]>(CHECKS.map(() => false));
  const [handle, setHandle] = useState('');
  const yes = ticks.filter(Boolean).length;
  const checked = yes >= 4;
  const where = p.instagram ? 'instagram' : p.facebook ? 'facebook' : null;

  return (
    <>
      {!where && (
        <Box>
          <p className="text-[14px] font-semibold">No Instagram found for {p.name} yet.</p>
          <p className="text-2 mt-1 text-[13px]">Search their name or practice in Instagram. If you find them, save the handle here.</p>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" icon={<Search className="size-4" />}
              onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(`${p.full_name ?? p.name} ${p.practice ?? ''} instagram`)}`, '_blank', 'noopener')}>Search</Button>
            <Button className="flex-1" variant="ghost" loading={busy === 'no_ig'} onClick={() => run('no_ig', { ok: `${p.name} marked No IG`, close: true })}>Mark No IG</Button>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <Input className="flex-1" placeholder="their.handle" value={handle} onChange={(e) => setHandle(e.target.value)} leading={<AtSign className="size-4" />} />
            <Button variant="primary" disabled={!handle.trim()} loading={busy === 'handle'} onClick={() => run('handle', { note: handle, ok: 'Saved' })}>Save</Button>
          </div>
        </Box>
      )}

      {where && (
        <>
          <section>
            <StepTitle n={1} done={checked}>Check them (2 minutes)</StepTitle>
            <Button block size="lg" icon={where === 'instagram' ? <Camera className="size-5" /> : <Globe className="size-5" />}
              onClick={() => window.open(where === 'instagram' ? igProfile(p.instagram!) : p.facebook!, '_blank', 'noopener')}>
              {where === 'instagram' ? `Open @${p.instagram}` : 'Open their Facebook page'}
            </Button>
            {!p.ig_confirmed && where === 'instagram' && <p className="mt-2 text-[12.5px] text-warn">This handle wasn't confirmed from their website. Make sure it's really them.</p>}
            <div className="mt-3 grid gap-1.5">
              {CHECKS.map((c, i) => (
                <button key={c} type="button" onClick={() => setTicks((t) => t.map((v, j) => (j === i ? !v : v)))}
                  className={clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-colors', ticks[i] ? 'bg-ok/12' : 'fill')}>
                  <span className={clsx('grid size-5 shrink-0 place-items-center rounded-md border', ticks[i] ? 'border-ok bg-ok text-white' : 'border-[var(--hairline)]')}>
                    {ticks[i] && <Check className="size-3.5" />}
                  </span>
                  {c}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-3 text-[12px]">{checked ? 'Good to go.' : 'Two or more "no"s? Skip them.'}</span>
              <Button size="sm" variant="ghost" loading={busy === 'no'} onClick={() => run('no', { note: 'Failed the 2-minute check', ok: `Skipped ${p.name}`, close: true })}>Skip them</Button>
            </div>
          </section>

          <section className={clsx(!checked && 'pointer-events-none opacity-45')}>
            <StepTitle n={2}>Follow them, then record the memo</StepTitle>
            <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--glass-strong)] px-4 py-3 text-[15px] leading-relaxed">
              {memoScript(p, ctx).map((line, i) => <p key={i} className="mb-1.5 last:mb-0">{withPrompts(line)}</p>)}
            </div>
            <p className="text-3 mt-2 text-[12.5px]">Hold the mic button, 25 to 35 seconds, in your own words. Smile; it comes through. Highlighted bits: say them your way.</p>
            <Button className="mt-2" variant="primary" block size="lg" icon={<Mic className="size-5" />}
              onClick={() => window.open(dmLink(p)!, '_blank', 'noopener')}>Open the chat to record</Button>
          </section>

          <section className={clsx(!checked && 'pointer-events-none opacity-45')}>
            <StepTitle n={3}>Send this text right after</StepTitle>
            <Words text={afterMemo(p, ctx)} p={p} />
          </section>

          <section className={clsx(!checked && 'pointer-events-none opacity-45')}>
            <Button variant="success" block size="xl" icon={<Send className="size-5" />} loading={busy === 'sent'}
              onClick={async () => {
                await run('sent', { close: true });
                toast({ title: `${p.name}: sent`, body: `Follow-up due ${new Date(`${addDays(etToday(), 3)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}.`, tone: 'celebrate' });
                onSent?.();
              }}>I sent the memo and text</Button>
          </section>
          {where === 'instagram' || <Button variant="ghost" size="sm" loading={busy === 'no_ig'} onClick={() => run('no_ig', { ok: 'Marked No IG', close: true })}>Can't message them anywhere</Button>}
        </>
      )}
    </>
  );
}

/** "⟨their hook⟩" in a script becomes a highlighted prompt. */
function withPrompts(line: string) {
  return line.split(/(⟨[^⟩]+⟩)/).map((part, i) =>
    part.startsWith('⟨')
      ? <mark key={i} className="rounded-md bg-iris/15 px-1 text-iris">{part.slice(1, -1)}</mark>
      : <span key={i}>{part}</span>);
}

function ReplyPicker({ p, ctx, busy, run }: StepProps) {
  const [kind, setKind] = useState<ReplyKind | null>(null);
  const r = REPLIES.find((x) => x.kind === kind);
  return (
    <section>
      <StepTitle n={1}>They replied? Tap what they said</StepTitle>
      <div className="grid grid-cols-2 gap-2">
        {REPLIES.map((x) => (
          <button key={x.kind} type="button" onClick={() => setKind(x.kind)}
            className={clsx('rounded-2xl px-3 py-3 text-left text-[13.5px] font-semibold transition-colors',
              kind === x.kind ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'fill hover:bg-[var(--fill-2)]')}>
            {x.label}
          </button>
        ))}
      </div>
      {r && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 grid gap-2">
          <Words text={r.answer(p, ctx)} p={p} label="Copy & open chat" />
          <p className="text-3 text-[12.5px]">{r.after(ctx)}</p>
          <Button variant="success" size="lg" block loading={busy === 'replied'} icon={<CheckCircle2 className="size-5" />}
            onClick={() => run('replied', { note: r.kind, ok: 'Saved', close: r.kind === 'have_someone' || r.kind === 'not_interested' })}>
            I sent this reply
          </Button>
        </motion.div>
      )}
    </section>
  );
}

function Waiting({ p, ctx, busy, run }: StepProps) {
  const today = etToday();
  const due = !!p.next_follow_on && p.next_follow_on <= today;
  const waitingLast = p.status === 'sent' && p.follow_step >= 2;
  return (
    <>
      <Box>
        <p className="text-[14px]">
          Memo sent {p.sent_at ? new Date(p.sent_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}.{' '}
          {waitingLast ? 'Both follow-ups are done; they become "No reply" if nothing comes back in 3 days.'
            : p.status === 'info' ? `${ctx.closerFirst} is emailing them examples. Check in ${due ? 'today' : `on ${dayName(p.next_follow_on)}`}.`
              : due ? 'A follow-up is due today.' : `Next follow-up ${dayName(p.next_follow_on)}.`}
        </p>
      </Box>
      {due && !waitingLast && (
        <section>
          <StepTitle n={1}>{p.status === 'info' ? 'Check in' : p.follow_step === 0 ? 'Day-3 follow-up' : 'Last note (day 7)'}</StepTitle>
          <Words text={followUp(p)} p={p} />
          <Button className="mt-2" variant="success" block size="lg" loading={busy === 'followed'} icon={<Send className="size-5" />}
            onClick={() => run('followed', { ok: 'Follow-up sent', close: true })}>I sent the follow-up</Button>
        </section>
      )}
      <ReplyPicker p={p} ctx={ctx} busy={busy} run={run} />
    </>
  );
}

function BookIt({ busy, run, label = 'They booked' }: Omit<StepProps, 'ctx' | 'p'> & { label?: string }) {
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  return (
    <section>
      <StepTitle n={2}>{label}</StepTitle>
      <div className="grid gap-2">
        <Input type="datetime-local" label="Call time (Eastern)" value={when} onChange={(e) => setWhen(e.target.value)} />
        <Input label="Anything they said, for Isaiah" hint="optional" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="success" size="lg" block disabled={!when} loading={busy === 'booked'} icon={<CalendarCheck className="size-5" />}
          onClick={() => run('booked', { callAt: etToIso(when), note, ok: 'Booked! Isaiah has the details.', close: true })}>
          Mark booked
        </Button>
      </div>
    </section>
  );
}

function Replied({ p, ctx, busy, run }: StepProps) {
  return (
    <>
      {p.reply_kind === 'yes' && (
        <section>
          <StepTitle n={1}>Send the booking link (if you haven't)</StepTitle>
          <Words text={bookingText(p, ctx)} p={p} />
        </section>
      )}
      <BookIt busy={busy} run={run} />
      {p.reply_kind !== 'yes' && <ReplyPicker p={p} ctx={ctx} busy={busy} run={run} />}
    </>
  );
}

function Booked({ p, ctx, busy, run, runs }: StepProps & { runs: boolean }) {
  const tomorrow = addDays(etToday(), 1);
  const callDay = p.call_at ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(p.call_at)) : null;
  return (
    <>
      <Box>
        <p className="text-[15px] font-semibold">Call with {ctx.closerFirst}: {etTime(p.call_at)}</p>
        {p.reply_note && <p className="text-2 mt-1 text-[13px]">{p.reply_note}</p>}
      </Box>
      {callDay && callDay <= tomorrow && !p.reminded_at && (
        <section>
          <StepTitle n={1}>Day-before reminder</StepTitle>
          <Words text={reminderText(p, ctx, etTime(p.call_at, false))} p={p} />
          <Button className="mt-2" variant="success" block size="lg" loading={busy === 'reminded'} icon={<Send className="size-5" />}
            onClick={() => run('reminded', { ok: 'Reminder sent', close: true })}>I sent the reminder</Button>
        </section>
      )}
      {p.reminded_at && <p className="text-3 text-[13px]">Reminder sent ✓</p>}
      {runs && (
        <section>
          <StepTitle n={2}>After the call</StepTitle>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="success" size="lg" loading={busy === 'held'} icon={<CheckCircle2 className="size-5" />} onClick={() => run('held', { ok: 'Held: the setter gets her $50' })}>Held</Button>
            <Button size="lg" loading={busy === 'no_show'} icon={<X className="size-5" />} onClick={() => run('no_show', { ok: 'Marked no-show; the setter will rebook' })}>No-show</Button>
          </div>
        </section>
      )}
      <BookIt busy={busy} run={run} label="They moved the time" />
    </>
  );
}

function NoShow({ p, ctx, busy, run }: StepProps) {
  return (
    <>
      <section>
        <StepTitle n={1}>They missed the call: offer another time</StepTitle>
        <Words text={noShowText(p, ctx)} p={p} />
      </section>
      <BookIt busy={busy} run={run} label="They rebooked" />
    </>
  );
}

const dayName = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'soon';
