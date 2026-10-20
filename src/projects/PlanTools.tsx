import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { addDays, format, nextMonday, parseISO } from 'date-fns';
import { FileUp, MoveRight, Upload } from 'lucide-react';
import {
  SIDE_COLORS, importProjectPlan, shiftProjectPlan, sideMeta, useProjectRefresh, type ProjectWithTeam, type TaskSide,
} from '@/data/projects';
import type { Task } from '@/lib/types';
import { parseDate } from '@/admin/ImportWizard';
import { readWorkbook, tableOf, text, type Cell } from '@/admin/workbook';
import { Button, Input, Segmented, Sheet } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { count, localISO } from '@/lib/format';

/* ------------------------------------------------------------------ reading a plan */
type At = number | string; // a plan day (1 = the first day) or a date
interface DraftTask { at: At; title: string; details: string; owner: string; side: TaskSide; deliverable: string; phase: string | null; priority: string; labels: string[]; done: boolean }
interface DraftPlan {
  name: string; usesDays: boolean; day1: string | null; rhythm: string | null;
  phases: { name: string; goal: string; from: At; to: At }[];
  tasks: DraftTask[];
  days: { at: At; to?: At; title: string; kind: string; notes?: string }[];
}

/** Our team, the client, or both, from an owner as a plan words it ("Nuuke, ambassadors", "Evolve dev", "Both"). */
export function sideFromOwner(owner: string, clientName: string | null): TaskSide {
  const o = owner.toLowerCase().trim();
  if (/^(both|all|together|everyone)$/.test(o)) return 'both';
  const client = (clientName ?? '').toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const them = /\bclient\b/.test(o) || client.some((w) => o.includes(w));
  const us = /nuuke|agency|\bteam\b|\bus\b|ambassador|creator|host/.test(o);
  return them && us ? 'both' : them ? 'client' : 'team';
}

function fromJson(j: Record<string, unknown>, clientName: string | null): DraftPlan {
  const arr = (k: string) => (Array.isArray(j[k]) ? (j[k] as Record<string, unknown>[]) : []);
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  return {
    name: str(j.name) || 'Plan',
    usesDays: true,
    day1: str(j.day1) || null,
    rhythm: str(j.rhythm) || null,
    phases: arr('phases').map((p) => ({ name: str(p.name), goal: str(p.goal), from: Number(p.from_day ?? p.from), to: Number(p.to_day ?? p.to) })),
    tasks: arr('tasks').map((t) => ({
      at: Number(t.day), title: str(t.title), details: str(t.details ?? t.description), owner: str(t.owner),
      side: (['team', 'client', 'both'].includes(str(t.side)) ? str(t.side) : sideFromOwner(str(t.owner), clientName)) as TaskSide,
      deliverable: str(t.deliverable), phase: str(t.phase) || null, priority: str(t.priority) || 'medium',
      labels: Array.isArray(t.labels) ? (t.labels as string[]).slice(0, 8) : [], done: !!t.done,
    })).filter((t) => t.title && Number.isFinite(t.at)),
    days: arr('days').map((d) => ({ at: Number(d.day), to: d.to_day ? Number(d.to_day) : undefined, title: str(d.title), kind: str(d.kind) || 'other', notes: str(d.notes) || undefined })),
  };
}

const COLS: [keyof DraftTask | 'date' | 'day', RegExp][] = [
  ['day', /^day\b|^day ?(#|no|number)/i],
  ['date', /date|due|when/i],
  ['title', /^task|^title|^what$|^item|^name/i],
  ['details', /involves|detail|description|notes|steps/i],
  ['owner', /owner|who|responsible/i],
  ['deliverable', /deliverable|output|result/i],
  ['phase', /phase|sprint|stage|milestone/i],
];

/** A sheet of tasks: Day (1, "1 · Mon") or Date, Task, What it involves, Owner, Deliverable, Phase. */
function fromRows(header: string[], body: Cell[][], name: string, clientName: string | null): DraftPlan {
  const ix: Record<string, number> = {};
  for (const [k, re] of COLS) {
    const i = header.findIndex((h, n) => re.test(h) && !Object.values(ix).includes(n));
    if (i >= 0) ix[k] = i;
  }
  if (ix.title === undefined) throw new Error('No "Task" column found. Add columns named Day (or Date), Task, What it involves, Owner, Deliverable.');
  const usesDays = ix.day !== undefined;
  if (!usesDays && ix.date === undefined) throw new Error('Add a "Day" column (1, 2, 3…) or a "Date" column so NUUKE knows when each task is.');
  const tasks: DraftTask[] = [];
  for (const r of body) {
    const title = text(r[ix.title]);
    if (!title) continue;
    const at: At | null = usesDays ? parseInt(text(r[ix.day]), 10) : parseDate(r[ix.date], 'auto');
    if (at === null || (typeof at === 'number' && !Number.isFinite(at))) continue;
    const owner = ix.owner !== undefined ? text(r[ix.owner]) : '';
    tasks.push({
      at, title, details: ix.details !== undefined ? text(r[ix.details]) : '', owner, side: sideFromOwner(owner, clientName),
      deliverable: ix.deliverable !== undefined ? text(r[ix.deliverable]) : '', phase: ix.phase !== undefined ? text(r[ix.phase]) || null : null,
      priority: /^gate\b/i.test(title) ? 'high' : 'medium', labels: /^gate\b/i.test(title) ? ['Gate'] : [], done: false,
    });
  }
  const phases = [...new Set(tasks.map((t) => t.phase).filter(Boolean) as string[])].map((p) => {
    const ats = tasks.filter((t) => t.phase === p).map((t) => t.at).sort((a, b) => (a < b ? -1 : 1));
    return { name: p, goal: '', from: ats[0], to: ats[ats.length - 1] };
  });
  return { name, usesDays, day1: null, rhythm: null, phases, tasks, days: [] };
}

/* ------------------------------------------------------------------ import sheet */
export function ImportPlanSheet({ open, project, onClose }: { open: boolean; project: ProjectWithTeam; onClose: () => void }) {
  const [plan, setPlan] = useState<DraftPlan | null>(null);
  const [day1, setDay1] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const refresh = useProjectRefresh();
  const qc = useQueryClient();
  const toast = useToast();

  const close = () => { setPlan(null); setError(null); onClose(); };
  const load = async (file: File) => {
    setError(null);
    try {
      let p: DraftPlan;
      if (/\.json$/i.test(file.name)) {
        p = fromJson(JSON.parse(await file.text()), project.client_name);
      } else {
        const tabs = await readWorkbook(file);
        const t = tabs.map(tableOf).find((x) => x.header.some((h) => /^task|^title/i.test(h))) ?? tableOf(tabs[0]);
        p = fromRows(t.header, t.body, file.name.replace(/\.[^.]+$/, ''), project.client_name);
      }
      if (!p.tasks.length) throw new Error('No tasks found in that file.');
      setPlan(p);
      const today = localISO();
      setDay1(p.day1 ?? (project.starts_on && project.starts_on >= today ? project.starts_on : format(nextMonday(parseISO(today)), 'yyyy-MM-dd')));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const dateOf = (at: At) => (typeof at === 'number' ? format(addDays(parseISO(day1), at - 1), 'yyyy-MM-dd') : at);
  const dates = plan ? plan.tasks.map((t) => dateOf(t.at)).sort() : [];
  const bySide = (s: TaskSide) => plan?.tasks.filter((t) => t.side === s).length ?? 0;

  const run = async () => {
    if (!plan || (plan.usesDays && !day1)) return;
    setBusy(true);
    try {
      const phases = plan.phases.filter((p) => p.name).map((p) => ({ name: p.name, goal: p.goal || null, starts_on: dateOf(p.from), ends_on: dateOf(p.to) }));
      const res = await importProjectPlan(project.id, {
        start: plan.usesDays ? day1 : dates[0],
        end: [...dates, ...phases.map((p) => p.ends_on)].sort().at(-1),
        rhythm: plan.rhythm,
        phases,
        tasks: plan.tasks.map((t) => ({
          title: t.title, description: t.details || null, deliverable: t.deliverable || null, owner_label: t.owner || null, side: t.side,
          due_on: dateOf(t.at), phase: t.phase ?? phases.find((p) => dateOf(t.at) >= p.starts_on && dateOf(t.at) <= p.ends_on)?.name ?? null,
          priority: t.priority, status: t.done ? 'done' : 'todo', labels: t.labels, client_visible: true,
        })),
        events: plan.days.map((d) => ({ title: d.title, kind: d.kind, starts_on: dateOf(d.at), ends_on: d.to ? dateOf(d.to) : null, notes: d.notes ?? null, client_visible: true })),
      });
      celebrate('big');
      toast({
        title: res.tasks ? `${count(res.tasks)} tasks are on the calendar and the board` : 'Already on the calendar',
        body: [res.phases ? `${res.phases} phases` : '', res.events ? `${res.events} calendar days` : '', res.skipped ? `${res.skipped} already there, skipped` : '']
          .filter(Boolean).join(' · ') || undefined,
        tone: 'celebrate',
      });
      refresh(project.id);
      void qc.invalidateQueries({ queryKey: ['projects'] });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} width={720} title="Import a plan"
      footer={<>
        <Button variant="glass" onClick={close}>Cancel</Button>
        {plan && <Button variant="primary" icon={<Upload className="size-4" />} loading={busy} disabled={plan.usesDays && !day1} onClick={() => void run()}>Add {count(plan.tasks.length)} tasks</Button>}
      </>}>
      {!plan ? (
        <div>
          <button type="button" onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void load(f); }}
            className="grid w-full place-items-center rounded-[26px] border-2 border-dashed border-[var(--hairline)] px-6 py-12 text-center hover:bg-[var(--fill)]">
            <span className="grid size-14 place-items-center rounded-[20px] bg-iris/15 text-iris"><FileUp className="size-7" /></span>
            <span className="mt-3 block text-[17px] font-extrabold">Drop the plan here</span>
            <span className="text-2 mt-1 block max-w-md text-[13.5px]">
              A NUUKE plan file, or a sheet (Excel or CSV) with columns <b>Day</b> or <b>Date</b>, <b>Task</b>, <b>What it involves</b>, <b>Owner</b>,
              <b> Deliverable</b> and, if it has them, <b>Phase</b>.
            </span>
          </button>
          <input ref={input} type="file" accept=".json,.csv,.xlsx,.xlsm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="fill flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl px-4 py-3 text-[13px]">
            <b>{plan.name}</b>
            <span><b>{count(plan.tasks.length)}</b> tasks</span>
            {plan.phases.length > 0 && <span><b>{plan.phases.length}</b> phases</span>}
            {plan.days.length > 0 && <span><b>{plan.days.length}</b> calendar days</span>}
            {(['team', 'client', 'both'] as TaskSide[]).map((s) => bySide(s) > 0 && (
              <span key={s} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: SIDE_COLORS[s] }} />{sideMeta(s, project.client_name).label} {bySide(s)}</span>
            ))}
          </div>
          {plan.usesDays && (
            <div className="flex flex-wrap items-end gap-3">
              <Input type="date" label="Day 1 is" value={day1} onChange={(e) => setDay1(e.target.value)} className="w-[200px]" />
              {day1 && <p className="text-2 pb-2 text-[13px]">Day 1 is {format(parseISO(day1), 'EEE d MMM')}; the last task is on {format(parseISO(dates.at(-1) ?? day1), 'EEE d MMM yyyy')}. If the start moves later, use Move dates.</p>}
            </div>
          )}
          {plan.phases.length > 0 && day1 && (
            <div className="space-y-1.5">
              {plan.phases.map((p) => (
                <div key={p.name} className="fill flex flex-wrap items-baseline gap-x-3 rounded-2xl px-3.5 py-2 text-[13px]">
                  <b className="min-w-0 flex-1">{p.name}</b>
                  <span className="text-2">{format(parseISO(dateOf(p.from)), 'd MMM')} – {format(parseISO(dateOf(p.to)), 'd MMM')}</span>
                  <span className="text-3">{plan.tasks.filter((t) => t.phase === p.name).length} tasks</span>
                </div>
              ))}
            </div>
          )}
          {day1 && (
            <div className="fill max-h-[260px] overflow-y-auto rounded-2xl p-2">
              {plan.tasks.filter((t) => !t.done).slice(0, 12).map((t, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-[13px]">
                  <span className="text-3 w-[86px] shrink-0 font-semibold">{format(parseISO(dateOf(t.at)), 'EEE d MMM')}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: SIDE_COLORS[t.side] }} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.title}</span>
                  <span className="text-3 hidden max-w-[180px] truncate sm:inline">{t.owner}</span>
                </div>
              ))}
              {plan.tasks.length > 12 && <p className="text-3 px-2 py-1 text-[12px]">…and {plan.tasks.length - 12} more</p>}
            </div>
          )}
          <p className="text-3 text-[12.5px]">
            Each task lands on the calendar and the board, in its phase. Whoever is on a task (or the project lead, while nobody is) is reminded the day before,
            on the day and if it runs late; {project.client_name || 'the client'} is reminded about theirs. Importing the same plan again adds only what's missing.
          </p>
          <button type="button" className="text-2 text-[13px] font-bold" onClick={() => setPlan(null)}>Choose another file</button>
        </div>
      )}
      {error && <p className="mt-4 rounded-2xl bg-bad/12 px-4 py-3 text-[13px] font-semibold text-bad">{error}</p>}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ move dates */
export function MovePlanSheet({ open, project, tasks, onClose }: { open: boolean; project: ProjectWithTeam; tasks: Task[]; onClose: () => void }) {
  const today = localISO();
  const [from, setFrom] = useState(project.starts_on && project.starts_on > today ? project.starts_on : today);
  const [days, setDays] = useState('7');
  const [dir, setDir] = useState<'later' | 'earlier'>('later');
  const [busy, setBusy] = useState(false);
  const refresh = useProjectRefresh();
  const qc = useQueryClient();
  const toast = useToast();
  const n = Math.max(0, Math.min(365, parseInt(days, 10) || 0));
  const moving = tasks.filter((t) => t.status !== 'done' && t.due_on && t.due_on >= from).length;
  const signed = dir === 'later' ? n : -n;

  const run = async () => {
    if (!n) return;
    setBusy(true);
    try {
      const res = await shiftProjectPlan(project.id, from, signed);
      toast({ title: `Moved ${count(res.tasks)} tasks ${n} ${n === 1 ? 'day' : 'days'} ${dir}`, body: 'Everyone on the project has been told.', tone: 'success' });
      refresh(project.id);
      void qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} width={520} title="Move dates"
      footer={<><Button variant="glass" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={<MoveRight className="size-4" />} loading={busy} disabled={!n} onClick={() => void run()}>Move {count(moving)} tasks</Button></>}>
      <p className="text-2 mb-4 text-[13.5px]">When the start or the launch moves, everything from that day moves with it: tasks, phases and calendar days. Finished tasks stay where they are.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input type="date" label="Everything from" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="number" min={1} max={365} label="By how many days" value={days} onChange={(e) => setDays(e.target.value)} />
      </div>
      <div className="mt-3"><Segmented value={dir} onChange={setDir} options={[{ value: 'later', label: 'Later' }, { value: 'earlier', label: 'Earlier' }]} /></div>
      {n > 0 && from && (
        <p className={clsx('mt-4 rounded-2xl px-4 py-3 text-[13px] font-semibold', moving ? 'bg-iris/10' : 'fill')}>
          {moving ? <>{count(moving)} open tasks from {format(parseISO(from), 'EEE d MMM')} move to {n} {n === 1 ? 'day' : 'days'} {dir}.
            {' '}The first lands on {format(addDays(parseISO(tasks.filter((t) => t.status !== 'done' && t.due_on && t.due_on >= from).map((t) => t.due_on!).sort()[0]), signed), 'EEE d MMM')}.</>
            : 'No open tasks from that day.'}
        </p>
      )}
    </Sheet>
  );
}
