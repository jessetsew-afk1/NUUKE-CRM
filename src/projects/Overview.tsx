import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ArrowRight, CalendarClock, CheckCircle2, Flag, Megaphone, Rocket, SquareCheck, Users } from 'lucide-react';
import {
  clientsOf, eventKindMeta, fileKindLabel, latestVersions, platformMeta, progressOf, statusMeta, teamOf, useActivity, useEvents,
  useFiles, usePosts, useSprints, useTasks, type ProjectWithTeam,
} from '@/data/projects';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Panel, PanelHeader, Ring } from '@/ui/kit';
import { dayShort, friendly, localISO } from '@/lib/format';
import { ActivityFeed, ReviewDot } from './bits';
import { FileThumb } from './Files';

export function Overview({ project, isClient }: { project: ProjectWithTeam; isClient: boolean }) {
  const tasks = useTasks(project.id);
  const sprints = useSprints(project.id);
  const files = useFiles(project.id);
  const events = useEvents(project.id);
  const posts = usePosts(project.id);
  const activity = useActivity(project.id, 25);
  const navigate = useNavigate();
  const go = (tab: string) => navigate(`/projects/${project.id}/${tab}`);

  const prog = progressOf(tasks.data ?? []);
  const active = sprints.data?.find((s) => s.status === 'active');
  const sprintTasks = (tasks.data ?? []).filter((t) => active && t.sprint_id === active.id);
  const sprintProg = progressOf(sprintTasks);
  const today = localISO();
  const pending = latestVersions(files.data ?? []).filter((g) => g.latest.review_status === 'pending').map((g) => g.latest);

  const upcoming = useMemo(() => {
    const now = Date.now();
    const horizon = now + 14 * 864e5;
    const list: { key: string; at: number; label: string; title: string; color: string; icon: React.ReactNode; to: string }[] = [];
    for (const e of events.data ?? []) {
      const at = Date.parse(e.starts_at);
      if (at >= now - 36e5 && at <= horizon) list.push({ key: `e${e.id}`, at, label: friendly(e.starts_at), title: e.title, color: eventKindMeta(e.kind).color, icon: <Flag className="size-4" />, to: 'calendar' });
    }
    for (const t of tasks.data ?? []) {
      if (!t.due_on || t.status === 'done') continue;
      const at = Date.parse(`${t.due_on}T23:59:00`);
      if (at >= now - 864e5 * 30 && at <= horizon) list.push({ key: `t${t.id}`, at, label: t.due_on < today ? `Overdue · ${dayShort(t.due_on)}` : `Due ${dayShort(t.due_on)}`, title: t.title, color: t.due_on < today ? '#FF453A' : '#FF9A6B', icon: <SquareCheck className="size-4" />, to: `board?task=${t.id}` });
    }
    for (const p of posts.data ?? []) {
      if (!p.scheduled_at || p.status === 'posted') continue;
      const at = Date.parse(p.scheduled_at);
      if (at >= now && at <= horizon) list.push({ key: `p${p.id}`, at, label: friendly(p.scheduled_at), title: p.title, color: platformMeta(p.platform).color, icon: <Megaphone className="size-4" />, to: 'content' });
    }
    return list.sort((a, b) => a.at - b.at).slice(0, 7);
  }, [events.data, tasks.data, posts.data, today]);

  const team = teamOf(project);
  const daysLeft = active ? Math.max(0, differenceInCalendarDays(parseISO(active.ends_on), parseISO(today))) : 0;

  return (
    <div className="space-y-5">
      {isClient && pending.length > 0 && (
        <motion.button
          type="button"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => navigate(`/projects/${project.id}/files/${pending[0].id}`)}
          className="glass-strong relative flex w-full flex-wrap items-center gap-6 overflow-hidden rounded-[30px] p-6 text-left"
          style={{ boxShadow: '0 0 0 2px rgba(255,69,58,.6), var(--shadow-lift)' }}
        >
          <div className="absolute -left-10 -top-10 size-48 rounded-full bg-bad/20 blur-3xl" />
          <ReviewDot size="xl" count={pending.length} className="ml-3" />
          <div className="relative min-w-[220px] flex-1">
            <div className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-bad">Your review is needed</div>
            <div className="mt-1 text-[24px] font-black leading-tight">
              {pending.length === 1 ? `“${pending[0].title}” is ready for you` : `${pending.length} things are ready for you`}
            </div>
            <div className="text-2 mt-1 text-[14px]">{pending.slice(0, 3).map((f) => `${f.title} (${fileKindLabel(f.kind)})`).join(' · ')}</div>
          </div>
          <span className="relative flex items-center gap-2 rounded-2xl bg-bad px-6 py-4 text-[16px] font-extrabold text-white shadow-[0_10px_30px_-8px_rgba(255,69,58,.9)]">
            Review now <ArrowRight className="size-5" />
          </span>
        </motion.button>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel className="flex items-center gap-4">
          <Ring value={prog.done} max={Math.max(1, prog.total)} size={92} stroke={10} color={project.color}>
            <span className="tabular text-[20px] font-black">{Math.round(prog.ratio * 100)}%</span>
          </Ring>
          <div>
            <div className="text-3 text-[11px] font-bold uppercase tracking-wider">Overall progress</div>
            <div className="mt-1 text-[15px] font-extrabold">{prog.done} of {prog.total} tasks</div>
            {project.due_on && <div className="text-2 text-[13px]">Due {dayShort(project.due_on)}</div>}
          </div>
        </Panel>
        <Panel className="cursor-pointer" onClick={() => go('sprints')}>
          <div className="text-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider"><Rocket className="size-4 text-iris" />Current sprint</div>
          {active ? (
            <>
              <div className="mt-2 truncate text-[17px] font-extrabold">{active.name}</div>
              <div className="text-2 text-[13px]">{daysLeft} day{daysLeft === 1 ? '' : 's'} left · {sprintProg.done}/{sprintProg.total} done</div>
              <div className="fill mt-3 h-2 overflow-hidden rounded-full"><div className="h-full rounded-full bg-iris" style={{ width: `${sprintProg.ratio * 100}%` }} /></div>
            </>
          ) : <div className="text-2 mt-2 text-[14px]">No sprint running right now.</div>}
        </Panel>
        <Panel className="cursor-pointer" onClick={() => go('files')}>
          <div className="text-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
            {pending.length ? <ReviewDot size="sm" /> : <CheckCircle2 className="size-4 text-ok" />}
            {isClient ? 'Waiting on you' : 'Waiting on the client'}
          </div>
          <div className="tabular mt-2 text-[30px] font-black leading-none">{pending.length}</div>
          <div className="text-2 mt-1 text-[13px]">{pending.length ? 'review' + (pending.length === 1 ? '' : 's') + ' pending' : 'All caught up'}</div>
        </Panel>
        <Panel className="cursor-pointer" onClick={() => go('team')}>
          <div className="text-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider"><Users className="size-4 text-sky" />The team</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {team.slice(0, 6).map((m) => <AgentAvatar key={m.profile_id} who={m.profile} size={36} />)}
          </div>
          <div className="text-2 mt-2 truncate text-[13px]">{team.map((m) => m.profile!.full_name.split(' ')[0]).join(', ') || 'Being assembled'}</div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="What's been happening" sub={isClient ? 'Every step the team takes on your project.' : 'Live feed of this project.'} />
          <ActivityFeed items={activity.data ?? []} onOpen={(link) => navigate(link)} />
        </Panel>
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Coming up" sub="The next two weeks." right={<Button size="sm" variant="ghost" onClick={() => go('calendar')}>Calendar</Button>} />
            {upcoming.length === 0 && <p className="text-3 py-4 text-[13px]">Nothing scheduled.</p>}
            <div className="space-y-1.5">
              {upcoming.map((u) => (
                <button key={u.key} type="button" onClick={() => go(u.to)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-[var(--fill)]">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: u.color }}>{u.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{u.title}</span>
                    <span className="text-3 block text-[12px]">{u.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          {(files.data?.length ?? 0) > 0 && (
            <Panel>
              <PanelHeader title="Latest files" right={<Button size="sm" variant="ghost" onClick={() => go('files')}>All files</Button>} />
              <div className="grid grid-cols-3 gap-2">
                {latestVersions(files.data ?? []).slice(0, 3).map(({ latest }) => (
                  <button key={latest.id} type="button" onClick={() => navigate(`/projects/${project.id}/files/${latest.id}`)} className="group text-left">
                    <FileThumb file={latest} className="h-24 rounded-2xl transition-transform group-hover:scale-[1.03]" />
                    <div className="mt-1 truncate text-[12px] font-bold">{latest.title}</div>
                  </button>
                ))}
              </div>
            </Panel>
          )}
          {(project.description || clientsOf(project).length > 0) && (
            <Panel>
              <PanelHeader title="About this project" />
              {project.description && <p className="text-2 whitespace-pre-wrap text-[14px]">{project.description}</p>}
              <div className="text-3 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold">
                {project.service && <span>{project.service}</span>}
                {project.starts_on && <span className="flex items-center gap-1"><CalendarClock className="size-3.5" />Started {dayShort(project.starts_on)}</span>}
                {project.due_on && <span className="flex items-center gap-1"><Flag className="size-3.5" />Due {dayShort(project.due_on)}</span>}
                <span>{prog.total - prog.done} tasks to go · {statusMeta('in_progress').label}: {(tasks.data ?? []).filter((t) => t.status === 'in_progress').length}</span>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
