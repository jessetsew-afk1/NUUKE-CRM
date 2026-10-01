import { useMemo, useState } from 'react';
import { useAuth } from '@/app/auth';
import { useProjects, useTaskIndex, type ProjectWithTeam } from '@/data/projects';
import { Chip, Input, PageHeader, Panel, PanelHeader, Segmented, Skeleton } from '@/ui/kit';
import { Search } from 'lucide-react';
import { ProjectMark } from '@/projects/bits';
import { TaskRows } from '@/projects/TaskRows';

export default function MyTasksPage() {
  const { profile } = useAuth();
  const projects = useProjects();
  const tasks = useTaskIndex();
  const [show, setShow] = useState<'open' | 'done' | 'all'>('open');
  const [who, setWho] = useState<'me' | 'everyone'>('me');
  const [only, setOnly] = useState<number | null>(null);
  const [q, setQ] = useState('');

  const byId = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p])), [projects.data]) as Map<number, ProjectWithTeam>;
  const live = (projects.data ?? []).filter((p) => !p.archived_at);
  const list = (tasks.data ?? []).filter((t) => {
    if (!byId.get(t.project_id) || byId.get(t.project_id)!.archived_at) return false;
    if (who === 'me' && t.assignee_id !== profile?.id) return false;
    if (show === 'open' && t.status === 'done') return false;
    if (show === 'done' && t.status !== 'done') return false;
    if (only && t.project_id !== only) return false;
    const s = q.trim().toLowerCase();
    return !s || t.title.toLowerCase().includes(s);
  }).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));

  const groups = live.map((p) => ({ p, list: list.filter((t) => t.project_id === p.id) })).filter((g) => g.list.length);

  return (
    <>
      <PageHeader title="My tasks" sub="Everything assigned to you, across every project. Tick to finish; tap to open it on its board." />
      <Panel className="mb-5 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={show} onChange={setShow} options={[{ value: 'open', label: 'To do' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }]} />
          <Segmented value={who} onChange={setWho} options={[{ value: 'me', label: 'Mine' }, { value: 'everyone', label: 'Whole team' }]} />
          <Input className="min-w-[180px] flex-1" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
        </div>
        {live.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={!only} onClick={() => setOnly(null)}>All projects</Chip>
            {live.map((p) => <Chip key={p.id} active={only === p.id} dot={p.color} onClick={() => setOnly(only === p.id ? null : p.id)}>{p.name}</Chip>)}
          </div>
        )}
      </Panel>
      {tasks.isLoading ? <Skeleton className="h-96 rounded-[26px]" /> : groups.length === 0 ? (
        <Panel><p className="text-3 py-10 text-center text-sm">{show === 'open' ? 'Nothing to do — enjoy it. ✨' : 'Nothing here.'}</p></Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {groups.map(({ p, list: l }) => (
            <Panel key={p.id}>
              <PanelHeader title={<span className="flex items-center gap-2"><ProjectMark project={p} />{p.name}</span>} sub={`${l.length} task${l.length === 1 ? '' : 's'}`} />
              <TaskRows tasks={l} projects={byId} />
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
