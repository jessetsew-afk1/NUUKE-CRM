import { useMemo } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import {
  CalendarDays, CheckCircle2, FileUp, Flag, MessageCircle, Rocket, Sparkles, SquareCheck, UserPlus, Eye, Megaphone,
} from 'lucide-react';
import { usePeople } from '@/data/common';
import { progressOf, projectStatusMeta, type MiniProfile, type ProjectWithTeam, type TaskLite } from '@/data/projects';
import type { Profile, ProjectActivity } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Pill, ProgressBar } from '@/ui/kit';
import { ago, dayShort } from '@/lib/format';

/** Everyone this person may see, by id — for names and agents on any row. */
export function usePeopleMap() {
  const people = usePeople();
  return useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]) as Map<string, Profile>;
}

/**
 * The big red dot. Pulses while something is waiting on the client, so it is
 * impossible to miss from across the room.
 */
export function ReviewDot({ count, size = 'md', className }: { count?: number; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const px = { sm: 10, md: 18, lg: 30, xl: 64 }[size];
  return (
    <span className={clsx('relative inline-grid shrink-0 place-items-center', className)} style={{ width: px, height: px }}>
      <span className="absolute inset-0 animate-ping rounded-full bg-bad opacity-50" />
      {size === 'xl' && <span className="absolute -inset-3 animate-pulse rounded-full bg-bad/20" />}
      <span
        className="relative grid size-full place-items-center rounded-full bg-bad font-extrabold text-white"
        style={{ boxShadow: '0 0 0 3px rgba(255,69,58,.18), 0 6px 22px rgba(255,69,58,.55)', fontSize: px * 0.45 }}
      >
        {count !== undefined && size !== 'sm' ? count : null}
      </span>
    </span>
  );
}

export function AvatarStack({ people, max = 5, size = 30 }: { people: (MiniProfile | Profile | null | undefined)[]; max?: number; size?: number }) {
  const list = people.filter(Boolean) as MiniProfile[];
  const extra = list.length - max;
  return (
    <div className="flex items-center">
      {list.slice(0, max).map((p, i) => (
        <span key={p.id} className="rounded-full ring-2 ring-[var(--canvas)]" style={{ marginLeft: i ? -size * 0.3 : 0 }} title={p.full_name}>
          <AgentAvatar who={p} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span className="fill-2 grid place-items-center rounded-full text-[11px] font-bold ring-2 ring-[var(--canvas)]"
          style={{ width: size, height: size, marginLeft: -size * 0.3 }}>+{extra}</span>
      )}
    </div>
  );
}

export function ProjectCard({
  project, tasks, pending = 0, unread = 0, onClick, index = 0, footer,
}: {
  project: ProjectWithTeam; tasks: TaskLite[]; pending?: number; unread?: number; onClick: () => void; index?: number; footer?: React.ReactNode;
}) {
  const prog = progressOf(tasks);
  const status = projectStatusMeta(project.status);
  const team = project.members.filter((m) => m.profile?.role !== 'client').map((m) => m.profile);
  const client = project.client_name ?? project.members.find((m) => m.profile?.role === 'client')?.profile?.full_name;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ y: -3 }}
      className={clsx('glass relative overflow-hidden rounded-[26px] text-left', project.archived_at && 'opacity-60')}
    >
      <button type="button" onClick={onClick} className="block w-full p-5 text-left">
        <div className="absolute -right-10 -top-10 size-36 rounded-full opacity-30 blur-2xl" style={{ background: project.color }} />
        <div className="relative flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-[17px] font-black text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${project.color}, ${project.color}aa)` }}>
            {project.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[17px] font-extrabold">{project.name}</h3>
              {pending > 0 && <ReviewDot size="sm" />}
            </div>
            <div className="text-2 truncate text-[13px]">{client ? `for ${client}` : project.service ?? 'Internal'}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill tone={status.tone}>{status.label}</Pill>
              {project.archived_at && <Pill tone="neutral">Archived</Pill>}
            </div>
          </div>
        </div>

        <div className="relative mt-5">
          <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
            <span className="text-2 font-semibold">{prog.done} of {prog.total} tasks done</span>
            <span className="tabular font-extrabold">{Math.round(prog.ratio * 100)}%</span>
          </div>
          <ProgressBar value={prog.done} max={Math.max(1, prog.total)} height={8} tone={`linear-gradient(90deg, ${project.color}, ${project.color}bb)`} glow={false} />
        </div>

        <div className="relative mt-4 flex items-center justify-between gap-2">
          <AvatarStack people={team} size={28} />
          <div className="text-2 flex items-center gap-3 text-[12px] font-semibold">
            {pending > 0 && <span className="flex items-center gap-1 text-bad"><Eye className="size-3.5" />{pending} to review</span>}
            {unread > 0 && <span className="flex items-center gap-1 text-iris"><MessageCircle className="size-3.5" />{unread}</span>}
            {project.due_on && <span className="flex items-center gap-1"><Flag className="size-3.5" />{dayShort(project.due_on)}</span>}
          </div>
        </div>
      </button>
      {footer}
    </motion.div>
  );
}

const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  task: <SquareCheck className="size-3.5" />,
  task_done: <CheckCircle2 className="size-3.5" />,
  file: <FileUp className="size-3.5" />,
  review_requested: <Eye className="size-3.5" />,
  review: <Sparkles className="size-3.5" />,
  comment: <MessageCircle className="size-3.5" />,
  member: <UserPlus className="size-3.5" />,
  sprint: <Rocket className="size-3.5" />,
  sprint_done: <Rocket className="size-3.5" />,
  event: <CalendarDays className="size-3.5" />,
  post: <Megaphone className="size-3.5" />,
  post_live: <Megaphone className="size-3.5" />,
};
const ACTIVITY_COLOR: Record<string, string> = {
  task_done: '#30C46C', review: '#30C46C', review_requested: '#FF453A', sprint: '#7C5CFF', sprint_done: '#7C5CFF',
  file: '#5AB8FF', member: '#FF9A6B', post_live: '#E1306C', comment: '#FF9F0A',
};

export function ActivityFeed({
  items, onOpen, empty = 'Nothing has happened here yet.', projectNames,
}: { items: ProjectActivity[]; onOpen?: (link: string) => void; empty?: string; projectNames?: Map<number, string> }) {
  const people = usePeopleMap();
  if (!items.length) return <p className="text-3 py-8 text-center text-sm">{empty}</p>;
  return (
    <ol className="relative space-y-1">
      {items.map((a, i) => {
        const who = a.actor_id ? people.get(a.actor_id) : null;
        const color = ACTIVITY_COLOR[a.kind] ?? '#8E8AA0';
        return (
          <motion.li key={a.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
            <button
              type="button"
              disabled={!a.link || !onOpen}
              onClick={() => a.link && onOpen?.(a.link)}
              className="flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left enabled:hover:bg-[var(--fill)]"
            >
              <span className="relative shrink-0">
                {who ? <AgentAvatar who={who} size={34} /> : <span className="fill-2 grid size-[34px] place-items-center rounded-full"><Sparkles className="size-4" /></span>}
                <span className="absolute -bottom-1 -right-1 grid size-[18px] place-items-center rounded-full text-white ring-2 ring-[var(--canvas)]" style={{ background: color }}>
                  {ACTIVITY_ICON[a.kind] ?? <Sparkles className="size-3" />}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-snug">{a.summary}</span>
                <span className="text-3 text-[12px]">
                  {projectNames?.get(a.project_id) && <>{projectNames.get(a.project_id)} · </>}
                  {ago(a.created_at)}
                </span>
              </span>
            </button>
          </motion.li>
        );
      })}
    </ol>
  );
}

/** A small coloured square standing in for a project. */
export function ProjectMark({ project, size = 22 }: { project: { name: string; color: string }; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-lg font-black text-white"
      style={{ width: size, height: size, fontSize: size * 0.5, background: project.color }}>
      {project.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
