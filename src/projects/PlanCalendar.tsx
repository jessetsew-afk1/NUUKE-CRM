import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import {
  AlertTriangle, CalendarClock, CalendarDays, CalendarRange, Check, Diamond, FileUp, Flag, Hourglass, ListChecks, Megaphone, MoveRight,
  Package, Plus, SquareCheck, Users,
} from 'lucide-react';
import { useAuth } from '@/app/auth';
import {
  PHASE_COLORS, eventKindMeta, isKeyMoment, planDay, platformMeta, sideMeta, statusMeta, usePosts, useEvents, useSprints, useTasks,
  type ProjectWithTeam,
} from '@/data/projects';
import type { ProjectEvent, Sprint, Task } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Chip, Panel, ProgressBar, Segmented, Switch } from '@/ui/kit';
import { localISO, time } from '@/lib/format';
import { MonthCalendar, type CalItem } from './MonthCalendar';
import { EventSheet } from './Calendar';
import { TaskSheet, type TaskDraft } from './TaskSheet';
import { ImportPlanSheet, MovePlanSheet } from './PlanTools';

type View = 'month' | 'plan';
type Who = 'all' | 'team' | 'client';
type Focus = 'late' | 'week' | 'client' | null;
type Phase = Sprint & { color: string };

const VIEW_KEY = 'nuuke-project-calendar-view';
const browserDay = (ts: string) => localISO(new Date(ts), Intl.DateTimeFormat().resolvedOptions().timeZone);
/** An event's calendar days: all-day events keep their date everywhere (stored at 12:00 UTC). */
function eventDays(e: ProjectEvent) {
  const from = e.all_day ? e.starts_at.slice(0, 10) : browserDay(e.starts_at);
  const to = e.ends_at ? (e.all_day ? e.ends_at.slice(0, 10) : browserDay(e.ends_at)) : from;
  const out: string[] = [];
  for (let d = parseISO(from); format(d, 'yyyy-MM-dd') <= to && out.length < 60; d = addDays(d, 1)) out.push(format(d, 'yyyy-MM-dd'));
  return out;
}

/**
 * The project calendar. Tasks are the plan: every dated task is here and on the
 * board. Phases (sprints) tint the days they cover; gates and the launch are
 * diamonds; colours say who does what. The same page serves the team and the client.
 */
export function ProjectCalendar({ project, canEdit }: { project: ProjectWithTeam; canEdit: boolean }) {
  const tasks = useTasks(project.id);
  const events = useEvents(project.id);
  const posts = usePosts(project.id);
  const sprints = useSprints(project.id);
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [view, setViewState] = useState<View>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as View) || (window.innerWidth < 640 ? 'plan' : 'month'); } catch { return 'month'; }
  });
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };
  const [who, setWho] = useState<Who>('all');
  const [mine, setMine] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [focus, setFocus] = useState<Focus>(null);
  const [task, setTask] = useState<Task | TaskDraft | null>(null);
  const [event, setEvent] = useState<ProjectEvent | { new: true; day: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [moving, setMoving] = useState(false);

  const today = localISO();
  const clientName = project.client_name?.trim() || 'Client';
  const isLead = project.members.some((m) => m.profile_id === profile?.id && m.is_lead);
  const phases: Phase[] = useMemo(() => [...(sprints.data ?? [])].sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    .map((s, i) => ({ ...s, color: PHASE_COLORS[i % PHASE_COLORS.length] })), [sprints.data]);
  const phaseOn = (d: string) => phases.find((p) => d >= p.starts_on && d <= p.ends_on);

  // A link from a reminder opens that task.
  useEffect(() => {
    const id = Number(params.get('task'));
    if (!id || !tasks.data) return;
    const t = tasks.data.find((x) => x.id === id);
    if (t) setTask(t);
    params.delete('task');
    setParams(params, { replace: true });
  }, [params, setParams, tasks.data]);

  const all = tasks.data ?? [];
  const shown = all.filter((t) => {
    if (who === 'team' && t.side === 'client') return false;
    if (who === 'client' && t.side === 'team') return false;
    if (hideDone && t.status === 'done') return false;
    if (mine && !(t.assignee_id === profile?.id || (!t.assignee_id && isLead))) return false;
    return true;
  });
  const inWeek = addDays(parseISO(today), 7).toISOString().slice(0, 10);
  const open = (t: Task) => t.status !== 'done' && !!t.due_on;
  const counts = {
    late: all.filter((t) => open(t) && t.due_on! < today).length,
    week: all.filter((t) => open(t) && t.due_on! >= today && t.due_on! <= inWeek).length,
    client: all.filter((t) => open(t) && t.side !== 'team' && t.due_on! <= inWeek).length,
    done: all.filter((t) => t.status === 'done').length,
  };

  const items: CalItem[] = [];
  for (const t of shown) {
    if (!t.due_on) continue;
    const side = sideMeta(t.side, project.client_name);
    items.push({
      id: `t${t.id}`, date: t.due_on, title: t.title, color: side.color, kind: t.owner_label || side.label,
      sub: t.deliverable ? `→ ${t.deliverable}` : statusMeta(t.status).label, key_moment: isKeyMoment(t),
      late: open(t) && t.due_on < today, faded: t.status === 'done',
      icon: isKeyMoment(t) ? <Diamond className="size-4" /> : t.status === 'done' ? <Check className="size-4" /> : <SquareCheck className="size-4" />,
      onClick: () => setTask(t),
    });
  }
  for (const e of events.data ?? []) {
    const k = eventKindMeta(e.kind);
    for (const d of eventDays(e)) {
      items.push({ id: `e${e.id}-${d}`, date: d, title: e.title, color: k.color, kind: k.label, time: e.all_day ? null : time(e.starts_at),
        quiet: e.kind === 'other', key_moment: e.kind === 'launch',
        icon: e.kind === 'meeting' ? <Users className="size-4" /> : <Flag className="size-4" />, onClick: () => setEvent(e) });
    }
  }
  for (const p of posts.data ?? []) {
    if (!p.scheduled_at) continue;
    const pm = platformMeta(p.platform);
    items.push({ id: `p${p.id}`, date: browserDay(p.scheduled_at), title: p.title, color: pm.color, kind: pm.label, time: time(p.scheduled_at),
      faded: p.status === 'posted', icon: <Megaphone className="size-4" /> });
  }

  const lastDay = [project.due_on, phases.at(-1)?.ends_on].filter(Boolean).sort().at(-1) ?? null;
  const decorate = (d: string) => {
    const ph = phaseOn(d);
    const n = project.starts_on && d >= project.starts_on && (!lastDay || d <= lastDay) ? planDay(project.starts_on, d) : null;
    const label = ph && (d === ph.starts_on || d.endsWith('-01')) ? ph.name : undefined;
    return ph || n ? { tint: ph?.color, label, badge: n ? `Day ${n}` : undefined } : undefined;
  };
  const firstMonth = project.starts_on && project.starts_on > today && differenceInCalendarDays(parseISO(project.starts_on), parseISO(today)) > 20
    ? parseISO(project.starts_on) : undefined;

  const legend = [
    { label: 'NUUKE', color: sideMeta('team').color },
    { label: clientName, color: sideMeta('client').color },
    { label: 'Together', color: sideMeta('both').color },
    { label: 'Gate or launch', color: '#7C5CFF', shape: 'diamond' as const },
    { label: 'Meetings', color: eventKindMeta('meeting').color },
    { label: 'Campus & holidays', color: eventKindMeta('other').color },
  ];

  const draftFor = (day: string): TaskDraft => ({ new: true, due_on: day, sprint_id: phaseOn(day)?.id ?? null });

  return (
    <div className="space-y-4">
      <PlanHeader project={project} tasks={all} phases={phases} today={today} counts={counts} clientName={clientName}
        onFocus={(f) => { setFocus(f); setView('plan'); }} onTask={setTask} />

      <Panel className="!p-4 sm:!p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={setView} options={[
            { value: 'month', label: 'Month' }, { value: 'plan', label: 'Plan' },
          ]} />
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={who === 'all'} onClick={() => setWho('all')}>Everything</Chip>
            <Chip active={who === 'team'} dot={sideMeta('team').color} onClick={() => setWho('team')}>NUUKE</Chip>
            <Chip active={who === 'client'} dot={sideMeta('client').color} onClick={() => setWho('client')}>{clientName}</Chip>
            {canEdit && <Chip active={mine} onClick={() => setMine((m) => !m)}>Mine</Chip>}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Switch checked={hideDone} onChange={setHideDone} label={<span className="text-[13px] font-semibold">Hide done</span>} />
            {canEdit && <>
              <Button size="sm" variant="glass" icon={<CalendarClock className="size-4" />} onClick={() => setEvent({ new: true, day: today })}>Meeting</Button>
              <Button size="sm" variant="glass" icon={<MoveRight className="size-4" />} onClick={() => setMoving(true)}>Move dates</Button>
              <Button size="sm" variant="glass" icon={<FileUp className="size-4" />} onClick={() => setImporting(true)}>Import a plan</Button>
              <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setTask(draftFor(today))}>Task</Button>
            </>}
          </div>
        </div>
        {focus && view === 'plan' && (
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
            Showing: {focus === 'late' ? 'late tasks' : focus === 'week' ? 'the next 7 days' : `waiting on ${clientName}`}
            <button type="button" className="text-iris" onClick={() => setFocus(null)}>Show the whole plan</button>
          </div>
        )}

        {view === 'month'
          ? <MonthCalendar items={items} legend={legend} decorate={decorate} initialMonth={firstMonth}
              onAdd={canEdit ? (d) => setTask(draftFor(d)) : undefined} addLabel="Add a task" />
          : <PlanList tasks={shown} events={events.data ?? []} phases={phases} project={project} today={today} focus={focus}
              inWeek={inWeek} onTask={setTask} onEvent={setEvent} />}
      </Panel>

      <TaskSheet task={task} project={project} sprints={sprints.data ?? []} canEdit={canEdit} onClose={() => setTask(null)} />
      <EventSheet event={event} project={project} canEdit={canEdit} onClose={() => setEvent(null)} />
      {canEdit && <ImportPlanSheet open={importing} project={project} onClose={() => setImporting(false)} />}
      {canEdit && <MovePlanSheet open={moving} project={project} tasks={all} onClose={() => setMoving(false)} />}
    </div>
  );
}

/* ----------------------------------------------------------------- the header */
function PlanHeader({ project, tasks, phases, today, counts, clientName, onFocus, onTask }: {
  project: ProjectWithTeam; tasks: Task[]; phases: Phase[]; today: string;
  counts: { late: number; week: number; client: number; done: number };
  clientName: string; onFocus: (f: Focus) => void; onTask: (t: Task) => void;
}) {
  const now = phases.find((p) => today >= p.starts_on && today <= p.ends_on) ?? phases.find((p) => p.starts_on > today) ?? null;
  const inPhase = now ? tasks.filter((t) => t.sprint_id === now.id) : [];
  const done = inPhase.filter((t) => t.status === 'done').length;
  const next = tasks.filter((t) => isKeyMoment(t) && t.status !== 'done' && t.due_on && t.due_on >= today)
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!))[0];
  const dayOf = (d: string) => planDay(project.starts_on, d);
  const range = (p: Phase) => {
    const a = dayOf(p.starts_on); const b = dayOf(p.ends_on);
    return `${a && b ? `Days ${a}–${b} · ` : ''}${format(parseISO(p.starts_on), 'd MMM')} – ${format(parseISO(p.ends_on), 'd MMM')}`;
  };
  if (!phases.length && !tasks.length) return null;
  const until = (d: string) => {
    const n = differenceInCalendarDays(parseISO(d), parseISO(today));
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="glass-strong relative overflow-hidden rounded-[26px] p-5">
        {now && <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: now.color }} />}
        {now ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: now.color }}>
              <CalendarRange className="size-3.5" />{today >= now.starts_on ? 'Now' : `Starts ${until(now.starts_on)}`} · {range(now)}
            </div>
            <div className="mt-1 text-[20px] font-extrabold leading-tight">{now.name}</div>
            {now.goal && <p className="text-2 mt-1 line-clamp-2 text-[13.5px]">{now.goal}</p>}
            {inPhase.length > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <ProgressBar className="flex-1" value={done} max={inPhase.length} height={8} tone={now.color} />
                <span className="tabular text-[12.5px] font-bold">{done} of {inPhase.length} done</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-[15px] font-bold">{project.name}: {tasks.length} tasks on the calendar</div>
        )}
        {next && (
          <button type="button" onClick={() => onTask(next)}
            className="fill mt-3 flex w-full min-w-0 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left hover:bg-[var(--fill-2)]">
            <Diamond className="size-4 shrink-0 text-iris" style={{ fill: 'currentColor' }} />
            <span className="min-w-0 flex-1">
              <span className="text-3 block text-[11px] font-bold uppercase tracking-wider">Next gate · {until(next.due_on!)}</span>
              <span className="block truncate text-[14px] font-bold">{next.title}</span>
            </span>
            <span className="text-2 shrink-0 text-[12.5px] font-semibold">{format(parseISO(next.due_on!), 'EEE d MMM')}{dayOf(next.due_on!) ? ` · Day ${dayOf(next.due_on!)}` : ''}</span>
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Tile icon={<AlertTriangle className="size-4" />} label="Late" value={counts.late} color="#FF453A" onClick={() => onFocus('late')} dim={!counts.late} />
        <Tile icon={<CalendarDays className="size-4" />} label="Next 7 days" value={counts.week} color="#5AB8FF" onClick={() => onFocus('week')} />
        <Tile icon={<Hourglass className="size-4" />} label={`Waiting on ${clientName}`} value={counts.client} color="#FF9A6B" onClick={() => onFocus('client')} />
        <Tile icon={<ListChecks className="size-4" />} label="Done" value={counts.done} sub={`of ${tasks.length}`} color="#30C46C" onClick={() => onFocus(null)} />
      </div>
    </div>
  );
}

function Tile({ icon, label, value, sub, color, onClick, dim }: { icon: React.ReactNode; label: string; value: number; sub?: string; color: string; onClick: () => void; dim?: boolean }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onClick} className={clsx('glass min-w-0 rounded-[22px] p-4 text-left', dim && 'opacity-70')}>
      <div className="flex items-center gap-1.5 truncate text-[12px] font-bold" style={{ color }}>{icon}<span className="truncate">{label}</span></div>
      <div className="tabular mt-1 text-[26px] font-black leading-none">{value}{sub && <span className="text-3 ml-1 text-[13px] font-bold">{sub}</span>}</div>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ plan view */
function PlanList({ tasks, events, phases, project, today, focus, inWeek, onTask, onEvent }: {
  tasks: Task[]; events: ProjectEvent[]; phases: Phase[]; project: ProjectWithTeam; today: string; focus: Focus; inWeek: string;
  onTask: (t: Task) => void; onEvent: (e: ProjectEvent) => void;
}) {
  const todayRef = useRef<HTMLDivElement>(null);
  const [showEarly, setShowEarly] = useState(false);
  const people = new Map(project.members.map((m) => [m.profile_id, m.profile]));
  const list = tasks.filter((t) => {
    if (!t.due_on) return false;
    if (focus === 'late') return t.status !== 'done' && t.due_on < today;
    if (focus === 'week') return t.status !== 'done' && t.due_on >= today && t.due_on <= inWeek;
    if (focus === 'client') return t.status !== 'done' && t.side !== 'team' && t.due_on <= inWeek;
    return true;
  });
  const days = new Map<string, { tasks: Task[]; events: ProjectEvent[] }>();
  const slot = (d: string) => { if (!days.has(d)) days.set(d, { tasks: [], events: [] }); return days.get(d)!; };
  for (const t of list) slot(t.due_on!).tasks.push(t);
  if (!focus) for (const e of events) for (const d of eventDays(e)) slot(d).events.push(e);
  const everyDay = [...days.keys()].sort();
  // Finished work at the start of the plan folds into one line.
  let early = 0;
  while (!focus && early < everyDay.length && !days.get(everyDay[early])!.events.length
         && days.get(everyDay[early])!.tasks.every((t) => t.status === 'done')) early++;
  const folded = showEarly ? [] : everyDay.slice(0, early);
  const sorted = everyDay.slice(folded.length);
  const firstUpcoming = sorted.find((d) => d >= today);
  const foldedCount = folded.reduce((n, d) => n + days.get(d)!.tasks.length, 0);

  useEffect(() => {
    if (!focus) todayRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focus]);

  if (!everyDay.length) return <p className="text-3 py-12 text-center text-[14px]">{focus ? 'Nothing here. Nice.' : 'Nothing dated yet. Add a task, or import a plan.'}</p>;

  let lastPhase: number | null | undefined;
  let lastWeek = '';
  return (
    <div className="space-y-1">
      {foldedCount > 0 && (
        <button type="button" onClick={() => setShowEarly(true)}
          className="fill flex w-full items-center gap-2 rounded-[18px] px-4 py-3 text-left text-[13.5px] font-semibold hover:bg-[var(--fill-2)]">
          <Check className="size-4 text-ok" />{foldedCount} finished {foldedCount === 1 ? 'task' : 'tasks'} before this
          <span className="ml-auto text-iris">Show</span>
        </button>
      )}
      {sorted.map((d) => {
        const ph = phases.find((p) => d >= p.starts_on && d <= p.ends_on);
        const week = format(startOfWeek(parseISO(d), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const phaseHead = (ph?.id ?? null) !== lastPhase;
        const weekHead = week !== lastWeek;
        lastPhase = ph?.id ?? null; lastWeek = week;
        const slotDay = days.get(d)!;
        const n = planDay(project.starts_on, d);
        const phaseTasks = ph ? tasks.filter((t) => t.sprint_id === ph.id) : [];
        return (
          <div key={d} ref={d === firstUpcoming ? todayRef : undefined} className="scroll-mt-24">
            {phaseHead && ph && (
              <div className="mb-2 mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[20px] px-4 py-3 first:mt-0" style={{ background: `${ph.color}14` }}>
                <span className="size-2.5 rounded-full" style={{ background: ph.color }} />
                <span className="text-[15px] font-extrabold">{ph.name}</span>
                <span className="text-2 text-[12.5px] font-semibold">{format(parseISO(ph.starts_on), 'd MMM')} – {format(parseISO(ph.ends_on), 'd MMM')}</span>
                {phaseTasks.length > 0 && <span className="text-3 ml-auto text-[12px] font-bold">{phaseTasks.filter((t) => t.status === 'done').length}/{phaseTasks.length} done</span>}
                {ph.goal && <p className="text-2 basis-full text-[12.5px] leading-snug">{ph.goal}</p>}
              </div>
            )}
            {weekHead && <div className="text-3 mb-1 mt-3 px-1 text-[11px] font-bold uppercase tracking-[0.14em]">Week of {format(parseISO(week), 'd MMM')}</div>}
            <div className={clsx('flex gap-3 rounded-[18px] px-1 py-1.5', d === today && 'bg-iris/8 ring-1 ring-iris/25')}>
              <div className="w-[64px] shrink-0 pt-2 text-center sm:w-[76px]">
                <div className={clsx('text-[11px] font-bold uppercase', d === today ? 'text-iris' : 'text-3')}>{format(parseISO(d), 'EEE')}</div>
                <div className="text-[20px] font-black leading-none">{format(parseISO(d), 'd')}</div>
                <div className="text-3 text-[11px] font-semibold">{format(parseISO(d), 'MMM')}{n ? ` · D${n}` : ''}</div>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                {slotDay.events.map((e) => (
                  <button key={`e${e.id}`} type="button" onClick={() => onEvent(e)}
                    className="text-2 flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[12.5px] font-semibold italic hover:bg-[var(--fill)]">
                    <Flag className="size-3.5 shrink-0" style={{ color: eventKindMeta(e.kind).color }} /><span className="truncate">{e.title}</span>
                  </button>
                ))}
                {slotDay.tasks.map((t) => <PlanRow key={t.id} task={t} project={project} today={today} who={t.assignee_id ? people.get(t.assignee_id) ?? null : null} onOpen={() => onTask(t)} />)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlanRow({ task, project, today, who, onOpen }: {
  task: Task; project: ProjectWithTeam; today: string; who: ProjectWithTeam['members'][number]['profile']; onOpen: () => void;
}) {
  const side = sideMeta(task.side, project.client_name);
  const st = statusMeta(task.status);
  const late = task.status !== 'done' && !!task.due_on && task.due_on < today;
  const key = isKeyMoment(task);
  return (
    <motion.button type="button" onClick={onOpen} whileTap={{ scale: 0.99 }}
      className={clsx('glass relative flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-[18px] py-3 pl-4 pr-3 text-left hover:brightness-[1.03]',
        task.status === 'done' && 'opacity-60', key && 'ring-1 ring-iris/40')}>
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: side.color }} />
      <span className="min-w-0 flex-1">
        <span className={clsx('flex items-start gap-1.5 text-[14.5px] font-bold leading-snug', task.status === 'done' && 'line-through decoration-2')}>
          {key && <Diamond className="mt-[3px] size-3.5 shrink-0 text-iris" style={{ fill: 'currentColor' }} />}
          {task.status === 'done' && <Check className="mt-[2px] size-4 shrink-0 text-ok" />}
          <span className="min-w-0">{task.title}</span>
        </span>
        {task.deliverable && (
          <span className="text-2 mt-0.5 flex items-center gap-1.5 text-[12.5px]"><Package className="size-3.5 shrink-0" /><span className="truncate">{task.deliverable}</span></span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${side.color}1f`, color: side.color }}>
            <span className="size-1.5 rounded-full" style={{ background: side.color }} /><span className="truncate">{task.owner_label || side.label}</span>
          </span>
          {task.labels.filter((l) => !/^(gate|launch)$/i.test(l)).slice(0, 2).map((l) => <span key={l} className="fill-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold">{l}</span>)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        {late ? <span className="rounded-full bg-bad px-2 py-0.5 text-[11px] font-bold text-white">Late</span>
          : <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${st.color}1f`, color: st.color }}>{st.label}</span>}
        {who && <AgentAvatar who={who} size={24} />}
      </span>
    </motion.button>
  );
}
