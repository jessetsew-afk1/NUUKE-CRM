import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor,
  useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronDown, Columns3, EyeOff, Flag, LayoutList, Plus, Search, Table2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  PRIORITIES, TASK_STATUSES, priorityMeta, statusMeta, teamOf, useProjectRefresh, useSprints, useTasks, type ProjectWithTeam,
} from '@/data/projects';
import { supabase } from '@/lib/supabase';
import type { Task, TaskStatus } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Empty, Input, Picker, Segmented, Skeleton, useClickOutside } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { dayShort, localISO } from '@/lib/format';
import { TaskSheet, type TaskDraft } from './TaskSheet';

type SprintFilter = 'all' | 'current' | 'none' | `${number}`;

export function Board({ project, canEdit }: { project: ProjectWithTeam; canEdit: boolean }) {
  const tasks = useTasks(project.id);
  const sprints = useSprints(project.id);
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'board' | 'table'>(() => (localStorage.getItem('nuuke-board-view') as 'board' | 'table') || 'board');
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [sprint, setSprint] = useState<SprintFilter | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const qc = useQueryClient();
  const refresh = useProjectRefresh();
  const toast = useToast();

  const active = sprints.data?.find((s) => s.status === 'active');
  const sprintFilter: SprintFilter = (params.get('sprint') as SprintFilter | null) ?? sprint ?? (active ? 'current' : 'all');
  const setSprintFilter = (v: SprintFilter) => {
    setSprint(v);
    if (params.has('sprint')) { params.delete('sprint'); setParams(params, { replace: true }); }
  };
  useEffect(() => { try { localStorage.setItem('nuuke-board-view', view); } catch { /* ignore */ } }, [view]);

  const openId = Number(params.get('task')) || null;
  const openTask = openId ? tasks.data?.find((t) => t.id === openId) ?? null : null;
  const openSheet = (t: Task) => { params.set('task', String(t.id)); setParams(params); };
  const closeSheet = () => { setDraft(null); if (params.has('task')) { params.delete('task'); setParams(params, { replace: true }); } };

  const visible = useMemo(() => (tasks.data ?? []).filter((t) => {
    if (sprintFilter === 'current' && t.sprint_id !== (active?.id ?? -1)) return false;
    if (sprintFilter === 'none' && t.sprint_id !== null) return false;
    if (/^\d+$/.test(sprintFilter) && t.sprint_id !== Number(sprintFilter)) return false;
    if (people.length && !people.includes(t.assignee_id ?? '')) return false;
    const s = q.trim().toLowerCase();
    return !s || t.title.toLowerCase().includes(s) || t.labels.some((l) => l.toLowerCase().includes(s));
  }), [tasks.data, sprintFilter, active, people, q]);

  const byStatus = useMemo(() => {
    const m = new Map<TaskStatus, Task[]>(TASK_STATUSES.map((s) => [s.key, []]));
    for (const t of visible) m.get(t.status as TaskStatus)?.push(t);
    for (const list of m.values()) list.sort((a, b) => a.position - b.position);
    return m;
  }, [visible]);

  /** Optimistic: the card moves now, the database catches up. */
  const patch = async (t: Task, change: Partial<Omit<Task, 'id' | 'project_id'>>) => {
    const key = ['p', project.id, 'tasks'];
    const prev = qc.getQueryData<Task[]>(key);
    qc.setQueryData<Task[]>(key, (xs) => xs?.map((x) => (x.id === t.id ? { ...x, ...change } : x)));
    const { error } = await supabase.from('tasks').update(change).eq('id', t.id);
    if (error) { qc.setQueryData(key, prev); toast({ title: error.message, tone: 'danger' }); return; }
    if (change.status === 'done' && t.status !== 'done') celebrate('small');
    refresh(project.id);
  };

  const quickAdd = async (status: TaskStatus, title: string) => {
    const { error } = await supabase.from('tasks').insert({
      project_id: project.id, title, status, sprint_id: sprintFilter === 'current' ? active?.id ?? null : /^\d+$/.test(sprintFilter) ? Number(sprintFilter) : null,
    });
    if (error) { toast({ title: error.message, tone: 'danger' }); return false; }
    refresh(project.id);
    return true;
  };

  const team = teamOf(project);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[
          { value: 'board', label: <span className="flex items-center gap-1.5"><Columns3 className="size-4" />Board</span> },
          { value: 'table', label: <span className="flex items-center gap-1.5"><Table2 className="size-4" />Table</span> },
        ]} />
        <Picker<SprintFilter>
          className="w-[250px]"
          value={sprintFilter}
          onChange={setSprintFilter}
          options={[
            ...(active ? [{ value: 'current' as SprintFilter, label: `Current: ${active.name}` }] : []),
            { value: 'all', label: 'All tasks' },
            { value: 'none', label: 'Backlog (no sprint)' },
            ...(sprints.data ?? []).filter((s) => s.id !== active?.id).map((s) => ({ value: String(s.id) as SprintFilter, label: s.name, hint: s.status === 'done' ? 'Finished' : 'Planned' })),
          ]}
        />
        <div className="flex items-center gap-1">
          {team.map((m) => {
            const on = people.includes(m.profile_id);
            return (
              <button key={m.profile_id} type="button" title={m.profile!.full_name}
                onClick={() => setPeople((p) => (on ? p.filter((x) => x !== m.profile_id) : [...p, m.profile_id]))}
                className={clsx('rounded-full transition-all', on ? 'ring-2 ring-iris ring-offset-2 ring-offset-[var(--canvas)]' : people.length ? 'opacity-40 hover:opacity-100' : '')}>
                <AgentAvatar who={m.profile} size={32} />
              </button>
            );
          })}
        </div>
        <Input className="min-w-[160px] flex-1" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
        {canEdit && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ new: true })}>New task</Button>}
      </div>

      {tasks.isLoading ? (
        <div className="flex gap-4 overflow-hidden">{TASK_STATUSES.map((s) => <Skeleton key={s.key} className="h-[480px] w-[280px] shrink-0 rounded-[26px]" />)}</div>
      ) : !tasks.data?.length && !canEdit ? (
        <Empty title="No tasks shared yet" body="As the team plans the work, you'll see every step here." />
      ) : view === 'board' ? (
        <Kanban byStatus={byStatus} canEdit={canEdit} onOpen={openSheet} onMove={patch} onQuickAdd={quickAdd} />
      ) : (
        <TaskTable byStatus={byStatus} canEdit={canEdit} onOpen={openSheet} onPatch={patch} project={project} sprints={sprints.data ?? []} />
      )}

      <TaskSheet task={draft ?? openTask} project={project} sprints={sprints.data ?? []} canEdit={canEdit} onClose={closeSheet} />
    </div>
  );
}

/* ================================================================= kanban */
// Prefer the card under the pointer (to drop before it), then the column.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const card = hits.find((h) => String(h.id).startsWith('task:') && h.id !== `task:${args.active.id}`);
  if (card) return [card];
  const col = hits.find((h) => String(h.id).startsWith('col:'));
  if (col) return [col];
  return rectIntersection(args).filter((h) => String(h.id).startsWith('col:'));
};

function Kanban({
  byStatus, canEdit, onOpen, onMove, onQuickAdd,
}: {
  byStatus: Map<TaskStatus, Task[]>; canEdit: boolean; onOpen: (t: Task) => void;
  onMove: (t: Task, change: Partial<Omit<Task, 'id' | 'project_id'>>) => void; onQuickAdd: (s: TaskStatus, title: string) => Promise<boolean>;
}) {
  const [dragging, setDragging] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );
  const all = useMemo(() => [...byStatus.values()].flat(), [byStatus]);

  const onDragStart = (e: DragStartEvent) => setDragging(all.find((t) => t.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const t = all.find((x) => x.id === e.active.id);
    if (!t || !e.over) return;
    const over = String(e.over.id);
    if (over.startsWith('col:')) {
      const status = over.slice(4) as TaskStatus;
      const list = (byStatus.get(status) ?? []).filter((x) => x.id !== t.id);
      const position = (list.at(-1)?.position ?? 0) + 1;
      if (status !== t.status || list.at(-1)?.position !== undefined) onMove(t, { status, position });
    } else {
      const target = all.find((x) => `task:${x.id}` === over);
      if (!target || target.id === t.id) return;
      const list = (byStatus.get(target.status as TaskStatus) ?? []).filter((x) => x.id !== t.id);
      const i = list.findIndex((x) => x.id === target.id);
      const before = list[i - 1]?.position ?? target.position - 1;
      onMove(t, { status: target.status, position: (before + target.position) / 2 });
    }
  };

  const columns = (
    <div className="scroll-x -mx-4 flex gap-4 px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {TASK_STATUSES.map((s) => (
        <Column key={s.key} status={s.key} tasks={byStatus.get(s.key) ?? []} canEdit={canEdit} onOpen={onOpen} onQuickAdd={onQuickAdd} />
      ))}
    </div>
  );

  if (!canEdit) return columns;
  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      {columns}
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.32,0.72,0,1)' }}>
        {dragging && <TaskCard task={dragging} overlay />}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status, tasks, canEdit, onOpen, onQuickAdd,
}: { status: TaskStatus; tasks: Task[]; canEdit: boolean; onOpen: (t: Task) => void; onQuickAdd: (s: TaskStatus, title: string) => Promise<boolean> }) {
  const meta = statusMeta(status);
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}`, disabled: !canEdit });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [limit, setLimit] = useState(30);

  const submit = async () => {
    const v = title.trim();
    if (!v) { setAdding(false); return; }
    if (await onQuickAdd(status, v)) setTitle('');
  };

  return (
    <div
      ref={setNodeRef}
      className={clsx('glass flex max-h-[calc(100dvh-280px)] min-h-[440px] w-[284px] shrink-0 flex-col rounded-[26px] p-3 transition-[box-shadow,background] duration-200',
        isOver && 'bg-[var(--glass-strong)]')}
      style={isOver ? { boxShadow: `0 0 0 2px ${meta.color}, var(--shadow-lift)` } : undefined}
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="size-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} />
        <h3 className="text-[14px] font-extrabold">{meta.label}</h3>
        <span className="fill tabular rounded-full px-2 text-[12px] font-bold">{tasks.length}</span>
        {canEdit && (
          <button type="button" onClick={() => setAdding(true)} className="text-3 ml-auto rounded-lg p-1 hover:bg-[var(--fill-2)] hover:text-[color:var(--text)]" aria-label={`Add to ${meta.label}`}>
            <Plus className="size-4" />
          </button>
        )}
      </div>
      <div className="scroll-y -mx-1 flex-1 space-y-2 px-1 pb-1">
        <AnimatePresence initial={false}>
          {tasks.slice(0, limit).map((t) => <DraggableTask key={t.id} task={t} canEdit={canEdit} onOpen={() => onOpen(t)} />)}
        </AnimatePresence>
        {tasks.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + 30)} className="text-2 w-full py-2 text-[13px] font-bold">Show {tasks.length - limit} more</button>
        )}
        {adding ? (
          <div className="glass-strong rounded-[18px] p-2">
            <textarea
              autoFocus
              rows={2}
              className="field !min-h-0 !border-0 !bg-transparent !p-1.5 !shadow-none"
              placeholder="What needs doing?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { if (!title.trim()) setAdding(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
                if (e.key === 'Escape') { setTitle(''); setAdding(false); }
              }}
            />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => { setTitle(''); setAdding(false); }}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={submit}>Add</Button>
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-3 grid h-24 place-items-center rounded-2xl border border-dashed border-[var(--hairline)] text-[13px]">
            {canEdit ? 'Drop tasks here' : 'Nothing here'}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DraggableTask({ task, canEdit, onOpen }: { task: Task; canEdit: boolean; onOpen: () => void }) {
  const drag = useDraggable({ id: task.id, disabled: !canEdit });
  const drop = useDroppable({ id: `task:${task.id}`, disabled: !canEdit });
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      ref={(n: HTMLDivElement | null) => { drag.setNodeRef(n); drop.setNodeRef(n); }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={onOpen}
      className={clsx('relative touch-manipulation', drag.isDragging && 'opacity-30')}
    >
      {drop.isOver && !drag.isDragging && <div className="absolute -top-1.5 left-2 right-2 h-1 rounded-full bg-iris" />}
      <TaskCard task={task} />
    </motion.div>
  );
}

function TaskCard({ task, overlay }: { task: Task; overlay?: boolean }) {
  const pr = priorityMeta(task.priority);
  const today = localISO();
  const overdue = task.due_on && task.due_on < today && task.status !== 'done';
  return (
    <motion.div
      initial={false}
      animate={overlay ? { rotate: 3, scale: 1.04 } : { rotate: 0, scale: 1 }}
      className={clsx('glass-strong relative cursor-pointer overflow-hidden rounded-[18px] p-3.5 pl-4', overlay && 'shadow-2xl')}
    >
      <span className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: pr.color }} />
      <div className={clsx('text-[14px] font-bold leading-snug', task.status === 'done' && 'text-2 line-through decoration-2')}>{task.title}</div>
      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => <span key={l} className="fill-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold">{l}</span>)}
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2 text-[12px]">
        {task.assignee_id ? <AssigneeAvatar id={task.assignee_id} /> : <span className="text-3">Unassigned</span>}
        <span className="flex-1" />
        {!task.client_visible && <EyeOff className="text-3 size-3.5" aria-label="Hidden from the client" />}
        {(task.priority === 'urgent' || task.priority === 'high') && <Flag className="size-3.5" style={{ color: pr.color }} />}
        {task.due_on && <span className={clsx('font-semibold', overdue ? 'text-bad' : 'text-2')}>{dayShort(task.due_on)}</span>}
      </div>
    </motion.div>
  );
}

function AssigneeAvatar({ id }: { id: string }) {
  const qc = useQueryClient();
  const projects = qc.getQueryData<ProjectWithTeam[]>(['projects']);
  const who = projects?.flatMap((p) => p.members).find((m) => m.profile_id === id)?.profile;
  return (
    <span className="flex items-center gap-1.5">
      <AgentAvatar who={who ?? { id }} size={22} />
      <span className="text-2 max-w-[110px] truncate font-semibold">{who?.full_name.split(' ')[0]}</span>
    </span>
  );
}

/* ================================================================== table */
function TaskTable({
  byStatus, canEdit, onOpen, onPatch, project, sprints,
}: {
  byStatus: Map<TaskStatus, Task[]>; canEdit: boolean; onOpen: (t: Task) => void; onPatch: (t: Task, c: Partial<Omit<Task, 'id' | 'project_id'>>) => void;
  project: ProjectWithTeam; sprints: { id: number; name: string }[];
}) {
  const team = teamOf(project);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  return (
    <div className="scroll-x -mx-4 px-4 pb-44 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="min-w-[920px] space-y-5">
        {TASK_STATUSES.map((s) => {
          const list = byStatus.get(s.key) ?? [];
          const shut = collapsed.includes(s.key);
          return (
            <section key={s.key} className="glass overflow-visible rounded-[22px]">
              <button type="button" onClick={() => setCollapsed((c) => (shut ? c.filter((x) => x !== s.key) : [...c, s.key]))}
                className="flex w-full items-center gap-2 px-4 py-3 text-left">
                <ChevronDown className={clsx('size-4 transition-transform', shut && '-rotate-90')} style={{ color: s.color }} />
                <h3 className="text-[15px] font-extrabold" style={{ color: s.color }}>{s.label}</h3>
                <span className="text-3 text-[13px] font-semibold">{list.length} tasks</span>
              </button>
              {!shut && (
                <div className="border-l-4 pb-1" style={{ borderColor: s.color }}>
                  <div className="text-3 hairline grid grid-cols-[minmax(240px,1fr)_170px_140px_120px_150px_150px] border-y px-4 py-2 text-[11px] font-bold uppercase tracking-wider">
                    <span>Task</span><span>Owner</span><span>Status</span><span>Priority</span><span>Due</span><span>Sprint</span>
                  </div>
                  {list.map((t) => (
                    <div key={t.id} className="hairline grid grid-cols-[minmax(240px,1fr)_170px_140px_120px_150px_150px] items-center border-b px-4 py-1.5 text-[13px] last:border-b-0 hover:bg-[var(--fill)]">
                      <button type="button" onClick={() => onOpen(t)} className="flex min-w-0 items-center gap-2 py-1.5 text-left font-semibold">
                        <LayoutList className="text-3 size-3.5 shrink-0" />
                        <span className="truncate">{t.title}</span>
                        {!t.client_visible && <EyeOff className="text-3 size-3.5 shrink-0" />}
                      </button>
                      <div className="pr-2">
                        {canEdit ? (
                          <Picker value={t.assignee_id ?? ''} onChange={(v) => onPatch(t, { assignee_id: v || null })} className="[&_.field]:h-8 [&_.field]:py-1 [&_.field]:text-[12px]"
                            options={[{ value: '', label: 'Nobody' }, ...team.map((m) => ({ value: m.profile_id, label: m.profile!.full_name, icon: <AgentAvatar who={m.profile} size={18} /> }))]} />
                        ) : <AssigneeAvatar id={t.assignee_id ?? ''} />}
                      </div>
                      <div className="pr-2"><ColorCell value={t.status} options={TASK_STATUSES} disabled={!canEdit} onChange={(v) => onPatch(t, { status: v as TaskStatus, position: Date.now() / 1000 })} /></div>
                      <div className="pr-2"><ColorCell value={t.priority} options={PRIORITIES} disabled={!canEdit} onChange={(v) => onPatch(t, { priority: v })} /></div>
                      <div className="pr-2">
                        {canEdit
                          ? <input type="date" value={t.due_on ?? ''} onChange={(e) => onPatch(t, { due_on: e.target.value || null })} className="field h-8 !py-1 text-[12px]" />
                          : <span className="text-2">{t.due_on ? dayShort(t.due_on) : '—'}</span>}
                      </div>
                      <div className="text-2 truncate text-[12px]">{sprints.find((x) => x.id === t.sprint_id)?.name ?? 'Backlog'}</div>
                    </div>
                  ))}
                  {list.length === 0 && <div className="text-3 px-4 py-3 text-[13px]">Nothing here.</div>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** The Monday-style status cell: the whole cell is the colour; click to change it. */
function ColorCell({ value, options, onChange, disabled }: {
  value: string; options: readonly { key: string; label: string; color: string }[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const cur = options.find((o) => o.key === value) ?? options[0];
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className="h-8 w-full rounded-lg text-[12px] font-bold text-white transition-[filter] enabled:hover:brightness-110"
        style={{ background: cur.color }}>
        {cur.label}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }}
            className="glass-strong absolute left-0 z-40 mt-1.5 w-[170px] space-y-1 rounded-2xl p-1.5">
            {options.map((o) => (
              <button key={o.key} type="button" onClick={() => { setOpen(false); if (o.key !== value) onChange(o.key); }}
                className="h-8 w-full rounded-lg text-[12px] font-bold text-white hover:brightness-110" style={{ background: o.color }}>
                {o.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
