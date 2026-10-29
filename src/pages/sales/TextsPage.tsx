/**
 * Texts: a salesperson's text kit. "Send text" copies the lead's message and opens a
 * new Zoom Phone text with their number already in; they paste, check, send, then tick
 * what happened. Only offered between 9am and 8pm in the lead's own time zone.
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Ban, Check, Clock, Copy, Gift, History, MessageSquareText, Reply, RotateCcw, Search, Send, X } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { usePeople } from '@/data/common';
import {
  KIT_STATUS, TEXT_FROM, TEXT_UNTIL, assignTexts, localTime, prettyPhone, signedMessage, tidyAsk, useMarkText, useTextKit, versionStats, zoomSmsHref,
  type KitStatus, type KitText,
} from '@/data/textKit';
import { dayShort, pct } from '@/lib/format';
import { Button, Chip, Empty, Input, PageHeader, Panel, Picker, Pill, Skeleton } from '@/ui/kit';
import { useToast } from '@/ui/toast';

const FILTERS: { key: KitStatus | 'all'; label: string }[] = [
  { key: 'to_text', label: 'To text' },
  { key: 'texted', label: 'Texted' },
  { key: 'replied', label: 'Replied' },
  { key: 'opted_out', label: 'Opted out' },
  { key: 'all', label: 'All' },
];

const VERSION_NOTE = { A: 'Free offer up front', B: 'An idea for their project, then the offer' } as const;

/** Re-render every minute so "their time" and the 9am–8pm window stay current. */
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

/** Short names for the zones a kit can hold. */
const ZONE_NAME: Record<string, string> = {
  'America/New_York': 'Eastern', 'America/Chicago': 'Central', 'America/Denver': 'Mountain', 'America/Phoenix': 'Arizona',
  'America/Los_Angeles': 'Pacific', 'America/Anchorage': 'Alaska', 'Pacific/Honolulu': 'Hawaii', 'America/Puerto_Rico': 'Puerto Rico',
};
const zoneName = (tz: string) => ZONE_NAME[tz] ?? tz.split('/').pop()!.replace(/_/g, ' ');

/** Minutes ahead of UTC right now, so zones list east to west. */
function utcOffset(tz: string, now: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - now.getTime()) / 60_000;
}

type ZoneKey = 'all' | 'open' | string;

/** Lower-case, without accents, so "jose" finds "José". */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** A search matches the name, or the number once three or more digits are typed. */
function matches(r: KitText, term: string) {
  const digits = term.replace(/\D/g, '');
  return fold(r.name).includes(fold(term)) || (digits.length >= 3 && r.phone.replace(/\D/g, '').includes(digits));
}

export default function TextsPage() {
  const { profile } = useAuth();
  const rows = useTextKit();
  const people = usePeople();
  const now = useMinute();
  const [filter, setFilter] = useState<KitStatus | 'all'>('to_text');
  const [zone, setZone] = useState<ZoneKey>('all');
  const [q, setQ] = useState('');
  const [who, setWho] = useState<string>('all');
  const term = q.trim();
  const everyone = rows.data ?? [];
  const isAdmin = profile?.role === 'admin';
  // Admins see every kit; they can narrow it to one person's list.
  const all = who === 'all' ? everyone : everyone.filter((r) => r.owner_id === who);
  const inStatus = all.filter((r) => filter === 'all' || r.status === filter);
  const inZone = (r: KitText, z: ZoneKey) => z === 'all' || (z === 'open' ? localTime(r.time_zone, now).ok : r.time_zone === z);
  const zones = [...new Set(all.map((r) => r.time_zone))].sort((a, b) => utcOffset(b, now) - utcOffset(a, now));
  // A search looks through every list, so a name is found whether or not they've been texted yet.
  const shown = term ? all.filter((r) => matches(r, term)) : inStatus.filter((r) => inZone(r, zone));
  const owners = [...new Set(everyone.map((r) => r.owner_id))];
  const ownerName = (id: string) => (id === profile?.id ? profile.full_name : people.data?.find((p) => p.id === id)?.full_name) ?? 'someone';
  const forOthers = owners.some((id) => id !== profile?.id);
  const kits = [...new Set(all.map((r) => r.kit))];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={kits.length ? `${kits.join(' & ')} text kit` : 'Text kit'}
        title="Texts"
        sub={forOthers
          ? `${everyone.length} leads for ${owners.map(ownerName).join(', ')} to text from Zoom.`
          : `${all.length} leads to text from Zoom, newest first. Send text copies the message and opens Zoom with their number in. Paste it, check it, send.`}
      />

      <Panel className="mb-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#0B5CFF1f] text-[#0B5CFF]"><MessageSquareText className="size-[18px]" /></span>
          <ul className="text-2 grid gap-1 text-[13.5px]">
            <li><b className="text-[color:var(--text)]">One at a time.</b> Tap Send text, press <b className="text-[color:var(--text)]">Ctrl+V</b> (⌘V on a Mac, or hold and Paste on a phone) in Zoom, then send.</li>
            <li>Only between {hourLabel(TEXT_FROM)} and {hourLabel(TEXT_UNTIL)} their time. The button waits outside those hours.</li>
            <li>Zoom adds the opt-out line. If they reply STOP or "no", tick <b className="text-[color:var(--text)]">Opted out</b> and never text them again.</li>
          </ul>
        </div>
      </Panel>

      {isAdmin && <HandOut everyone={everyone} ownerName={ownerName} />}

      {isAdmin && owners.length > 1 && (
        <div className="scroll-x mb-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible" aria-label="Whose list">
          <Chip active={who === 'all'} onClick={() => setWho('all')} count={everyone.length}>Everyone</Chip>
          {owners.map((id) => (
            <Chip key={id} active={who === id} onClick={() => setWho(id)} count={everyone.filter((r) => r.owner_id === id).length}>{ownerName(id)}</Chip>
          ))}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {versionStats(all).map((v) => (
          <Panel key={v.version} className="!p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Pill tone={v.version === 'A' ? 'info' : 'iris'} solid>Version {v.version}</Pill>
                <span className="text-2 text-[12.5px]">{VERSION_NOTE[v.version]}</span>
              </div>
            </div>
            <div className="tabular mt-3 flex items-baseline gap-4 text-[13px]">
              <span><b className="font-display text-[22px] font-extrabold">{v.sent}</b><span className="text-2"> / {v.total} texted</span></span>
              <span><b className="font-display text-[22px] font-extrabold">{v.replied}</b><span className="text-2"> replied{v.rate !== null ? ` (${pct(v.rate)})` : ''}</span></span>
              {v.optedOut > 0 && <span className="text-2">{v.optedOut} opted out</span>}
            </div>
          </Panel>
        ))}
      </div>

      <div className="relative mb-3">
        <Input placeholder="Search by name or number" value={q} onChange={(e) => setQ(e.target.value)}
          leading={<Search className="size-4" />} aria-label="Search texts" />
        {q && (
          <button onClick={() => setQ('')} aria-label="Clear search"
            className="text-3 absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full hover:bg-[var(--fill)]">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className={clsx('scroll-x mb-3 flex gap-2 overflow-x-auto pb-1', term && 'opacity-50')}>
        {FILTERS.map((f) => (
          <Chip key={f.key} active={!term && filter === f.key} onClick={() => { setQ(''); setFilter(f.key); }}
            count={all.filter((r) => (f.key === 'all' || r.status === f.key) && inZone(r, zone)).length}>{f.label}</Chip>
        ))}
      </div>

      {zones.length > 1 && (
        <div className={clsx('scroll-x mb-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible', term && 'opacity-50')} aria-label="Time zones">
          <Chip active={!term && zone === 'all'} onClick={() => { setQ(''); setZone('all'); }} count={inStatus.length}>All time zones</Chip>
          <Chip active={!term && zone === 'open'} onClick={() => { setQ(''); setZone('open'); }} dot="#30C46C"
            count={inStatus.filter((r) => inZone(r, 'open')).length}>Open now</Chip>
          {zones.map((z) => {
            const t = localTime(z, now);
            return (
              <Chip key={z} active={!term && zone === z} onClick={() => { setQ(''); setZone(z); }} dot={t.ok ? '#30C46C' : '#8E8AA0'}
                count={inStatus.filter((r) => r.time_zone === z).length}>{zoneName(z)} · {t.label}</Chip>
            );
          })}
        </div>
      )}

      {term && !rows.isLoading && (
        <p className="text-2 mb-3 text-[13px]">{shown.length} {shown.length === 1 ? 'match' : 'matches'} for “{term}” across every list.</p>
      )}
      {rows.isLoading ? <Skeleton className="h-64" /> : shown.length ? (
        <div className="grid grid-cols-1 gap-3">
          {shown.map((r) => <TextCard key={r.id} r={r} now={now} sender={ownerName(r.owner_id)} owner={isAdmin && owners.length > 1 ? ownerName(r.owner_id) : null} />)}
        </div>
      ) : (
        <Empty
          title={term ? 'Nobody by that name' : zone !== 'all' && inStatus.length ? (zone === 'open' ? 'Nobody is in texting hours right now' : `Nobody here in ${zoneName(zone)}`) : filter === 'to_text' ? 'Everyone has been texted' : 'Nobody here'}
          body={term ? 'Try part of their first or last name, or their number.'
            : zone !== 'all' && inStatus.length ? `Texting opens at ${hourLabel(TEXT_FROM)} in each lead's own time zone. Try another zone.`
            : filter === 'to_text' ? 'Check Texted for anyone who replies.' : undefined} />
      )}
    </div>
  );
}

/** Admins hand leads still to text from one person to another, e.g. 50 to each setter. */
function HandOut({ everyone, ownerName }: { everyone: KitText[]; ownerName: (id: string) => string }) {
  const people = usePeople();
  const qc = useQueryClient();
  const toast = useToast();
  const toText = (id: string) => everyone.filter((r) => r.owner_id === id && r.status === 'to_text').length;
  const givers = [...new Set(everyone.map((r) => r.owner_id))].filter((id) => toText(id) > 0);
  const takers = (people.data ?? []).filter((p) => p.is_active && (p.role === 'setter' || p.role === 'sales'));
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [count, setCount] = useState('50');
  const [busy, setBusy] = useState(false);
  const giver = from ?? [...givers].sort((a, b) => toText(b) - toText(a))[0] ?? null;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const give = async () => {
    if (!giver || !to || !n) return;
    setBusy(true);
    try {
      const moved = await assignTexts(to, n, giver);
      await qc.invalidateQueries({ queryKey: ['text-kit'] });
      toast({ title: `Gave ${moved} ${moved === 1 ? 'lead' : 'leads'} to ${ownerName(to)}`, body: 'They see them under Texts.', tone: 'success' });
    } catch (e) {
      toast({ title: 'Not handed out', body: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  if (!givers.length) return null;
  return (
    // Above the panels below it, so the person picker's menu isn't hidden behind them.
    <Panel className="relative z-10 mb-4">
      <div className="mb-3 flex items-center gap-2 text-[14px] font-bold"><Gift className="size-4 text-iris" /> Hand out leads</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_110px_auto] sm:items-end">
        <Picker label="From" value={giver} onChange={setFrom}
          options={givers.map((id) => ({ value: id, label: `${ownerName(id)} · ${toText(id)} to text` }))} />
        <Picker label="To" value={to} onChange={setTo} placeholder="Choose a person"
          options={takers.filter((p) => p.id !== giver).map((p) => ({ value: p.id, label: `${p.full_name}${p.role === 'setter' ? ' (setter)' : ''}` }))} />
        <Input label="How many" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        <Button variant="primary" loading={busy} disabled={!giver || !to || !n} onClick={give}>Give {n || ''}</Button>
      </div>
      <p className="text-3 mt-2 text-[12.5px]">
        Moves the last {n || 'N'} leads in {giver ? ownerName(giver) : 'their'}'s To text list (the newest batch added). Texted and replied leads stay put.
        Their messages open with their own name, e.g. "Ashley here, from Isaiah's team."
      </p>
    </Panel>
  );
}

function TextCard({ r, now, sender, owner }: { r: KitText; now: Date; sender: string; owner: string | null }) {
  const toast = useToast();
  const mark = useMarkText();
  const [busy, setBusy] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [more, setMore] = useState(false);
  const t = localTime(r.time_zone, now);
  const status = r.status as KitStatus;
  const ask = tidyAsk(r.asked_for);
  const message = signedMessage(r.message, sender);

  const copy = (text: string, title: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast({ title, tone: 'success', duration: 1800 }),
      () => toast({ title: "Couldn't copy", body: 'Select the text and copy it yourself.', tone: 'info' }),
    );
  };
  const set = async (s: KitStatus | 'reset', done: string) => {
    setBusy(s);
    try {
      await mark(r.id, s);
      setOpened(false);
      toast({ title: done, tone: 'success', duration: 1600 });
    } catch (e) {
      toast({ title: 'Not saved', body: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className={clsx('min-w-0 !p-4 sm:!p-5', status === 'opted_out' && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-3 tabular text-[12px]">#{r.position}</span>
            <h3 className="truncate text-[16px] font-bold">{r.name}</h3>
            <Pill tone={r.version === 'A' ? 'info' : 'iris'}>{r.version}</Pill>
            {status !== 'to_text' && <Pill tone={KIT_STATUS[status].tone}>{KIT_STATUS[status].label}</Pill>}
            {owner && <Pill tone="neutral">{owner.split(/\s+/)[0]}</Pill>}
          </div>
          <div className="text-2 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
            <button className="tabular font-semibold underline-offset-2 hover:underline" title="Copy number"
              onClick={() => copy(prettyPhone(r.phone), 'Number copied')}>{prettyPhone(r.phone)}</button>
            {r.posted_on && <span>· Bark post {dayShort(r.posted_on)}</span>}
          </div>
        </div>
        <div className={clsx('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold', t.ok ? 'bg-[rgba(48,196,108,0.14)] text-ok' : 'fill text-2')}
          title={r.tz_note ?? undefined}>
          <Clock className="size-3.5" />
          {t.label} {r.tz_label?.split(' (')[0] ?? ''}{r.tz_note ? '*' : ''}
        </div>
      </div>

      {ask && (
        <button onClick={() => setMore((m) => !m)} className={clsx('text-2 mt-2 block w-full text-left text-[12.5px]', !more && 'truncate')}>
          <span className="text-3 font-semibold">Asked for: </span>{ask}
        </button>
      )}
      {r.past_notes && (
        <p className="text-2 mt-1.5 flex items-start gap-1.5 text-[12.5px]"><History className="mt-0.5 size-3.5 shrink-0" />{r.past_notes}</p>
      )}
      {more && r.tz_note && <p className="text-3 mt-1 text-[12px]">* {r.tz_note}</p>}

      <div className="fill mt-3 whitespace-pre-wrap rounded-2xl p-3.5 text-[14px] leading-relaxed">{message}</div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === 'to_text' && (t.ok ? (
          <a href={zoomSmsHref(r.phone)}
            onClick={() => { copy(message, 'Message copied. Paste it in Zoom.'); setOpened(true); }}
            className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-[#0B5CFF] px-4 text-sm font-semibold text-white shadow-[0_8px_24px_-10px_rgba(11,92,255,0.8)] transition hover:brightness-110">
            <Send className="size-4" /> Send text
          </a>
        ) : (
          <Button disabled icon={<Clock className="size-4" />}>Opens at {hourLabel(TEXT_FROM)} their time</Button>
        ))}
        {status === 'to_text' && (
          <Button size="md" icon={<Copy className="size-4" />} onClick={() => copy(message, 'Message copied')}>Copy message</Button>
        )}
        {status === 'to_text' && (
          <Button variant={opened ? 'success' : 'ghost'} loading={busy === 'texted'} icon={<Check className="size-4" />}
            onClick={() => set('texted', 'Marked texted')}>{opened ? 'Sent it? Tick Texted' : 'Texted'}</Button>
        )}
        {status === 'texted' && (
          <Button variant="ghost" loading={busy === 'replied'} icon={<Reply className="size-4" />} onClick={() => set('replied', 'Marked replied')}>Replied</Button>
        )}
        {status !== 'opted_out' && status !== 'to_text' && (
          <Button variant="ghost" loading={busy === 'opted_out'} icon={<Ban className="size-4" />} onClick={() => set('opted_out', 'Opted out. Never text them again.')}>Opted out</Button>
        )}
        {status !== 'to_text' && (
          <Button variant="ghost" loading={busy === 'reset'} icon={<RotateCcw className="size-4" />} onClick={() => set('reset', 'Back on To text')}>Undo</Button>
        )}
      </div>
    </Panel>
  );
}
