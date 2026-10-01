import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { CheckCircle2, Pencil, Play, Plus, Rocket, Target } from 'lucide-react';
import {
  progressOf, statusMeta, useProjectRefresh, useSprints, useTasks, type ProjectWithTeam,
} from '@/data/projects';
import { must, rpc, supabase } from '@/lib/supabase';
import type { Sprint, Task } from '@/lib/types';
import { Button, Empty, Input, Panel, PanelHeader, Picker, Pill, ProgressBar, Sheet, Skeleton, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { addDaysISO, dayShort, localISO } from '@/lib/format';

export function Sprints({ project, canEdit }: { project: ProjectWithTeam; canEdit: boolean }) {
  const sprints = useSprints(project.id);
  const tasks = useTasks(project.id);
  const [editing, setEditing] = useState<Sprint | 'new' | null>(null);
  const [finishing, setFinishing] = useState<Sprint | null>(null);
  const refresh = useProjectRefresh();
  const toast = useToast();
  const navigate = useNavigate();

  const list = sprints.data ?? [];
  const active = list.find((s) => s.status === 'active');
  const planned = list.filter((s) => s.status === 'planned');
  const done = list.filter((s) => s.status === 'done').reverse();
  const tasksIn = (id: number) => (tasks.data ?? []).filter((t) => t.sprint_id === id);
  const openBoard = (s: Sprint) => navigate(`/projects/${project.id}/board?sprint=${s.id}`);

  const start = async (s: Sprint) => {
    try {
      await rpc('start_sprint', { p_sprint: s.id });
      toast({ title: `${s.name} is underway 🚀`, tone: 'success' });
      refresh(project.id);
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); }
  };

  if (sprints.isLoading) return <Skeleton className="h-80 rounded-[26px]" />;

  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Plan a sprint</Button>
        </div>
      )}

      {!list.length && (
        <Panel><Empty title="No sprints yet" body={canEdit ? 'Plan the first sprint: a short stretch (usually two weeks) with a clear goal.' : 'The team will plan the work in sprints — they will show up here.'}
          art={<Rocket className="size-10 text-iris" />} /></Panel>
      )}

      {active && (
        <ActiveSprint sprint={active} tasks={tasksIn(active.id)} canEdit={canEdit} onEdit={() => setEditing(active)}
          onFinish={() => setFinishing(active)} onBoard={() => openBoard(active)} />
      )}

      {planned.length > 0 && (
        <Panel>
          <PanelHeader title="Coming up" sub="Planned sprints, in order." />
          <div className="space-y-2">
            {planned.map((s) => (
              <SprintRow key={s.id} sprint={s} tasks={tasksIn(s.id)} onOpen={() => openBoard(s)}
                actions={canEdit && (
                  <>
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(s)}>Edit</Button>
                    {!active && <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} onClick={() => void start(s)}>Start</Button>}
                  </>
                )} />
            ))}
          </div>
        </Panel>
      )}

      {done.length > 0 && (
        <Panel>
          <PanelHeader title="Finished" sub="What each sprint delivered." />
          <div className="space-y-2">
            {done.map((s) => <SprintRow key={s.id} sprint={s} tasks={tasksIn(s.id)} onOpen={() => openBoard(s)} />)}
          </div>
        </Panel>
      )}

      <SprintSheet sprint={editing} project={project} sprints={list} onClose={() => setEditing(null)} />
      <FinishSheet sprint={finishing} sprints={list} tasks={finishing ? tasksIn(finishing.id) : []} projectId={project.id} onClose={() => setFinishing(null)} />
    </div>
  );
}

function ActiveSprint({ sprint, tasks, canEdit, onEdit, onFinish, onBoard }: {
  sprint: Sprint; tasks: Task[]; canEdit: boolean; onEdit: () => void; onFinish: () => void; onBoard: () => void;
}) {
  const prog = progressOf(tasks);
  const today = localISO();
  const total = differenceInCalendarDays(parseISO(sprint.ends_on), parseISO(sprint.starts_on)) + 1;
  const left = Math.max(0, differenceInCalendarDays(parseISO(sprint.ends_on), parseISO(today)));
  const counts = ['todo', 'in_progress', 'review', 'done'].map((k) => ({ k, n: tasks.filter((t) => t.status === k).length }));
  return (
    <Panel strong className="relative overflow-hidden !p-6">
      <div className="absolute -right-16 -top-20 size-64 rounded-full bg-iris/25 blur-3xl" />
      <div className="relative flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Pill tone="iris" solid>Current sprint</Pill>
            <span className="text-2 text-[13px] font-semibold">{dayShort(sprint.starts_on)} – {dayShort(sprint.ends_on)}</span>
          </div>
          <h2 className="mt-2 text-[26px] font-extrabold">{sprint.name}</h2>
          {sprint.goal && <p className="text-2 mt-1 flex items-start gap-2 text-[14px]"><Target className="mt-0.5 size-4 shrink-0 text-iris" />{sprint.goal}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="glass" onClick={onBoard}>Open board</Button>
          {canEdit && <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={onEdit}>Edit</Button>}
          {canEdit && <Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={onFinish}>Finish sprint</Button>}
        </div>
      </div>

      <div className="relative mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <div className="flex items-end gap-6">
            <div>
              <div className="tabular font-display text-[44px] font-black leading-none">{Math.round(prog.ratio * 100)}%</div>
              <div className="text-2 mt-1 text-[13px] font-semibold">{prog.done} of {prog.total} tasks done</div>
            </div>
            <div>
              <div className={clsx('tabular font-display text-[44px] font-black leading-none', left <= 2 && prog.ratio < 1 && 'text-warn')}>{left}</div>
              <div className="text-2 mt-1 text-[13px] font-semibold">day{left === 1 ? '' : 's'} left of {total}</div>
            </div>
          </div>
          <ProgressBar className="mt-4" value={prog.done} max={Math.max(1, prog.total)} height={12} />
          <div className="mt-4 grid grid-cols-4 gap-2">
            {counts.map(({ k, n }) => (
              <div key={k} className="fill rounded-2xl p-2.5 text-center">
                <div className="tabular text-[20px] font-extrabold">{n}</div>
                <div className="text-[11px] font-bold" style={{ color: statusMeta(k).color }}>{statusMeta(k).label}</div>
              </div>
            ))}
          </div>
        </div>
        <Burndown sprint={sprint} tasks={tasks} />
      </div>
    </Panel>
  );
}

function SprintRow({ sprint, tasks, onOpen, actions }: { sprint: Sprint; tasks: Task[]; onOpen: () => void; actions?: React.ReactNode }) {
  const prog = progressOf(tasks);
  return (
    <div className="fill flex flex-wrap items-center gap-4 rounded-[20px] p-3.5">
      <button type="button" onClick={onOpen} className="min-w-[180px] flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-extrabold">{sprint.name}</span>
          {sprint.status === 'done' && <Pill tone="good">Done</Pill>}
        </div>
        <div className="text-3 text-[12px]">{dayShort(sprint.starts_on)} – {dayShort(sprint.ends_on)}{sprint.goal && ` · ${sprint.goal}`}</div>
      </button>
      <div className="w-40">
        <div className="text-2 mb-1 text-right text-[12px] font-semibold">{prog.done}/{prog.total} done</div>
        <ProgressBar value={prog.done} max={Math.max(1, prog.total)} height={6} glow={false} />
      </div>
      {actions && <div className="flex gap-1.5">{actions}</div>}
    </div>
  );
}

/**
 * Tasks left each day against the straight line to zero. A single measure on one
 * axis: the dashed line is the pace that finishes on time.
 */
function Burndown({ sprint, tasks }: { sprint: Sprint; tasks: Task[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const data = useMemo(() => {
    const days = differenceInCalendarDays(parseISO(sprint.ends_on), parseISO(sprint.starts_on)) + 1;
    const today = localISO();
    const total = tasks.length;
    return Array.from({ length: days }, (_, i) => {
      const d = addDaysISO(sprint.starts_on, i);
      const doneBy = tasks.filter((t) => t.completed_at && localISO(new Date(t.completed_at)) <= d).length;
      return { d, left: d <= today ? total - doneBy : null, ideal: total - (total * i) / Math.max(1, days - 1) };
    });
  }, [sprint, tasks]);

  const W = 520, H = 200, L = 30, R = 12, T = 12, B = 26;
  const max = Math.max(1, tasks.length);
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, data.length - 1);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const actual = data.filter((p) => p.left !== null);
  const path = actual.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.left!).toFixed(1)}`).join(' ');
  const ideal = `M${x(0)},${y(max)} L${x(data.length - 1)},${y(0)}`;
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const h = hover !== null ? data[hover] : null;

  const onMove = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - L) / (W - L - R)) * (data.length - 1)))));
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[12px] font-semibold">
        <span className="text-[13px] font-bold">Burndown</span>
        <span className="text-2 flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--viz-1)]" />Tasks left</span>
        <span className="text-2 flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-[var(--text-3)]" />On-time pace</span>
      </div>
      <div ref={box} className="relative" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Burndown for ${sprint.name}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)">{t}</text>
            </g>
          ))}
          <text x={L} y={H - 6} fontSize="11" fill="var(--text-3)">{dayShort(sprint.starts_on)}</text>
          <text x={W - R} y={H - 6} fontSize="11" fill="var(--text-3)" textAnchor="end">{dayShort(sprint.ends_on)}</text>
          <path d={ideal} stroke="var(--text-3)" strokeWidth="2" strokeDasharray="5 5" fill="none" />
          {actual.length > 0 && (
            <>
              <path d={`${path} L${x(actual.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--viz-wash)" />
              <motion.path d={path} stroke="var(--viz-1)" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }} />
              <circle cx={x(actual.length - 1)} cy={y(actual.at(-1)!.left!)} r="4.5" fill="var(--viz-1)" stroke="var(--canvas)" strokeWidth="2" />
            </>
          )}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--text-3)" strokeWidth="1" />
              {h?.left !== null && h?.left !== undefined && <circle cx={x(hover)} cy={y(h.left)} r="4.5" fill="var(--viz-1)" stroke="var(--canvas)" strokeWidth="2" />}
            </g>
          )}
        </svg>
        {h && (
          <div className="glass-strong pointer-events-none absolute top-0 z-10 rounded-xl px-3 py-2 text-[12px]"
            style={{ left: `${(x(hover!) / W) * 100}%`, transform: `translateX(${hover! > data.length / 2 ? '-105%' : '5%'})` }}>
            <div className="font-bold">{dayShort(h.d)}</div>
            <div className="tabular">{h.left === null ? 'Still ahead' : <><b>{h.left}</b> tasks left</>}</div>
            <div className="text-3 tabular">pace: {h.ideal.toFixed(1)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function SprintSheet({ sprint, project, sprints, onClose }: { sprint: Sprint | 'new' | null; project: ProjectWithTeam; sprints: Sprint[]; onClose: () => void }) {
  const s = sprint && sprint !== 'new' ? sprint : null;
  const [form, setForm] = useState({ name: '', goal: '', starts_on: '', ends_on: '' });
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useProjectRefresh();
  const toast = useToast();
  const k = s ? `s${s.id}` : sprint === 'new' ? 'new' : null;
  if (k !== key) {
    setKey(k);
    const last = sprints.at(-1);
    const start = last ? addDaysISO(last.ends_on, 1) > localISO() ? addDaysISO(last.ends_on, 1) : localISO() : localISO();
    setForm(s ? { name: s.name, goal: s.goal ?? '', starts_on: s.starts_on, ends_on: s.ends_on }
      : { name: `Sprint ${sprints.length + 1}`, goal: '', starts_on: start, ends_on: addDaysISO(start, 13) });
  }
  const save = async () => {
    setBusy(true);
    try {
      const row = { name: form.name.trim(), goal: form.goal.trim() || null, starts_on: form.starts_on, ends_on: form.ends_on };
      if (s) must(await supabase.from('sprints').update(row).eq('id', s.id).select());
      else must(await supabase.from('sprints').insert({ ...row, project_id: project.id }).select());
      toast({ title: s ? 'Sprint saved' : 'Sprint planned', tone: 'success' });
      refresh(project.id);
      onClose();
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!s) return;
    const { error } = await supabase.from('sprints').delete().eq('id', s.id);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    toast({ title: 'Sprint removed — its tasks are back in the backlog', tone: 'success' });
    refresh(project.id);
    onClose();
  };
  return (
    <Sheet open={!!sprint} onClose={onClose} title={s ? `Edit ${s.name}` : 'Plan a sprint'} width={520}
      footer={<>
        {s && s.status === 'planned' && <Button variant="ghost" className="mr-auto text-bad" onClick={remove}>Delete</Button>}
        <Button variant="glass" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>{s ? 'Save' : 'Plan sprint'}</Button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Textarea className="sm:col-span-2" label="Goal" rows={2} placeholder="e.g. Clickable prototype of the booking flow" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
        <Input label="Starts" type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
        <Input label="Ends" type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
      </div>
    </Sheet>
  );
}

function FinishSheet({ sprint, sprints, tasks, projectId, onClose }: { sprint: Sprint | null; sprints: Sprint[]; tasks: Task[]; projectId: number; onClose: () => void }) {
  const next = sprints.filter((s) => s.status === 'planned');
  const [to, setTo] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const refresh = useProjectRefresh();
  const toast = useToast();
  const open = tasks.filter((t) => t.status !== 'done').length;
  const finish = async () => {
    if (!sprint) return;
    setBusy(true);
    try {
      await rpc('complete_sprint', { p_sprint: sprint.id, p_move_to: to ? Number(to) : undefined });
      celebrate('big');
      toast({ title: `${sprint.name} wrapped up 🎉`, body: open ? `${open} unfinished task${open === 1 ? '' : 's'} moved on.` : 'Everything got done!', tone: 'celebrate' });
      refresh(projectId);
      onClose();
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!sprint} onClose={onClose} title={`Finish ${sprint?.name ?? ''}`} width={480}
      footer={<><Button variant="glass" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={finish}>Finish sprint</Button></>}>
      <p className="text-2 text-[14px]">
        {tasks.length - open} of {tasks.length} tasks are done.{' '}
        {open ? `Where should the ${open} unfinished task${open === 1 ? '' : 's'} go?` : 'Nothing left over — nice work.'}
      </p>
      {open > 0 && (
        <Picker className="mt-4" label="Move unfinished tasks to" value={to} onChange={setTo}
          options={[{ value: '', label: 'The backlog' }, ...next.map((s) => ({ value: String(s.id), label: s.name, hint: `${dayShort(s.starts_on)} – ${dayShort(s.ends_on)}` }))]} />
      )}
    </Sheet>
  );
}
