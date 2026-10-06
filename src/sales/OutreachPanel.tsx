import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Ban, ChevronDown, Mail, MessageSquareText, MousePointerClick, PhoneCall, ScanSearch, Send, Sparkles, Star, Zap } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useSettings } from '@/data/common';
import type { Lead } from '@/lib/types';
import { Pill } from '@/ui/kit';
import { buildOutreach, type EmailMsg, type TextMsg } from './outreach';
import { contactsOf } from '@/lib/phones';
import { CopyButton } from './LeadCard';
import { QuickMessages } from './QuickMessages';

type Tab = 'texts' | 'emails' | 'call' | 'quick';
const OPEN_KEY = 'nuuke-outreach-open';
const TAB_KEY = 'nuuke-outreach-tab';

/**
 * Message ideas for the lead on screen, written from the details in their query (or
 * their service when there's no query), plus the rep's own saved quick messages.
 * Everything is editable before copying; edits reset when the next card comes up.
 */
export function OutreachPanel({ lead }: { lead: Lead }) {
  const { profile } = useAuth();
  const settings = useSettings();
  const [tab, setTabState] = useState<Tab>(() => { try { return (localStorage.getItem(TAB_KEY) as Tab) || 'texts'; } catch { return 'texts'; } });
  const setTab = (t: Tab) => { setTabState(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ } };
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* ignore */ } }, [open]);

  const o = useMemo(() => buildOutreach({
    lead,
    repName: profile?.full_name ?? '',
    repTitle: profile?.title,
    company: settings.data?.company_name ?? 'NUUKE',
    pitch: settings.data?.company_pitch,
    website: settings.data?.company_website,
    bookingLink: settings.data?.booking_link,
  }), [lead, profile, settings.data]);

  const email = contactsOf(lead).emails[0]?.value ?? null;

  // Never hand a rep words to send someone who asked not to be contacted.
  if (lead.status === 'do_not_call' || lead.closed_reason === 'do_not_call') {
    return (
      <section className="flex items-center gap-3 rounded-[24px] bg-bad/10 px-5 py-4 text-[13.5px] font-semibold text-bad">
        <Ban className="size-4 shrink-0" /> Do not call. No texts or emails for this lead.
      </section>
    );
  }

  return (
    <section className="glass rounded-[28px]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-iris/15 text-iris"><Sparkles className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold">Message ideas</span>
          <span className="text-2 block truncate text-[12.5px]">
            {o.basedOn === 'query' ? 'Written from what they wrote' : o.basedOn === 'service' ? 'No query, so written from the service they picked' : 'No query or service on this lead, so a general version'}
            {' · '}<i>{o.about}</i>
          </span>
        </span>
        <span className="hidden shrink-0 sm:block"><Pill tone="iris">{o.topicLabel}</Pill></span>
        <ChevronDown className={clsx('size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
            <div className="px-5 pb-5">
              {o.facts.length > 0 && tab !== 'quick' && (
                <div className="mb-4 rounded-[20px] bg-iris/8 p-3.5 ring-1 ring-iris/20">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-iris"><ScanSearch className="size-3.5" />What they told us</div>
                  <dl className="flex flex-wrap gap-1.5">
                    {o.facts.map((f) => (
                      <div key={`${f.label}-${f.value}`} className="inline-flex max-w-full items-baseline gap-1.5 rounded-full bg-[var(--glass-strong)] px-2.5 py-1 text-[12.5px] ring-1 ring-[var(--hairline)]">
                        <dt className="text-3 shrink-0 font-bold">{f.label}</dt>
                        <dd className="truncate font-semibold" title={f.value}>{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <Tabs value={tab} onChange={setTab} options={[
                { value: 'texts', icon: <MessageSquareText className="size-4" />, label: 'Texts', count: o.texts.length },
                { value: 'emails', icon: <Mail className="size-4" />, label: 'Emails', count: o.emails.length },
                { value: 'call', icon: <PhoneCall className="size-4" />, label: 'Call opener', short: 'Call' },
                { value: 'quick', icon: <Zap className="size-4" />, label: 'My quick messages', short: 'My quick' },
              ]} />

              {tab === 'texts' && (
                <div className="space-y-3">
                  <p className="text-3 flex items-center gap-1.5 text-[12px]"><MousePointerClick className="size-3.5" />Tweak the wording if you like, then Copy and paste it into Zoom Phone's text box.</p>
                  {o.texts.map((t) => <TextCard key={`${lead.id}-${t.id}`} msg={t} />)}
                </div>
              )}
              {tab === 'emails' && (
                <div className="space-y-3">
                  {!email && <p className="rounded-2xl bg-warn/12 px-3.5 py-2.5 text-[13px] font-semibold text-warn">This lead has no email address. Add one with Edit, or copy the text to use elsewhere.</p>}
                  {o.emails.map((m) => <EmailCard key={`${lead.id}-${m.id}`} msg={m} to={email} />)}
                </div>
              )}
              {tab === 'call' && (
                <div className="space-y-3">
                  <ScriptBlock title="Open with" text={o.call.opener} />
                  <ScriptBlock title="If they say go ahead" text={o.call.reason} />
                  <div className="fill rounded-[20px] p-4">
                    <div className="text-3 mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">Questions to ask</div>
                    <ol className="list-decimal space-y-1.5 pl-5 text-[14px] font-medium">
                      {o.call.questions.map((q) => <li key={q}>{q}</li>)}
                    </ol>
                  </div>
                  <ScriptBlock title="“Not interested”" text={o.call.notInterested} />
                  <ScriptBlock title="“We already hired someone”" text={o.call.alreadyHired} />
                </div>
              )}
              {tab === 'quick' && <QuickMessages lead={lead} company={settings.data?.company_name ?? 'NUUKE'} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Four tabs that always fit: icon over a short label on a phone, side by side on wider screens. */
function Tabs({ value, onChange, options }: {
  value: Tab;
  onChange: (t: Tab) => void;
  options: { value: Tab; icon: ReactNode; label: string; short?: string; count?: number }[];
}) {
  return (
    <div className="fill mb-4 grid grid-cols-4 gap-1 rounded-[14px] p-1" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} aria-label={o.label} onClick={() => onChange(o.value)}
          className={clsx('relative min-w-0 rounded-[11px] px-1.5 py-1.5 font-semibold transition-colors', o.value === value ? 'text-[color:var(--text)]' : 'text-2 hover:text-[color:var(--text)]')}>
          {o.value === value && <motion.span layoutId="outreach-tab" transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-[11px] bg-[var(--glass-strong)] shadow-[0_2px_8px_rgba(0,0,0,0.08)]" />}
          <span className="relative flex min-w-0 flex-col items-center justify-center gap-0.5 sm:flex-row sm:gap-1.5">
            {o.icon}
            <span className="max-w-full truncate text-[11px] sm:text-[13px]">
              <span className="sm:hidden">{o.short ?? o.label}</span><span className="hidden sm:inline">{o.label}</span>
              {o.count !== undefined && <span className="text-3 ml-1">{o.count}</span>}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** A textarea that grows with its text and looks like a message bubble. */
function Editable({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={2} spellCheck
      className={clsx('w-full resize-none rounded-2xl border border-transparent bg-transparent px-0 py-0 text-[14px] leading-relaxed outline-none focus:border-[var(--hairline)] focus:bg-[var(--fill)] focus:px-2 focus:py-1.5', className)} />
  );
}

function TextCard({ msg }: { msg: TextMsg }) {
  const [text, setText] = useState(msg.text);
  const long = text.length > 320;
  return (
    <div className={clsx('rounded-[20px] p-4', msg.suggested ? 'bg-iris/10 ring-1 ring-iris/30' : 'fill')}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[12px] font-bold">{msg.label}</span>
        {msg.suggested && <span className="inline-flex items-center gap-1 rounded-full bg-iris px-2 py-0.5 text-[10px] font-bold text-white"><Star className="size-3" />Good fit now</span>}
        <span className={clsx('tabular ml-auto text-[11px] font-semibold', long ? 'text-warn' : 'text-3')}>{text.length} chars{long && ' · may split into 2 texts'}</span>
      </div>
      <Editable value={text} onChange={setText} />
      <div className="mt-2 flex justify-end">
        <CopyButton value={text} label="Text" quiet />
      </div>
    </div>
  );
}

function EmailCard({ msg, to }: { msg: EmailMsg; to: string | null }) {
  const [subject, setSubject] = useState(msg.subject);
  const [body, setBody] = useState(msg.body);
  const href = to ? `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : undefined;
  return (
    <div className={clsx('rounded-[20px] p-4', msg.suggested ? 'bg-iris/10 ring-1 ring-iris/30' : 'fill')}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12px] font-bold">{msg.label}</span>
        {msg.suggested && <span className="inline-flex items-center gap-1 rounded-full bg-iris px-2 py-0.5 text-[10px] font-bold text-white"><Star className="size-3" />Good fit now</span>}
      </div>
      <div className="mb-2 flex items-center gap-2 border-b border-[var(--hairline)] pb-2">
        <span className="text-3 text-[12px] font-bold">Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[14px] font-bold outline-none" />
      </div>
      <Editable value={body} onChange={setBody} />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <CopyButton value={subject} label="Subject" quiet />
        <CopyButton value={body} label="Email" quiet />
        <a href={href} aria-disabled={!href}
          className={clsx('inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold', href ? 'bg-[var(--btn)] text-[color:var(--btn-text)] hover:brightness-110' : 'fill pointer-events-none opacity-40')}>
          <Send className="size-3.5" /> Open in email
        </a>
      </div>
    </div>
  );
}

function ScriptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="fill rounded-[20px] p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-3 text-[11px] font-bold uppercase tracking-[0.14em]">{title}</span>
        <CopyButton value={text} label="Line" quiet className="ml-auto !h-7 !px-2 !text-[12px]" />
      </div>
      <p className="text-[14.5px] font-medium leading-relaxed">{text}</p>
    </div>
  );
}
