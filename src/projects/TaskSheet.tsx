import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/app/auth';
import {
  PRIORITIES, TASK_STATUSES, priorityMeta, statusMeta, teamOf, useProjectRefresh, useTaskComments, type ProjectWithTeam,
} from '@/data/projects';
import { must, supabase } from '@/lib/supabase';
import type { Sprint, Task, TaskStatus } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Input, Picker, Pill, Sheet, Switch, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { ago, day } from '@/lib/format';
import { usePeopleMap } from './bits';

interface Form {
  title: string; description: string; status: TaskStatus; priority: string; assignee_id: string; sprint_id: string;
  due_on: string; labels: string; client_visible: boolean;
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
      priority: t?.priority ?? 'medium', assignee_id: t?.assignee_id ?? (profile?.role === 'production' ? profile.id : ''),
      sprint_id: String(t ? t.sprint_id ?? '' : draft?.sprint_id !== undefined ? draft.sprint_id ?? '' : active?.id ?? ''),
      due_on: t?.due_on ?? draft?.due_on ?? '', labels: (t?.labels ?? []).join(', '), client_visible: t?.client_visible ?? true,
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

  // The client's read-only view.
  if (!canEdit && t) {
    const st = statusMeta(t.status);
    return (
      <Sheet open onClose={onClose} title={t.title} width={620}>
        <div className="mb-4 flex flex-wrap gap-2">
          <Pill tone="neutral"><span style={{ color: st.color }}>{st.label}</span></Pill>
          {t.due_on && <Pill tone="info">Due {day(t.due_on)}</Pill>}
          {t.sprint_id && <Pill tone="iris">{sprints.find((s) => s.id === t.sprint_id)?.name ?? 'Sprint'}</Pill>}
        </div>
        {t.description && <p className="text-2 mb-5 whitespace-pre-wrap text-[14px]">{t.description}</p>}
        <Comments taskId={t.id} />
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Title" autoFocus={isNew} value={form.title} onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Design the onboarding screens" onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
        <Textarea className="sm:col-span-2" label="Details" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What does done look like?" />
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
                <p className="mt-0.5 whitespace-pre-wrap text-[14px]">{c.body}</p>
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
