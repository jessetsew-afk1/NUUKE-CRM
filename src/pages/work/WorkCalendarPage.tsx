import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/auth';
import { useAllSprints, useEvents, usePosts, useProjects, useTaskIndex } from '@/data/projects';
import { Chip, PageHeader, Panel, Switch } from '@/ui/kit';
import { CAL_LEGEND, calendarItems } from '@/projects/Calendar';
import { MonthCalendar } from '@/projects/MonthCalendar';

export default function WorkCalendarPage() {
  const { profile } = useAuth();
  const projects = useProjects();
  const tasks = useTaskIndex();
  const events = useEvents();
  const posts = usePosts();
  const sprints = useAllSprints();
  const navigate = useNavigate();
  const [only, setOnly] = useState<number | null>(null);
  const [mineOnly, setMineOnly] = useState(true);

  const live = (projects.data ?? []).filter((p) => !p.archived_at);
  const ok = (id: number) => live.some((p) => p.id === id) && (!only || only === id);
  const names = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p.name])), [projects.data]);

  const items = calendarItems({
    tasks: (tasks.data ?? []).filter((t) => ok(t.project_id) && (!mineOnly || t.assignee_id === profile?.id)),
    events: (events.data ?? []).filter((e) => ok(e.project_id)),
    posts: (posts.data ?? []).filter((p) => ok(p.project_id)),
    sprints: (sprints.data ?? []).filter((s) => ok(s.project_id)),
    onTask: (t) => navigate(`/projects/${t.project_id}/board?task=${t.id}`),
    onEvent: (e) => navigate(`/projects/${e.project_id}/calendar`),
    onPost: (p) => navigate(`/projects/${p.project_id}/content`),
    onSprint: (s) => navigate(`/projects/${s.project_id}/sprints`),
    projectName: (id) => names.get(id),
  });

  return (
    <>
      <PageHeader title="Calendar" sub="Meetings, milestones, deadlines, posts and sprints from every project you are on." />
      <Panel className="mb-5 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={!only} onClick={() => setOnly(null)}>All projects</Chip>
          {live.map((p) => <Chip key={p.id} active={only === p.id} dot={p.color} onClick={() => setOnly(only === p.id ? null : p.id)}>{p.name}</Chip>)}
          <span className="flex-1" />
          <Switch checked={mineOnly} onChange={setMineOnly} label="Only my task deadlines" />
        </div>
      </Panel>
      <Panel className="!p-5"><MonthCalendar items={items} legend={CAL_LEGEND} /></Panel>
    </>
  );
}
