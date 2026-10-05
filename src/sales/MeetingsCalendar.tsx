import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Columns3, List, UserCog } from 'lucide-react';
import { usePeople } from '@/data/common';
import type { MeetingWithLead } from '@/data/sales';
import { addDaysISO } from '@/lib/format';
import { PKT, dayIn, fmtIn, zoneMeta, zoned } from '@/lib/timezones';
import type { Profile } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, IconButton, Picker, Pill, Segmented } from '@/ui/kit';
import { MonthCalendar, type CalItem } from '@/projects/MonthCalendar';
import { MEETING_STATUS } from './MeetingSheet';

const HOUR = 64;
const DISPLAY_ZONES = ['Asia/Karachi', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London'];
const isoDow = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
const label = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Meetings on a calendar that knows about time zones. Pick the clock to view them in
 * (Pakistan time by default, or any client zone); every meeting is coloured by the
 * client's own zone and also shows the time on the client's side.
 */
export function MeetingsCalendar({ meetings, onOpen, showOwner = true }: {
  meetings: MeetingWithLead[]; onOpen: (m: MeetingWithLead) => void; showOwner?: boolean;
}) {
  const people = usePeople();
  const byId = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]) as Map<string, Profile>;
  const [tz, setTz] = useState(() => { try { return localStorage.getItem('nuuke-meetings-tz') ?? PKT; } catch { return PKT; } });
  const [view, setView] = useState<'week' | 'month' | 'list'>(() => (window.innerWidth < 900 ? 'list' : 'week'));
  const today = dayIn(new Date(), tz);
  const [weekStart, setWeekStart] = useState(() => addDaysISO(today, -isoDow(today)));
  useEffect(() => { try { localStorage.setItem('nuuke-meetings-tz', tz); } catch { /* ignore */ } }, [tz]);
  useEffect(() => { const t = dayIn(new Date(), tz); setWeekStart(addDaysISO(t, -isoDow(t))); }, [tz]);

  const zonesUsed = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of meetings) if (x.status !== 'cancelled') m.set(x.timezone ?? PKT, (m.get(x.timezone ?? PKT) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [meetings]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[
          { value: 'week', label: <span className="flex items-center gap-1.5"><Columns3 className="size-4" />Week</span> },
          { value: 'month', label: <span className="flex items-center gap-1.5"><CalendarDays className="size-4" />Month</span> },
          { value: 'list', label: <span className="flex items-center gap-1.5"><List className="size-4" />List</span> },
        ]} />
        <Picker className="w-[230px]" value={tz} onChange={setTz}
          options={DISPLAY_ZONES.map((id) => ({ value: id, label: `Show in ${zoneMeta(id).label} time`, dot: zoneMeta(id).color, hint: fmtIn(new Date(), id, 'time') + ' now' }))} />
        <div className="flex flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {zonesUsed.map(([id, n]) => (
            <span key={id} className="text-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: zoneMeta(id).color }} />{zoneMeta(id).label} <span className="text-3">{n}</span>
            </span>
          ))}
        </div>
      </div>

      {view === 'week' && (
        <WeekGrid meetings={meetings} tz={tz} weekStart={weekStart} today={today} byId={byId} onOpen={onOpen} showOwner={showOwner}
          onPrev={() => setWeekStart((w) => addDaysISO(w, -7))} onNext={() => setWeekStart((w) => addDaysISO(w, 7))}
          onToday={() => setWeekStart(addDaysISO(today, -isoDow(today)))} />
      )}
      {view === 'month' && (
        <MonthCalendar items={meetings.map((m): CalItem => {
          const z = zoneMeta(m.timezone);
          return {
            id: `m${m.id}`, date: dayIn(m.starts_at, tz), title: `${fmtIn(m.starts_at, tz, 'time')} ${m.leads?.name || m.title}`,
            color: z.color, kind: m.timezone && m.timezone !== tz ? `${fmtIn(m.starts_at, m.timezone, 'time')} ${z.label}` : z.label,
            time: fmtIn(m.starts_at, tz, 'time'), sub: showOwner ? byId.get(m.owner_id)?.full_name : undefined,
            faded: m.status === 'cancelled', onClick: () => onOpen(m), icon: <Clock className="size-4" />,
          };
        })} legend={zonesUsed.map(([id]) => ({ label: zoneMeta(id).label, color: zoneMeta(id).color }))} />
      )}
      {view === 'list' && <ListView meetings={meetings} tz={tz} byId={byId} onOpen={onOpen} showOwner={showOwner} />}
    </div>
  );
}

/* ================================================================ week */
interface Placed { m: MeetingWithLead; top: number; height: number; lane: number; lanes: number }

function placeDay(list: MeetingWithLead[], tz: string): Placed[] {
  const items = list
    .map((m) => { const p = zoned(m.starts_at, tz); const start = p.h * 60 + p.mi; return { m, start, end: start + Math.max(20, m.duration_minutes) }; })
    .sort((a, b) => a.start - b.start);
  const out: Placed[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    const placed = cluster.map((it) => {
      let lane = laneEnds.findIndex((e) => e <= it.start);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
      return { it, lane };
    });
    for (const { it, lane } of placed) {
      out.push({ m: it.m, top: (it.start / 60) * HOUR, height: Math.max(38, ((it.end - it.start) / 60) * HOUR - 3), lane, lanes: laneEnds.length });
    }
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
    if (cluster.length === 1) clusterEnd = it.end;
  }
  if (cluster.length) flush();
  return out;
}

function WeekGrid({ meetings, tz, weekStart, today, byId, onOpen, showOwner, onPrev, onNext, onToday }: {
  meetings: MeetingWithLead[]; tz: string; weekStart: string; today: string; byId: Map<string, Profile>;
  onOpen: (m: MeetingWithLead) => void; showOwner: boolean; onPrev: () => void; onNext: () => void; onToday: () => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const scroller = useRef<HTMLDivElement>(null);
  const byDay = useMemo(() => {
    const m = new Map<string, MeetingWithLead[]>();
    for (const x of meetings) { const d = dayIn(x.starts_at, tz); if (days.includes(d)) m.set(d, [...(m.get(d) ?? []), x]); }
    return m;
  }, [meetings, tz, weekStart]);

  // Scroll to the first meeting of the week (or to the working evening in Pakistan).
  useEffect(() => {
    const starts = [...byDay.values()].flat().map((m) => zoned(m.starts_at, tz).h);
    const h = starts.length ? Math.max(0, Math.min(...starts) - 1) : tz === PKT ? 17 : 8;
    scroller.current?.scrollTo({ top: h * HOUR, behavior: 'smooth' });
  }, [byDay, tz]);

  const nowP = zoned(new Date(), tz);
  const nowTop = ((nowP.h * 60 + nowP.mi) / 60) * HOUR;
  const count = [...byDay.values()].flat().filter((m) => m.status !== 'cancelled').length;

  return (
    <div className="glass overflow-hidden rounded-[26px]">
      <div className="flex items-center gap-2 px-4 py-3">
        <h3 className="mr-auto text-[17px] font-extrabold">
          {label(days[0], { day: 'numeric', month: 'short' })} – {label(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}
          <span className="text-3 ml-2 text-[13px] font-semibold">{count} meeting{count === 1 ? '' : 's'} · {zoneMeta(tz).label} time</span>
        </h3>
        <Button size="sm" variant="glass" onClick={onToday}>This week</Button>
        <IconButton label="Previous week" onClick={onPrev}><ChevronLeft className="size-5" /></IconButton>
        <IconButton label="Next week" onClick={onNext}><ChevronRight className="size-5" /></IconButton>
      </div>
      <div className="scroll-x">
        <div className="min-w-[860px]">
          <div className="hairline grid grid-cols-[56px_repeat(7,1fr)] border-b">
            <div />
            {days.map((d) => (
              <div key={d} className={clsx('px-2 py-2 text-center', d === today && 'text-iris')}>
                <div className="text-[11px] font-bold uppercase tracking-wider">{label(d, { weekday: 'short' })}</div>
                <div className={clsx('mx-auto grid size-8 place-items-center rounded-full text-[15px] font-extrabold', d === today && 'bg-iris text-white')}>{label(d, { day: 'numeric' })}</div>
              </div>
            ))}
          </div>
          <div ref={scroller} className="scroll-y relative max-h-[620px]">
            <div className="relative grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: 24 * HOUR }}>
              <div className="relative">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-3 absolute right-2 -translate-y-1/2 text-[10.5px] font-semibold" style={{ top: h * HOUR }}>
                    {h === 0 ? '' : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`}
                  </div>
                ))}
              </div>
              {days.map((d) => (
                <div key={d} className={clsx('relative border-l border-[var(--hairline)]', d === today && 'bg-iris/[0.04]')}>
                  {Array.from({ length: 24 }, (_, h) => <div key={h} className="absolute inset-x-0 border-t border-[var(--hairline)]" style={{ top: h * HOUR }} />)}
                  {d === today && <div className="absolute inset-x-0 z-20 h-0.5 bg-bad" style={{ top: nowTop }}><span className="absolute -left-1 -top-1 size-2.5 rounded-full bg-bad" /></div>}
                  {placeDay(byDay.get(d) ?? [], tz).map(({ m, top, height, lane, lanes }) => {
                    const z = zoneMeta(m.timezone);
                    const tm = m.technical_manager_id ? byId.get(m.technical_manager_id) : null;
                    const owner = byId.get(m.owner_id);
                    const other = m.timezone && m.timezone !== tz;
                    return (
                      <motion.button
                        key={m.id}
                        type="button"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.02, zIndex: 30 }}
                        onClick={() => onOpen(m)}
                        className={clsx('absolute z-10 overflow-hidden rounded-xl border-l-[3px] px-2 py-1 text-left shadow-sm', m.status === 'cancelled' && 'opacity-45 line-through')}
                        style={{
                          top: top + 1, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`,
                          background: `color-mix(in srgb, ${z.color} 18%, var(--glass-strong))`, borderColor: z.color,
                        }}
                        title={`${m.title} — ${fmtIn(m.starts_at, tz, 'time')}`}
                      >
                        <div className="truncate text-[12px] font-bold leading-tight">{m.leads?.name || m.title}</div>
                        <div className="text-2 truncate text-[11px] font-semibold">
                          {fmtIn(m.starts_at, tz, 'time')}{other && <> · <span style={{ color: z.color }}>{fmtIn(m.starts_at, m.timezone!, 'time')} {z.short || z.label}</span></>}
                        </div>
                        {height > 60 && (
                          <div className="mt-0.5 flex items-center gap-1">
                            {showOwner && owner && <AgentAvatar who={owner} size={16} />}
                            {tm && <span className="text-3 flex items-center gap-0.5 truncate text-[10.5px] font-semibold"><UserCog className="size-3" />{tm.full_name.split(' ')[0]}</span>}
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================ list */
function ListView({ meetings, tz, byId, onOpen, showOwner }: {
  meetings: MeetingWithLead[]; tz: string; byId: Map<string, Profile>; onOpen: (m: MeetingWithLead) => void; showOwner: boolean;
}) {
  const [past, setPast] = useState(false);
  const now = Date.now();
  const list = meetings.filter((m) => (past ? Date.parse(m.starts_at) < now : Date.parse(m.starts_at) + m.duration_minutes * 60_000 >= now));
  if (past) list.reverse();
  const groups = new Map<string, MeetingWithLead[]>();
  for (const m of list.slice(0, 200)) { const d = dayIn(m.starts_at, tz); groups.set(d, [...(groups.get(d) ?? []), m]); }
  return (
    <div>
      <Segmented className="mb-3" size="sm" value={past ? 'past' : 'upcoming'} onChange={(v) => setPast(v === 'past')}
        options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
      {groups.size === 0 && <p className="text-3 py-10 text-center text-sm">No meetings here.</p>}
      <div className="space-y-5">
        {[...groups.entries()].map(([d, ms]) => (
          <section key={d}>
            <div className="text-3 mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.12em]">{label(d, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div className="space-y-2">
              {ms.map((m) => {
                const z = zoneMeta(m.timezone);
                const owner = byId.get(m.owner_id);
                const tm = m.technical_manager_id ? byId.get(m.technical_manager_id) : null;
                const st = MEETING_STATUS[m.status as keyof typeof MEETING_STATUS] ?? MEETING_STATUS.scheduled;
                return (
                  <motion.button key={m.id} type="button" layout onClick={() => onOpen(m)} whileTap={{ scale: 0.99 }}
                    className="glass flex w-full flex-wrap items-center gap-4 rounded-[22px] px-4 py-3 text-left hover:bg-[var(--glass-strong)]">
                    <div className="w-[92px] shrink-0">
                      <div className="tabular text-[15px] font-extrabold">{fmtIn(m.starts_at, tz, 'time')}</div>
                      <div className="text-3 text-[11px] font-semibold">{zoneMeta(tz).short || zoneMeta(tz).label}</div>
                    </div>
                    <div className="w-[110px] shrink-0 rounded-xl px-2.5 py-1.5" style={{ background: `${z.color}1c` }}>
                      <div className="tabular text-[14px] font-extrabold" style={{ color: z.color }}>{fmtIn(m.starts_at, m.timezone ?? PKT, 'time')}</div>
                      <div className="text-2 text-[11px] font-semibold">client · {z.label}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold">{m.leads?.name || m.title}</div>
                      <div className="text-2 truncate text-[13px]">{[m.leads?.service, `${m.duration_minutes} min`].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {showOwner && owner && <span className="flex items-center gap-1.5 text-[12px] font-semibold"><AgentAvatar who={owner} size={24} />{owner.full_name.split(' ')[0]}</span>}
                      {tm && <span className="text-2 flex items-center gap-1 text-[12px] font-semibold"><UserCog className="size-3.5" />{tm.full_name.split(' ')[0]}</span>}
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

