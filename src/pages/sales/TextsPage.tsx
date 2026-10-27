/**
 * Texts: a salesperson's text kit. "Send text" copies the lead's message and opens a
 * new Zoom Phone text with their number already in; they paste, check, send, then tick
 * what happened. Only offered between 9am and 8pm in the lead's own time zone.
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Ban, Check, Clock, Copy, History, MessageSquareText, Reply, RotateCcw, Send } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { usePeople } from '@/data/common';
import {
  KIT_STATUS, TEXT_FROM, TEXT_UNTIL, localTime, prettyPhone, tidyAsk, useMarkText, useTextKit, versionStats, zoomSmsHref,
  type KitStatus, type KitText,
} from '@/data/textKit';
import { dayShort, pct } from '@/lib/format';
import { Button, Chip, Empty, PageHeader, Panel, Pill, Skeleton } from '@/ui/kit';
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

export default function TextsPage() {
  const { profile } = useAuth();
  const rows = useTextKit();
  const people = usePeople();
  const now = useMinute();
  const [filter, setFilter] = useState<KitStatus | 'all'>('to_text');
  const all = rows.data ?? [];
  const shown = all.filter((r) => filter === 'all' || r.status === filter);
  const owners = [...new Set(all.map((r) => r.owner_id))];
  const ownerName = (id: string) => people.data?.find((p) => p.id === id)?.full_name ?? 'someone';
  const forOthers = owners.some((id) => id !== profile?.id);
  const kits = [...new Set(all.map((r) => r.kit))];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={kits.length ? `${kits.join(' & ')} text kit` : 'Text kit'}
        title="Texts"
        sub={forOthers
          ? `${all.length} leads for ${owners.map(ownerName).join(' and ')} to text from Zoom.`
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

      <div className="scroll-x mb-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}
            count={f.key === 'all' ? all.length : all.filter((r) => r.status === f.key).length}>{f.label}</Chip>
        ))}
      </div>

      {rows.isLoading ? <Skeleton className="h-64" /> : shown.length ? (
        <div className="grid grid-cols-1 gap-3">
          {shown.map((r) => <TextCard key={r.id} r={r} now={now} />)}
        </div>
      ) : (
        <Empty title={filter === 'to_text' ? 'Everyone has been texted' : 'Nobody here'}
          body={filter === 'to_text' ? 'Check Texted for anyone who replies.' : undefined} />
      )}
    </div>
  );
}

function TextCard({ r, now }: { r: KitText; now: Date }) {
  const toast = useToast();
  const mark = useMarkText();
  const [busy, setBusy] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [more, setMore] = useState(false);
  const t = localTime(r.time_zone, now);
  const status = r.status as KitStatus;
  const ask = tidyAsk(r.asked_for);

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

      <div className="fill mt-3 whitespace-pre-wrap rounded-2xl p-3.5 text-[14px] leading-relaxed">{r.message}</div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === 'to_text' && (t.ok ? (
          <a href={zoomSmsHref(r.phone)}
            onClick={() => { copy(r.message, 'Message copied. Paste it in Zoom.'); setOpened(true); }}
            className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-[#0B5CFF] px-4 text-sm font-semibold text-white shadow-[0_8px_24px_-10px_rgba(11,92,255,0.8)] transition hover:brightness-110">
            <Send className="size-4" /> Send text
          </a>
        ) : (
          <Button disabled icon={<Clock className="size-4" />}>Opens at {hourLabel(TEXT_FROM)} their time</Button>
        ))}
        {status === 'to_text' && (
          <Button size="md" icon={<Copy className="size-4" />} onClick={() => copy(r.message, 'Message copied')}>Copy message</Button>
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
