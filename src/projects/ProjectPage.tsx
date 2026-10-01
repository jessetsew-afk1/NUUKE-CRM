import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import {
  CalendarDays, Columns3, Flag, LayoutDashboard, Megaphone, MessagesSquare, Paperclip, Pencil, Rocket, Users,
} from 'lucide-react';
import { useAuth } from '@/app/auth';
import {
  latestVersions, projectStatusMeta, useCurrentProject, useFiles, useProjects, useUnread,
} from '@/data/projects';
import { Button, Empty, Panel, Picker, Pill, Skeleton, spring } from '@/ui/kit';
import { dayShort } from '@/lib/format';
import { ProjectMark, ReviewDot } from './bits';
import { Board } from './Board';
import { ProjectCalendar } from './Calendar';
import { Content } from './Content';
import { Files } from './Files';
import { Messages } from './Messages';
import { Overview } from './Overview';
import { ProjectSheet } from './ProjectSheet';
import { Sprints } from './Sprints';
import { Team } from './Team';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'board', label: 'Board', icon: Columns3 },
  { key: 'sprints', label: 'Sprints', icon: Rocket },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'files', label: 'Files', clientLabel: 'Reviews & files', icon: Paperclip },
  { key: 'content', label: 'Content', icon: Megaphone },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'messages', label: 'Messages', icon: MessagesSquare },
] as const;
export type ProjectTab = (typeof TABS)[number]['key'];

export default function ProjectPage() {
  const { id, tab = 'overview' } = useParams();
  const projectId = Number(id);
  const { profile } = useAuth();
  const projects = useProjects();
  const files = useFiles(projectId);
  const unread = useUnread();
  const navigate = useNavigate();
  const [, setCurrent] = useCurrentProject();
  const [editing, setEditing] = useState(false);

  const isClient = profile?.role === 'client';
  const isAdmin = profile?.role === 'admin';
  const project = projects.data?.find((p) => p.id === projectId);
  const mine = (projects.data ?? []).filter((p) => !p.archived_at || p.id === projectId);

  useEffect(() => { if (project) setCurrent(project.id); }, [project, setCurrent]);

  if (projects.isLoading) return <Skeleton className="h-[60vh] rounded-[30px]" />;
  if (!project) {
    return (
      <Panel>
        <Empty title="This project isn't available" body="It may have been archived, or you haven't been added to it. Ask your admin if you think you should see it."
          action={<Button onClick={() => navigate('/')}>Go home</Button>} />
      </Panel>
    );
  }

  const active = (TABS.find((t) => t.key === tab)?.key ?? 'overview') as ProjectTab;
  const pending = latestVersions(files.data ?? []).filter((g) => g.latest.review_status === 'pending').length;
  const unreadHere = unread.data?.find((u) => u.project_id === project.id)?.unread ?? 0;
  const status = projectStatusMeta(project.status);
  const canEdit = !isClient;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[300px] items-center gap-4">
        <ProjectMark project={project} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-[24px] font-extrabold leading-tight sm:text-[32px]">{project.name}</h1>
            <Pill tone={status.tone}>{status.label}</Pill>
            {project.archived_at && <Pill tone="neutral">Archived</Pill>}
          </div>
          <div className="text-2 flex flex-wrap items-center gap-x-3 text-[14px]">
            {project.client_name && <span>for <b className="text-[color:var(--text)]">{project.client_name}</b></span>}
            {project.service && <span>{project.service}</span>}
            {project.due_on && <span className="flex items-center gap-1"><Flag className="size-3.5" />due {dayShort(project.due_on)}</span>}
          </div>
        </div>
        </div>
        {mine.length > 1 && (
          <Picker
            className="w-full sm:w-[230px]"
            value={String(project.id)}
            onChange={(v) => navigate(`/projects/${v}/${active}`)}
            options={mine.map((p) => ({ value: String(p.id), label: p.name, hint: p.client_name ?? undefined, dot: p.color }))}
          />
        )}
        {isAdmin && <Button variant="glass" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit project</Button>}
      </div>

      <nav className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="glass flex gap-1 rounded-[20px] p-1.5">
          {TABS.map((t) => {
            const on = t.key === active;
            const Icon = t.icon;
            const badge = t.key === 'files' && pending ? 'review' : t.key === 'messages' && unreadHere ? unreadHere : null;
            return (
              <button key={t.key} type="button" onClick={() => navigate(`/projects/${project.id}${t.key === 'overview' ? '' : `/${t.key}`}`)}
                className={clsx('relative flex h-10 items-center gap-2 whitespace-nowrap rounded-[14px] px-3.5 text-[13.5px] font-bold transition-colors',
                  on ? 'text-[color:var(--btn-text)]' : 'text-2 hover:text-[color:var(--text)]')}>
                {on && <motion.span layoutId="project-tab" transition={spring} className="absolute inset-0 rounded-[14px] bg-[var(--btn)]" />}
                <Icon className="relative size-4" />
                <span className="relative">{isClient && 'clientLabel' in t ? t.clientLabel : t.label}</span>
                {badge === 'review' ? <ReviewDot size="sm" className="relative" />
                  : badge ? <span className="relative grid min-w-[18px] place-items-center rounded-full bg-iris px-1 text-[10px] leading-[18px] text-white">{badge}</span> : null}
              </button>
            );
          })}
        </div>
      </nav>

      <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}>
        {active === 'overview' && <Overview project={project} isClient={isClient} />}
        {active === 'board' && <Board project={project} canEdit={canEdit} />}
        {active === 'sprints' && <Sprints project={project} canEdit={canEdit} />}
        {active === 'calendar' && <ProjectCalendar project={project} canEdit={canEdit} />}
        {active === 'files' && <Files project={project} canEdit={canEdit} isClient={isClient} />}
        {active === 'content' && <Content project={project} canEdit={canEdit} />}
        {active === 'team' && <Team project={project} isClient={isClient} onManage={isAdmin ? () => setEditing(true) : undefined} />}
        {active === 'messages' && <Messages project={project} isClient={isClient} />}
      </motion.div>

      {isAdmin && <ProjectSheet project={editing ? project : null} onClose={() => setEditing(false)} />}
    </>
  );
}
