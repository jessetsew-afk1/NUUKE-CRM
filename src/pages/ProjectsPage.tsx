import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderKanban, MessagesSquare, Plus, Search } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useClientInbox, usePendingReviews, useProjects, useTaskIndex, useUnread } from '@/data/projects';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Empty, Input, PageHeader, Panel, PanelHeader, Segmented, Skeleton } from '@/ui/kit';
import { ago } from '@/lib/format';
import { ProjectCard } from '@/projects/bits';
import { ProjectSheet } from '@/projects/ProjectSheet';

type Filter = 'active' | 'done' | 'archived' | 'all';

export default function ProjectsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const projects = useProjects();
  const tasks = useTaskIndex();
  const pending = usePendingReviews();
  const unread = useUnread();
  const inbox = useClientInbox(isAdmin);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => (projects.data ?? []).filter((p) => {
    if (filter === 'active' && (p.archived_at || p.status === 'done')) return false;
    if (filter === 'done' && (p.archived_at || p.status !== 'done')) return false;
    if (filter === 'archived' && !p.archived_at) return false;
    const s = q.trim().toLowerCase();
    return !s || p.name.toLowerCase().includes(s) || (p.client_name ?? '').toLowerCase().includes(s);
  }), [projects.data, filter, q]);
  const names = new Map((projects.data ?? []).map((p) => [p.id, p.name]));
  const unreadTotal = (unread.data ?? []).reduce((s, u) => s + Number(u.unread), 0);

  return (
    <>
      <PageHeader
        title="Projects"
        sub={isAdmin ? 'Set up projects, put the team and the client on them, and watch everything move.' : 'Every project you are on.'}
        right={isAdmin && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New project</Button>}
      />

      {isAdmin && (inbox.data?.length ?? 0) > 0 && (
        <Panel className="mb-5">
          <PanelHeader title={<span className="flex items-center gap-2"><MessagesSquare className="size-4 text-iris" />Client messages</span>}
            sub={unreadTotal ? `${unreadTotal} unread across your projects` : 'The latest from your clients'} />
          <div className="grid gap-2 md:grid-cols-2">
            {inbox.data!.slice(0, 6).map((m) => {
              const isUnread = (unread.data ?? []).some((u) => u.project_id === m.project_id && u.unread > 0 && Date.parse(u.last_at) >= Date.parse(m.created_at));
              return (
                <motion.button key={m.id} type="button" whileTap={{ scale: 0.98 }} onClick={() => navigate(`/projects/${m.project_id}/messages`)}
                  className="fill flex items-start gap-3 rounded-[18px] p-3 text-left hover:bg-[var(--fill-2)]">
                  <AgentAvatar who={m.profiles} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13px]">
                      <b className="truncate">{m.profiles.full_name}</b>
                      <span className="text-3 truncate">· {names.get(m.project_id)}</span>
                      {isUnread && <span className="size-2 shrink-0 rounded-full bg-iris" />}
                    </span>
                    <span className="text-2 line-clamp-2 block text-[13px]">{m.body}</span>
                    <span className="text-3 text-[11px]">{ago(m.created_at)}</span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel className="mb-5 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'active', label: 'In progress' }, { value: 'done', label: 'Delivered' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All' },
          ]} />
          <Input className="min-w-[200px] flex-1" placeholder="Search projects or clients" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
        </div>
      </Panel>

      {projects.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52 rounded-[26px]" />)}</div>
      ) : list.length === 0 ? (
        <Panel>
          <Empty art={<FolderKanban className="size-10 text-iris" />}
            title={(projects.data?.length ?? 0) === 0 ? 'No projects yet' : 'Nothing matches'}
            body={(projects.data?.length ?? 0) === 0 ? (isAdmin ? 'Create the first project, then add your production team and the client\'s login to it.' : 'When your admin puts you on a project, it will show up here.') : undefined}
            action={isAdmin && !projects.data?.length ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New project</Button> : undefined} />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i}
              tasks={(tasks.data ?? []).filter((t) => t.project_id === p.id)}
              pending={(pending.data ?? []).filter((f) => f.project_id === p.id).length}
              unread={Number((unread.data ?? []).find((u) => u.project_id === p.id)?.unread ?? 0)}
              onClick={() => navigate(`/projects/${p.id}`)} />
          ))}
        </div>
      )}

      {isAdmin && <ProjectSheet project={creating ? 'new' : null} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/projects/${id}`)} />}
    </>
  );
}
