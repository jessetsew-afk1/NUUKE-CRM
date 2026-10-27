/**
 * Outreach. A setter gets "Today": what's due, in order, one tap each. The closer
 * and admins get the board: every prospect, the numbers, Held / No-show, settings.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { AlarmClock, CalendarCheck, ChevronRight, Clock, MessageCircle, Mic, PartyPopper, Plus, Reply, Settings2, Sparkles, Timer } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { useSettings } from '@/data/common';
import {
  etTime, etToday, queues, READY, STATUS, useOutreachNumbers, useProspects, type Prospect,
} from '@/data/outreach';
import { supabase } from '@/lib/supabase';
import { ProspectSheet } from '@/outreach/ProspectSheet';
import type { ScriptContext } from '@/outreach/scripts';
import { Button, Empty, Input, PageHeader, Panel, Picker, Pill, Ring, Sheet, Skeleton, Stat, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { ProspectRows } from './OutreachList';
import { usePeople } from '@/data/common';

const PACE_KEY = 'nuuke-outreach-pace';
const PACE_SECONDS = 90;

export function useScriptContext(setterName?: string | null): ScriptContext & { ready: boolean } {
  const settings = useSettings();
  const { profile } = useAuth();
  const nums = useOutreachNumbers(profile?.role === 'setter' ? profile.id : null);
  const s = settings.data;
  const closer = nums.data?.closer_name ?? 'Isaiah';
  return {
    ready: !!s,
    setter: setterName ?? profile?.full_name ?? 'Ashley',
    closer,
    closerFirst: closer.split(/\s+/)[0],
    bookingLink: s?.outreach_booking_link ?? '[booking link]',
    bookingMessage: s?.outreach_booking_message ?? 'Hi [Name]! Here\'s the link to grab a time: [link]',
    payPerHeld: Number(s?.outreach_pay_per_held ?? 50),
  };
}

export default function OutreachPage() {
  const { profile } = useAuth();
  const settings = useSettings();
  if (profile?.role === 'setter') return <SetterToday />;
  const runs = profile?.role === 'admin' || (!!settings.data && settings.data.outreach_closer_id === profile?.id);
  if (!settings.data) return <Skeleton className="h-40" />;
  if (!runs) return <Empty title="Outreach isn't yours to run" body="The closer and admins follow the appointment setters here." />;
  return <Board />;
}

/* ================================================================ the setter */
function SetterToday() {
  const { profile } = useAuth();
  const rows = useProspects();
  const nums = useOutreachNumbers(profile?.id);
  const ctx = useScriptContext();
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('p')) || null;
  const [paceUntil, setPaceUntil] = useState<number>(() => { try { return Number(localStorage.getItem(PACE_KEY)) || 0; } catch { return 0; } });
  const [now, setNow] = useState(Date.now());
  const [replyPick, setReplyPick] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const q = queues(rows.data);
  const open = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('p', String(id)); else next.delete('p');
    setParams(next, { replace: true });
  };
  const current = rows.data?.find((p) => p.id === openId) ?? null;
  const n = nums.data;
  const pace = Math.max(0, Math.ceil((paceUntil - now) / 1000));
  const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const startPace = () => {
    const until = Date.now() + PACE_SECONDS * 1000;
    setPaceUntil(until);
    try { localStorage.setItem(PACE_KEY, String(until)); } catch { /* fine */ }
  };
  const nextUp = q.next[0];
  const doneToday = n ? n.touches_today >= n.target : false;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5 flex items-center gap-4">
        <div className="relative">
          <Ring value={n?.touches_today ?? 0} max={n?.target ?? 10} size={86} stroke={9} />
          <div className="absolute inset-0 grid place-items-center text-center leading-none">
            <div><div className="tabular text-[22px] font-extrabold">{n?.touches_today ?? 0}</div><div className="text-3 text-[11px] font-semibold">of {n?.target ?? 10}</div></div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-3 text-[12px] font-bold uppercase tracking-[0.14em]">Today</div>
          <h1 className="text-[26px] font-extrabold leading-tight">{doneToday ? 'Target hit! 🎉' : `Hi ${(profile?.full_name ?? '').split(' ')[0]}`}</h1>
          <p className="text-2 text-[13.5px]">Memos and follow-ups both count. {n ? `$${n.earned.toLocaleString()} earned from ${n.all.held} held calls.` : ''}</p>
        </div>
      </div>

      {(etHour < 10 || etHour >= 16) && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-info/30 bg-info/10 px-4 py-2.5 text-[13px]">
          <Clock className="size-4 shrink-0 text-info" /> Best between 10 AM and 4 PM Eastern, when they check messages between patients.
        </div>
      )}

      <div className="mb-5 grid grid-cols-4 gap-2 text-center">
        {[
          ['Sent', n?.week.memos], ['Replies', n?.week.replies], ['Booked', n?.week.booked], ['Held', n?.week.held],
        ].map(([label, v]) => (
          <div key={label as string} className="fill rounded-2xl py-2.5">
            <div className="tabular text-[20px] font-extrabold">{v ?? '–'}</div>
            <div className="text-3 text-[11px] font-semibold">{label} this week</div>
          </div>
        ))}
      </div>

      {rows.isLoading ? <Skeleton className="h-48" /> : (
        <div className="grid gap-5">
          <Queue title="Remind about tomorrow's call" icon={<AlarmClock className="size-4" />} tone="warn" rows={q.remind} onOpen={open}
            meta={(p) => etTime(p.call_at)} cta="Send reminder" />
          <Queue title="Missed their call: rebook" icon={<CalendarCheck className="size-4" />} tone="warn" rows={q.noShow} onOpen={open} cta="Rebook" />
          <Queue title="Said yes: get them booked" icon={<PartyPopper className="size-4" />} tone="good" rows={q.replies} onOpen={open} cta="Book" />
          <Queue title="Follow-ups due" icon={<Reply className="size-4" />} tone="info" rows={q.followUps} onOpen={open}
            meta={(p) => (p.status === 'info' ? 'Check in after the examples' : p.follow_step === 0 ? 'Day-3 bump' : 'Last note')} cta="Follow up" />

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[15px] font-extrabold"><Mic className="size-4 text-iris" /> Next memo</h2>
              <span className="text-3 text-[12.5px]">{q.next.length} left{q.later.length ? ` · ${q.later.length} more from Thu` : ''}</span>
            </div>
            {pace > 0 && nextUp && (
              <div className="mb-2 flex items-center gap-3 rounded-2xl bg-iris/10 px-4 py-3 text-[13.5px]">
                <Timer className="size-5 shrink-0 text-iris" />
                <span className="flex-1">Give Instagram a breather: next memo in <b className="tabular">{Math.floor(pace / 60)}:{String(pace % 60).padStart(2, '0')}</b></span>
                <button className="text-3 text-[12px] underline" onClick={() => setPaceUntil(0)}>skip</button>
              </div>
            )}
            {nextUp ? (
              <NextCard p={nextUp} waiting={pace > 0} onStart={() => open(nextUp.id)} />
            ) : (
              <Panel><p className="text-2 text-[14px]">{q.later.length ? `That's everyone for now. List B opens ${new Date(`${q.later[0].available_on}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}.` : 'Nobody new left. Isaiah adds the next batch.'}</p></Panel>
            )}
          </section>

          <Button variant="glass" size="lg" icon={<MessageCircle className="size-5" />} onClick={() => setReplyPick(true)}>Someone replied</Button>

          {q.upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-extrabold"><CalendarCheck className="size-4 text-ok" /> Booked calls</h2>
              <ProspectRows rows={q.upcoming} onOpen={open} meta={(p) => etTime(p.call_at)} />
            </section>
          )}
        </div>
      )}

      <ReplyPicker open={replyPick} rows={(rows.data ?? []).filter((p) => ['sent', 'info', 'replied', 'no_show', 'booked'].includes(p.status))}
        onClose={() => setReplyPick(false)} onPick={(id) => { setReplyPick(false); open(id); }} />
      <ProspectSheet prospect={current} ctx={ctx} runs={false} onClose={() => open(null)} onSent={startPace} />
    </div>
  );
}

function Queue({ title, icon, tone, rows, onOpen, meta, cta }: {
  title: string; icon: ReactNode; tone: 'warn' | 'good' | 'info'; rows: Prospect[]; onOpen: (id: number) => void; meta?: (p: Prospect) => string; cta: string;
}) {
  if (!rows.length) return null;
  const color = tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-ok' : 'text-info';
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[15px] font-extrabold"><span className={color}>{icon}</span>{title}<span className="text-3 text-[13px] font-semibold">{rows.length}</span></h2>
      <div className="grid gap-2">
        {rows.map((p) => (
          <motion.button key={p.id} layout whileTap={{ scale: 0.98 }} onClick={() => onOpen(p.id)}
            className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p.name}</div>
              <div className="text-2 truncate text-[12.5px]">{meta ? meta(p) : p.practice}</div>
            </div>
            <span className="text-[13px] font-bold text-iris">{cta}</span>
            <ChevronRight className="text-3 size-4" />
          </motion.button>
        ))}
      </div>
    </section>
  );
}

function NextCard({ p, waiting, onStart }: { p: Prospect; waiting: boolean; onStart: () => void }) {
  return (
    <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-strong overflow-hidden rounded-[26px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[20px] font-extrabold leading-tight">{p.name}</div>
          <div className="text-2 truncate text-[13px]">{p.full_name ? `${p.full_name} · ` : ''}{p.practice}</div>
        </div>
        <Pill tone={READY[p.ready].tone}>{READY[p.ready].label}</Pill>
      </div>
      {p.line && (
        <p className="mt-3 rounded-2xl bg-iris/10 px-4 py-3 text-[14.5px] leading-relaxed">
          <Sparkles className="mr-1.5 inline size-4 text-iris" />“{p.line}”
        </p>
      )}
      <Button className="mt-4" variant="primary" size="xl" block disabled={waiting} onClick={onStart} iconRight={<ChevronRight className="size-5" />}>
        {waiting ? 'Almost…' : p.instagram ? `Start @${p.instagram}` : 'Start'}
      </Button>
    </motion.div>
  );
}

function ReplyPicker({ open, rows, onClose, onPick }: { open: boolean; rows: Prospect[]; onClose: () => void; onPick: (id: number) => void }) {
  const [q, setQ] = useState('');
  const shown = rows.filter((p) => !q.trim() || `${p.name} ${p.full_name ?? ''} ${p.instagram ?? ''} ${p.practice ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title="Who replied?" width={520}>
      <Input autoFocus placeholder="Name, @handle or practice" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-3"><ProspectRows rows={shown} onOpen={onPick} /></div>
    </Sheet>
  );
}

/* ======================================================= closer and admins */
function Board() {
  const { profile } = useAuth();
  const rows = useProspects();
  const people = usePeople();
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('p')) || null;
  const [filter, setFilter] = useState<string>('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const setterIds = useMemo(() => [...new Set((rows.data ?? []).map((p) => p.setter_id).filter(Boolean))] as string[], [rows.data]);
  const [setter, setSetter] = useState<string | null>(null);
  const setterId = setter ?? setterIds[0] ?? null;
  const nums = useOutreachNumbers(setterId);
  const setterName = people.data?.find((p) => p.id === setterId)?.full_name ?? nums.data?.setter_name ?? null;
  const ctx = useScriptContext(setterName);
  const open = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('p', String(id)); else next.delete('p');
    setParams(next, { replace: true });
  };
  const mine = (rows.data ?? []).filter((p) => !setterId || p.setter_id === setterId);
  const counts = mine.reduce<Record<string, number>>((m, p) => ({ ...m, [p.status]: (m[p.status] ?? 0) + 1 }), {});
  const shown = filter === 'all' ? mine : mine.filter((p) => p.status === filter);
  const current = rows.data?.find((p) => p.id === openId) ?? null;
  const n = nums.data;
  const booked = mine.filter((p) => p.status === 'booked').sort((a, b) => (a.call_at ?? '').localeCompare(b.call_at ?? ''));

  return (
    <div>
      <PageHeader eyebrow="Outreach" title="Appointment setting"
        sub={`Instagram voice memos that book calls for ${ctx.closerFirst}. Mark each call Held or No-show after it happens.`}
        right={<>
          {profile?.role === 'admin' && <Button icon={<Settings2 className="size-4" />} onClick={() => setEditing(true)}>Settings</Button>}
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add prospect</Button>
        </>} />

      {setterIds.length > 1 && (
        <Picker className="mb-4 max-w-xs" label="Setter" value={setterId} onChange={setSetter}
          options={setterIds.map((id) => ({ value: id, label: people.data?.find((p) => p.id === id)?.full_name ?? 'Setter' }))} />
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Sent this week" value={n?.week.memos ?? '–'} sub={`${n?.week.follow_ups ?? 0} follow-ups · today ${n?.touches_today ?? 0}/${n?.target ?? 0}`} accent="#5AB8FF" />
        <Stat label="Replies" value={n?.week.replies ?? '–'} sub={`${n?.all.replies ?? 0} all time · goal 1 in 5`} accent="#7C5CFF" />
        <Stat label="Booked" value={n?.week.booked ?? '–'} sub={`${n?.all.booked ?? 0} all time`} accent="#FFC23A" />
        <Stat label="Held" value={n?.week.held ?? '–'} sub={`$${(n?.earned ?? 0).toLocaleString()} owed in total`} accent="#30C46C" />
        <Stat label="No IG" value={n?.week.no_ig ?? '–'} sub={`${n?.all.left ?? 0} prospects left`} accent="#8E8AA0" />
      </div>

      {booked.length > 0 && (
        <Panel className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold"><CalendarCheck className="size-4 text-ok" /> Booked calls</h3>
          <ProspectRows rows={booked} onOpen={open} meta={(p) => `${etTime(p.call_at)}${p.reply_note ? ` · ${p.reply_note}` : ''}`} />
        </Panel>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {[['all', 'All', mine.length] as const, ...Object.keys(STATUS).filter((k) => counts[k]).map((k) => [k, STATUS[k].label, counts[k]] as const)].map(([k, label, c]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={clsx('h-9 rounded-full px-3.5 text-[13px] font-semibold', filter === k ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'fill')}>
            {label} <span className="opacity-60">{c}</span>
          </button>
        ))}
      </div>
      <Panel padded={false} className="p-2">
        {rows.isLoading ? <Skeleton className="h-40" /> : <ProspectRows rows={shown} onOpen={open} showStatus />}
      </Panel>

      <ProspectSheet prospect={current} ctx={ctx} runs onClose={() => open(null)} />
      <AddProspect open={adding} onClose={() => setAdding(false)} setterId={setterId} next={(rows.data ?? []).reduce((m, p) => Math.max(m, p.position), 0) + 1} />
      {profile?.role === 'admin' && <OutreachSettings open={editing} onClose={() => setEditing(false)} />}
    </div>
  );
}

function AddProspect({ open, onClose, setterId, next }: { open: boolean; onClose: () => void; setterId: string | null; next: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const blank = { name: '', full_name: '', practice: '', hook: '', instagram: '', line: '', available_on: etToday() };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    const handle = f.instagram.trim().replace(/^(https?:\/\/)?(www\.)?(instagram\.com\/)?@?/i, '').replace(/\/.*$/, '').toLowerCase();
    const { error } = await supabase.from('outreach_prospects').insert({
      position: next, list: 'C', available_on: f.available_on, name: f.name.trim(), full_name: f.full_name.trim() || null,
      practice: f.practice.trim() || null, hook: f.hook.trim() || null, instagram: handle || null, ig_confirmed: !!handle,
      line: f.line.trim() || null, ready: handle ? 'check' : 'search', setter_id: setterId,
    });
    setBusy(false);
    if (error) { toast({ title: 'Couldn\'t add them', body: error.message, tone: 'danger' }); return; }
    toast({ title: `${f.name} added to the list`, tone: 'success' });
    void qc.invalidateQueries({ queryKey: ['outreach'] });
    setF(blank);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a prospect" width={560}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.name.trim()} loading={busy} onClick={save}>Add</Button></>}>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="How to greet them" placeholder="Dr. Smith" value={f.name} onChange={set('name')} />
          <Input label="Full name" hint="optional" value={f.full_name} onChange={set('full_name')} />
          <Input label="Website" value={f.practice} onChange={set('practice')} />
          <Input label="Instagram" placeholder="handle" value={f.instagram} onChange={set('instagram')} />
        </div>
        <Input label="Hook (what Isaiah emailed about)" value={f.hook} onChange={set('hook')} />
        <Textarea label="The one personal line" hint="under 20 words" rows={2} value={f.line} onChange={set('line')} />
        <Input label="Start from" type="date" value={f.available_on} onChange={set('available_on')} />
      </div>
    </Sheet>
  );
}

function OutreachSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const people = usePeople();
  const qc = useQueryClient();
  const toast = useToast();
  const s = settings.data;
  const [f, setF] = useState({ link: '', message: '', closer: '', pay: '50' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && s) setF({ link: s.outreach_booking_link ?? '', message: s.outreach_booking_message ?? '', closer: s.outreach_closer_id ?? '', pay: String(s.outreach_pay_per_held ?? 50) });
  }, [open, s]);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('settings').update({
      outreach_booking_link: f.link.trim() || null, outreach_booking_message: f.message.trim() || null,
      outreach_closer_id: f.closer || null, outreach_pay_per_held: Number(f.pay) || 0,
    }).eq('id', true);
    setBusy(false);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    toast({ title: 'Outreach settings saved', tone: 'success' });
    void qc.invalidateQueries();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Outreach settings" width={600}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid gap-3">
        <Picker label="Closer (gets the booked calls)" value={f.closer || null} onChange={(v) => setF({ ...f, closer: v })}
          options={(people.data ?? []).filter((p) => p.is_active && (p.role === 'sales' || p.role === 'admin')).map((p) => ({ value: p.id, label: p.full_name }))} />
        <Input label="Booking link" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
        <Textarea label="Message sent with the booking link" hint="[Name] and [link] are filled in" rows={4} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
        <Input label="Paid per held call (USD)" inputMode="decimal" value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value.replace(/[^\d.]/g, '') })} />
      </div>
    </Sheet>
  );
}
