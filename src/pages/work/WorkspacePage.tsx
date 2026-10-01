import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, CheckCircle2, Eye, Flag, ListTodo, Megaphone, Users } from 'lucide-react';
import { useAuth } from '@/app/auth';
import {
  eventKindMeta, platformMeta, teamOf, useEvents, usePendingReviews, usePosts, useProjects, useTaskIndex, useUnread, type ProjectWithTeam,
} from '@/data/projects';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Empty, PageHeader, Panel, PanelHeader, Skeleton, Stat } from '@/ui/kit';
import { BarList } from '@/ui/charts';
import { addDaysISO, firstName, friendly, greeting, localISO } from '@/lib/format';
import { ProjectCard } from '@/projects/bits';
import { TaskRows } from '@/projects/TaskRows';

export default function WorkspacePage() {
  const { profile } = useAuth();
  const projects = useProjects();
  const tasks = useTaskIndex();
  const pending = usePendingReviews();
  const unread = useUnread();
  const events = useEvents();
  const posts = usePosts();
  const navigate = useNavigate();
  const today = localISO();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();

  const live = useMemo(() => (projects.data ?? []).filter((p) => !p.archived_at), [projects.data]);
  const byId = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p])), [projects.data]) as Map<number, ProjectWithTeam>;
  const liveIds = new Set(live.map((p) => p.id));
  const all = (tasks.data ?? []).filter((t) => liveIds.has(t.project_id));
  const mine = all.filter((t) => t.assignee_id === profile?.id);
  const open = mine.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.due_on && t.due_on < today);
  const dueToday = open.filter((t) => t.due_on === today);
  const doneWeek = mine.filter((t) => t.completed_at && t.completed_at >= weekAgo);
  const waiting = (pending.data ?? []).filter((f) => liveIds.has(f.project_id));

  const rank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...open].sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || rank[a.priority] - rank[b.priority]);
  const inWeek = addDaysISO(today, 7);

  // How everyone on my projects is doing this week.
  const teammates = useMemo(() => {
    const m = new Map<string, NonNullable<ReturnType<typeof teamOf>[number]['profile']>>();
    for (const p of live) for (const x of teamOf(p)) m.set(x.profile_id, x.profile!);
    return [...m.values()].map((who) => ({
      who,
      done: all.filter((t) => t.assignee_id === who.id && t.completed_at && t.completed_at >= weekAgo).length,
      open: all.filter((t) => t.assignee_id === who.id && t.status !== 'done').length,
    })).sort((a, b) => b.done - a.done || a.who.full_name.localeCompare(b.who.full_name));
  }, [live, all, weekAgo]);

  const comingUp = useMemo(() => {
    const now = Date.now();
    const end = now + 7 * 864e5;
    const list = [
      ...(events.data ?? []).filter((e) => liveIds.has(e.project_id) && Date.parse(e.starts_at) >= now - 36e5 && Date.parse(e.starts_at) <= end)
        .map((e) => ({ key: `e${e.id}`, at: Date.parse(e.starts_at), title: e.title, when: friendly(e.starts_at), color: eventKindMeta(e.kind).color, project: e.project_id, icon: <Flag className="size-4" />, to: `/projects/${e.project_id}/calendar` })),
      ...(posts.data ?? []).filter((p) => liveIds.has(p.project_id) && p.scheduled_at && p.status !== 'posted' && Date.parse(p.scheduled_at) >= now && Date.parse(p.scheduled_at) <= end)
        .map((p) => ({ key: `p${p.id}`, at: Date.parse(p.scheduled_at!), title: p.title, when: friendly(p.scheduled_at), color: platformMeta(p.platform).color, project: p.project_id, icon: <Megaphone className="size-4" />, to: `/projects/${p.project_id}/content` })),
    ];
    return list.sort((a, b) => a.at - b.at).slice(0, 6);
  }, [events.data, posts.data, live]);

  if (projects.isLoading || tasks.isLoading) return <Skeleton className="h-[60vh] rounded-[30px]" />;

  return (
    <>
      <PageHeader
        eyebrow={greeting()}
        title={`Hi ${firstName(profile?.full_name)} 👋`}
        sub={open.length ? `${open.length} task${open.length === 1 ? '' : 's'} on your plate${dueToday.length ? ` · ${dueToday.length} due today` : ''}${overdue.length ? ` · ${overdue.length} overdue` : ''}.` : 'Your plate is clear. Pick something up from a board, or enjoy the calm.'}
      />

      {live.length === 0 ? (
        <Panel><Empty art={<Users className="size-10 text-iris" />} title="You're not on a project yet" body="When your admin adds you to a project, your tasks, boards and calendars will all show up here." /></Panel>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Open tasks" value={open.length} sub={`across ${new Set(open.map((t) => t.project_id)).size} projects`} icon={<ListTodo className="size-4" />} accent="#7C5CFF" />
            <Stat label="Due today" value={dueToday.length} sub={overdue.length ? <span className="font-semibold text-bad">{overdue.length} overdue</span> : 'nothing overdue'} icon={<AlarmClock className="size-4" />} accent="#FF9F0A" />
            <Stat label="Done this week" value={doneWeek.length} sub="keep it rolling" icon={<CheckCircle2 className="size-4" />} accent="#30C46C" />
            <Stat label="Waiting on clients" value={waiting.length} sub={waiting.length ? 'reviews pending' : 'no reviews pending'} icon={<Eye className="size-4" />} accent="#FF453A" />
          </div>

          <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel>
              <PanelHeader title="My tasks" sub="Soonest first. Tick to finish." right={<Button size="sm" variant="ghost" onClick={() => navigate('/work/tasks')}>See all</Button>} />
              {overdue.length > 0 && <Group label="Overdue" tone="text-bad"><TaskRows tasks={sorted.filter((t) => t.due_on && t.due_on < today)} projects={byId} /></Group>}
              <Group label="Today"><TaskRows tasks={sorted.filter((t) => t.due_on === today)} projects={byId} empty="Nothing due today." /></Group>
              <Group label="This week"><TaskRows tasks={sorted.filter((t) => t.due_on && t.due_on > today && t.due_on <= inWeek)} projects={byId} empty="Nothing else this week." /></Group>
              <Group label="Later / no date"><TaskRows tasks={sorted.filter((t) => !t.due_on || t.due_on > inWeek).slice(0, 8)} projects={byId} empty="—" /></Group>
            </Panel>
            <div className="space-y-5">
              <Panel>
                <PanelHeader title="Team progress" sub="Tasks finished in the last 7 days." />
                <BarList rows={teammates.map(({ who, done, open: o }) => ({
                  key: who.id, value: done, valueLabel: String(done), sub: `${o} open`,
                  label: <span className="flex items-center gap-2"><AgentAvatar who={who} size={22} />{who.id === profile?.id ? 'You' : who.full_name}</span>,
                }))} />
              </Panel>
              <Panel>
                <PanelHeader title="Coming up" sub="Meetings, milestones and posts this week." right={<Button size="sm" variant="ghost" onClick={() => navigate('/work/calendar')}>Calendar</Button>} />
                {comingUp.length === 0 && <p className="text-3 py-3 text-[13px]">A quiet week.</p>}
                <div className="space-y-1">
                  {comingUp.map((c) => (
                    <button key={c.key} type="button" onClick={() => navigate(c.to)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-[var(--fill)]">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: c.color }}>{c.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold">{c.title}</span>
                        <span className="text-3 block truncate text-[12px]">{c.when} · {byId.get(c.project)?.name}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <h2 className="mb-3 text-[20px] font-extrabold">My projects</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {live.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} tasks={all.filter((t) => t.project_id === p.id)}
                pending={waiting.filter((f) => f.project_id === p.id).length}
                unread={Number((unread.data ?? []).find((u) => u.project_id === p.id)?.unread ?? 0)}
                onClick={() => navigate(`/projects/${p.id}`)} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Group({ label, tone, children }: { label: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className={`mb-1 px-2 text-[11px] font-extrabold uppercase tracking-wider ${tone ?? 'text-3'}`}>{label}</div>
      {children}
    </div>
  );
}
