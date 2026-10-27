import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Diamond, Eye, EyeOff, Package, Play, RotateCcw, Send, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/app/auth';
import {
  PRIORITIES, TASK_STATUSES, clientTaskStatus, isKeyMoment, planDay, priorityMeta, sideMeta, statusMeta, teamOf, useProjectRefresh,
  useTaskComments, type ProjectWithTeam, type TaskSide,
} from '@/data/projects';
import { must, supabase } from '@/lib/supabase';
import type { Sprint, Task, TaskStatus } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Input, Picker, Pill, Segmented, Sheet, Switch, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { ago, day, localISO } from '@/lib/format';
import { format, parseISO } from 'date-fns';
import { usePeopleMap } from './bits';

interface Form {
  title: string; description: string; status: TaskStatus; priority: string; assignee_id: string; sprint_id: string;
  due_on: string; labels: string; client_visible: boolean; side: TaskSide; owner_label: string; deliverable: string;
}

/** "Mon 26 Oct · Day 1 · Phase 1 · Setup" */
function whenLine(t: { due_on: string | null; sprint_id: number | null }, project: ProjectWithTeam, sprints: Sprint[]) {
  if (!t.due_on) return null;
  const n = planDay(project.starts_on, t.due_on);
  return [format(parseISO(t.due_on), 'EEE d MMM'), n ? `Day ${n}` : null, sprints.find((s) => s.id === t.sprint_id)?.name].filter(Boolean).join(' · ');
}

export type TaskDraft = { new: true; status?: TaskStatus; sprint_id?: number | null; due_on?: string | null };

export function TaskSheet({
  task, project, sprints, canEdit, onClose,
}: { task: Task | TaskDraft | null; project: ProjectWithTeam; sprints: Sprint[]; canEdit: boolean; onClose: () => void }) {
  const isNew = !!task && 'new' in task;
  const t = task && !('new' in task) ? task : null;
  const [form, setForm] = useState<Form | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const qc = useQueryClient();
  const refresh = useProjectRefresh();
  const toast = useToast();
  const { profile } = useAuth();

  const k = t ? `t${t.id}` : isNew ? 'new' : null;
  if (k !== key) {
    setKey(k);
    setConfirm(false);
    const draft = isNew ? (task as TaskDraft) : null;
    const active = sprints.find((s) => s.status === 'active');
    setForm(k ? {
      title: t?.title ?? '', description: t?.description ?? '', status: (t?.status ?? draft?.status ?? 'todo') as TaskStatus,
      priority: t?.priority ?? 'medium', assignee_id: t?.assignee_id ?? (profile?.role === 'production' || profile?.role === 'sales' ? profile.id : ''),
      sprint_id: String(t ? t.sprint_id ?? '' : draft?.sprint_id !== undefined ? draft.sprint_id ?? '' : active?.id ?? ''),
      due_on: t?.due_on ?? draft?.due_on ?? '', labels: (t?.labels ?? []).join(', '), client_visible: t?.client_visible ?? true,
      side: (t?.side ?? 'team') as TaskSide, owner_label: t?.owner_label ?? '', deliverable: t?.deliverable ?? '',
    } : null);
  }
  const set = <K extends keyof Form>(f: K, v: Form[K]) => setForm((x) => (x ? { ...x, [f]: v } : x));
  const team = teamOf(project);

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) { toast({ title: 'Give the task a title', tone: 'warning' }); return; }
    setBusy(true);
    const row = {
      title: form.title.trim(), description: form.description.trim() || null, status: form.status, priority: form.priority,
      assignee_id: form.assignee_id || null, sprint_id: form.sprint_id ? Number(form.sprint_id) : null, due_on: form.due_on || null,
      labels: form.labels.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8), client_visible: form.client_visible,
      side: form.side, owner_label: form.owner_label.trim() || null, deliverable: form.deliverable.trim() || null,
    };
    try {
      if (t) must(await supabase.from('tasks').update(row).eq('id', t.id).select());
      else must(await supabase.from('tasks').insert({ ...row, project_id: project.id }).select());
      if (row.status === 'done' && t?.status !== 'done') celebrate('small');
      toast({ title: t ? 'Task saved' : 'Task added', tone: 'success' });
      refresh(project.id);
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!t) return;
    setBusy(true);
    const { error } = await supabase.from('tasks').delete().eq('id', t.id);
    setBusy(false);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    toast({ title: 'Task deleted', tone: 'success' });
    qc.setQueryData<Task[]>(['p', project.id, 'tasks'], (xs) => xs?.filter((x) => x.id !== t.id));
    refresh(project.id);
    onClose();
  };

  if (!form) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  // The client's view: what it is, who does it, what it delivers. Their own tasks they can tick off.
  if (!canEdit && t) {
    return (
      <Sheet open onClose={onClose} title={t.title} width={620}>
        <TaskFacts task={t} project={project} sprints={sprints} />
        {t.side !== 'team' && <ClientActions task={t} project={project} onDone={onClose} />}
        <div className="mt-6"><Comments taskId={t.id} /></div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={!!task}
      onClose={onClose}
      width={680}
      title={isNew ? 'New task' : 'Task'}
      footer={
        <>
          {t && (confirm
            ? <Button variant="danger" loading={busy} onClick={remove} icon={<Trash2 className="size-4" />}>Really delete</Button>
            : <Button variant="ghost" className="mr-auto text-bad" onClick={() => setConfirm(true)} icon={<Trash2 className="size-4" />}>Delete</Button>)}
          <Button variant="glass" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>{isNew ? 'Add task' : 'Save'}</Button>
        </>
      }
    >
      {t && whenLine(t, project, sprints) && (
        <div className="text-2 mb-4 flex items-center gap-2 text-[13px] font-semibold">
          {isKeyMoment(t) ? <Diamond className="size-4 text-iris" /> : <CalendarDays className="size-4" />}{whenLine(t, project, sprints)}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Title" autoFocus={isNew} value={form.title} onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Design the onboarding screens" onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
        <Textarea className="sm:col-span-2" label="What it involves" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="The steps, in a sentence or two" />
        <Input className="sm:col-span-2" label="Deliverable" hint="what shows it's done" value={form.deliverable} onChange={(e) => set('deliverable', e.target.value)} placeholder="e.g. Store copy pack" />
        <div className="sm:col-span-2">
          <div className="label">Who does it</div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented value={form.side} onChange={(v) => set('side', v)} options={(['team', 'client', 'both'] as TaskSide[]).map((k) => ({ value: k, label: sideMeta(k, project.client_name).label }))} />
            <Input className="min-w-[180px] flex-1" aria-label="Owner, as the plan says it" placeholder="Owner as the plan says it, e.g. Nuuke, ambassadors"
              value={form.owner_label} onChange={(e) => set('owner_label', e.target.value)} />
          </div>
          {form.side !== 'team' && <p className="text-3 mt-1.5 text-[12px]">The client is reminded about this one too, and can mark it started or done.</p>}
        </div>
        <Picker label="Status" value={form.status} onChange={(v) => set('status', v)}
          options={TASK_STATUSES.map((s) => ({ value: s.key, label: s.label, dot: s.color }))} />
        <Picker label="Priority" value={form.priority} onChange={(v) => set('priority', v)}
          options={PRIORITIES.map((p) => ({ value: p.key, label: p.label, dot: p.color }))} />
        <Picker label="Who's on it" value={form.assignee_id} onChange={(v) => set('assignee_id', v)}
          options={[{ value: '', label: 'Nobody yet' }, ...team.map((m) => ({
            value: m.profile_id, label: m.profile!.full_name, hint: m.profile!.title ?? m.profile!.department ?? undefined,
            icon: <AgentAvatar who={m.profile} size={22} />,
          }))]} />
        <Picker label="Sprint" value={form.sprint_id} onChange={(v) => set('sprint_id', v)}
          options={[{ value: '', label: 'Backlog (no sprint)' }, ...sprints.filter((s) => s.status !== 'done' || String(s.id) === form.sprint_id)
            .map((s) => ({ value: String(s.id), label: s.name, hint: s.status === 'active' ? 'Current sprint' : s.status === 'done' ? 'Finished' : 'Planned' }))]} />
        <Input label="Due" type="date" value={form.due_on} onChange={(e) => set('due_on', e.target.value)} />
        <Input label="Labels" hint="comma separated" value={form.labels} onChange={(e) => set('labels', e.target.value)} placeholder="design, homepage" />
        <div className="fill flex items-center justify-between gap-4 rounded-[18px] p-3.5 sm:col-span-2">
          <div className="flex items-center gap-2.5 text-[14px] font-semibold">
            {form.client_visible ? <Eye className="size-4 text-ok" /> : <EyeOff className="text-3 size-4" />}
            <span>{form.client_visible ? 'The client can see this task' : 'Internal — hidden from the client'}</span>
          </div>
          <Switch checked={form.client_visible} onChange={(v) => set('client_visible', v)} />
        </div>
      </div>
      {t && <div className="mt-6"><Comments taskId={t.id} /></div>}
      {t && (
        <p className="text-3 mt-4 text-[12px]">
          Created {ago(t.created_at)}{t.completed_at && <> · finished {ago(t.completed_at)}</>} · priority {priorityMeta(t.priority).label.toLowerCase()}
        </p>
      )}
    </Sheet>
  );
}

/** The database allows comments up to this long (a couple of hours of meeting transcript). */
const MAX_COMMENT = 100_000;

/** A long comment (a pasted transcript) shows its start, with the rest one tap away. */
function LongText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 700;
  return (
    <>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px]">{long && !open ? `${text.slice(0, 600).trimEnd()}…` : text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-[12px] font-semibold text-iris hover:underline">
          {open ? 'Show less' : `Show all (${text.length.toLocaleString()} characters)`}
        </button>
      )}
    </>
  );
}

function Comments({ taskId }: { taskId: number }) {
  const comments = useTaskComments(taskId);
  const people = usePeopleMap();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    if (body.trim().length > MAX_COMMENT) {
      toast({ title: 'That comment is too long', body: `Keep it under ${MAX_COMMENT.toLocaleString()} characters, or attach it as a file.`, tone: 'danger' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('task_comments').insert({ task_id: taskId, body: body.trim(), author_id: profile!.id });
    setBusy(false);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    setBody('');
    void qc.invalidateQueries({ queryKey: ['task-comments', taskId] });
  };

  return (
    <section>
      <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wider text-iris">Comments</h3>
      <div className="space-y-3">
        {(comments.data ?? []).map((c) => {
          const who = people.get(c.author_id);
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
              <AgentAvatar who={who ?? { id: c.author_id }} size={32} />
              <div className="fill min-w-0 flex-1 rounded-2xl rounded-tl-md px-3.5 py-2.5">
                <div className="flex items-baseline gap-2 text-[12px]">
                  <b className="text-[13px]">{who?.full_name ?? 'Someone'}</b>
                  {who?.role === 'client' && <Pill tone="warn" className="!h-5 !text-[10px]">Client</Pill>}
                  <span className="text-3">{ago(c.created_at)}</span>
                </div>
                <LongText text={c.body} />
              </div>
            </motion.div>
          );
        })}
        {comments.data?.length === 0 && <p className="text-3 text-[13px]">No comments yet.</p>}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <textarea
          className="field min-h-[44px] flex-1"
          rows={1}
          value={body}
          placeholder="Write a comment…"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        <Button variant="primary" loading={busy} disabled={!body.trim()} onClick={send} icon={<Send className="size-4" />} className="h-11">Send</Button>
      </div>
    </section>
  );
}

/** The task's facts, laid out the same way for the team and the client. */
export function TaskFacts({ task, project, sprints }: { task: Task; project: ProjectWithTeam; sprints: Sprint[] }) {
  const st = statusMeta(task.status);
  const side = sideMeta(task.side, project.client_name);
  const when = whenLine(task, project, sprints);
  const late = task.due_on && task.due_on < localISO() && task.status !== 'done';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Pill tone="neutral"><span style={{ color: st.color }}>{st.label}</span></Pill>
        {isKeyMoment(task) && <Pill tone="iris" solid>{task.labels.find((l) => /launch/i.test(l)) ? 'Launch' : 'Gate'}</Pill>}
        {late && <Pill tone="bad" solid>Late</Pill>}
        <Pill tone="neutral"><span style={{ color: side.color }}>{task.owner_label || side.label}</span></Pill>
      </div>
      {when && <div className="flex items-center gap-2 text-[15px] font-bold"><CalendarDays className="size-4 text-iris" />{when}</div>}
      {task.description && (
        <section>
          <div className="text-3 mb-1 text-[11px] font-bold uppercase tracking-[0.14em]">What it involves</div>
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{task.description}</p>
        </section>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {task.deliverable && (
          <div className="fill flex items-start gap-3 rounded-[18px] p-3.5">
            <Package className="mt-0.5 size-4 shrink-0 text-iris" />
            <div><div className="text-3 text-[11px] font-bold uppercase tracking-wider">Deliverable</div><div className="text-[14px] font-semibold">{task.deliverable}</div></div>
          </div>
        )}
        <div className="fill flex items-start gap-3 rounded-[18px] p-3.5">
          <Users className="mt-0.5 size-4 shrink-0" style={{ color: side.color }} />
          <div><div className="text-3 text-[11px] font-bold uppercase tracking-wider">Who does it</div>
            <div className="text-[14px] font-semibold">{task.owner_label || side.label}{task.side === 'both' && !task.owner_label ? ' (both sides)' : ''}</div></div>
        </div>
      </div>
      {task.due_on && <p className="text-3 text-[12px]">Due {day(task.due_on)}{task.completed_at && <> · finished {ago(task.completed_at)}</>}</p>}
    </div>
  );
}

function ClientActions({ task, project, onDone }: { task: Task; project: ProjectWithTeam; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useProjectRefresh();
  const toast = useToast();
  const go = async (status: 'todo' | 'in_progress' | 'done') => {
    setBusy(status);
    try {
      await clientTaskStatus(task.id, status);
      if (status === 'done') celebrate('small');
      toast({ title: status === 'done' ? 'Marked done. The team has been told.' : status === 'in_progress' ? 'Marked started' : 'Reopened', tone: 'success' });
      refresh(project.id);
      onDone();
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(null); }
  };
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 rounded-[20px] bg-[#FF9A6B]/10 p-3.5 ring-1 ring-[#FF9A6B]/30">
      <span className="mr-auto text-[13px] font-semibold">{task.side === 'client' ? 'This one is yours.' : 'This one is shared with the team.'}</span>
      {task.status === 'done'
        ? <Button size="sm" variant="glass" icon={<RotateCcw className="size-4" />} loading={busy === 'todo'} onClick={() => void go('todo')}>Reopen</Button>
        : <>
          {task.status !== 'in_progress' && <Button size="sm" variant="glass" icon={<Play className="size-4" />} loading={busy === 'in_progress'} onClick={() => void go('in_progress')}>Started</Button>}
          <Button size="sm" variant="primary" icon={<Check className="size-4" />} loading={busy === 'done'} onClick={() => void go('done')}>Mark done</Button>
        </>}
    </div>
  );
}
