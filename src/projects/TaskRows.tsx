import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Check, Flag } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { priorityMeta, statusMeta, useProjectRefresh, type ProjectWithTeam, type TaskLite } from '@/data/projects';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { dayShort, localISO } from '@/lib/format';
import { ProjectMark } from './bits';

/** A checklist of tasks from any number of projects. Tick to finish; tap to open. */
export function TaskRows({ tasks, projects, empty = 'Nothing here.' }: { tasks: TaskLite[]; projects: Map<number, ProjectWithTeam>; empty?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const refresh = useProjectRefresh();
  const toast = useToast();
  const today = localISO();

  const toggle = async (t: TaskLite) => {
    const status = t.status === 'done' ? 'todo' : 'done';
    qc.setQueryData<TaskLite[]>(['task-index'], (xs) => xs?.map((x) => (x.id === t.id ? { ...x, status, completed_at: status === 'done' ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.from('tasks').update({ status }).eq('id', t.id);
    if (error) { toast({ title: error.message, tone: 'danger' }); }
    else if (status === 'done') { celebrate('small'); toast({ title: 'Nice — done ✓', body: t.title, tone: 'success', duration: 2500 }); }
    refresh(t.project_id);
  };

  if (!tasks.length) return <p className="text-3 py-6 text-center text-[13px]">{empty}</p>;
  return (
    <div className="space-y-1">
      <AnimatePresence initial={false}>
        {tasks.map((t) => {
          const p = projects.get(t.project_id);
          const done = t.status === 'done';
          const pr = priorityMeta(t.priority);
          const overdue = !done && t.due_on && t.due_on < today;
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
              className="group flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-[var(--fill)]">
              <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={() => void toggle(t)} aria-label={done ? 'Mark not done' : 'Mark done'}
                className={clsx('grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
                  done ? 'border-ok bg-ok text-white' : 'border-[var(--text-3)] hover:border-ok')}>
                {done && <Check className="size-3.5" strokeWidth={3} />}
              </motion.button>
              <button type="button" onClick={() => navigate(`/projects/${t.project_id}/board?task=${t.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className={clsx('block truncate text-[14px] font-semibold', done && 'text-3 line-through')}>{t.title}</span>
                  <span className="text-3 flex items-center gap-1.5 text-[12px]">
                    {p && <ProjectMark project={p} size={14} />}
                    <span className="truncate">{p?.name}</span>
                    <span>·</span>
                    <span style={{ color: statusMeta(t.status).color }} className="font-semibold">{statusMeta(t.status).label}</span>
                  </span>
                </span>
                {(t.priority === 'urgent' || t.priority === 'high') && !done && <Flag className="size-3.5 shrink-0" style={{ color: pr.color }} />}
                {t.due_on && (
                  <span className={clsx('shrink-0 text-[12px] font-bold', overdue ? 'text-bad' : t.due_on === today ? 'text-warn' : 'text-2')}>
                    {t.due_on === today ? 'Today' : dayShort(t.due_on)}
                  </span>
                )}
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
