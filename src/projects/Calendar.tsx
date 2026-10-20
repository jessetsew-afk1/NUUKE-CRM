import { useState } from 'react';
import { CalendarCheck, Flag, Megaphone, Rocket, SquareCheck, Users } from 'lucide-react';
import { EVENT_KINDS, eventKindMeta, platformMeta, useProjectRefresh, type ProjectWithTeam } from '@/data/projects';
import { must, supabase } from '@/lib/supabase';
import type { ContentPost, ProjectEvent, Sprint } from '@/lib/types';
import { Button, Input, Picker, Pill, Sheet, Switch, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { friendly, localISO, time, toLocalInput } from '@/lib/format';
import type { CalItem } from './MonthCalendar';
import { format, parseISO } from 'date-fns';

const browserDay = (ts: string) => localISO(new Date(ts), Intl.DateTimeFormat().resolvedOptions().timeZone);

export const CAL_LEGEND = [
  { label: 'Meetings & milestones', color: '#5AB8FF' },
  { label: 'Task due', color: '#FF9A6B' },
  { label: 'Content', color: '#E1306C' },
  { label: 'Sprint', color: '#7C5CFF' },
];

/** Turns a project's dated things into calendar items. */
export function calendarItems({
  tasks, events, posts, sprints, onTask, onEvent, onPost, onSprint, projectName,
}: {
  tasks: { id: number; title: string; due_on: string | null; status: string; project_id: number }[];
  events: ProjectEvent[]; posts: ContentPost[]; sprints: Sprint[];
  onTask: (t: { id: number; project_id: number }) => void; onEvent: (e: ProjectEvent) => void; onPost: (p: ContentPost) => void; onSprint: (s: Sprint) => void;
  projectName?: (id: number) => string | undefined;
}): CalItem[] {
  const items: CalItem[] = [];
  for (const e of events) {
    const k = eventKindMeta(e.kind);
    items.push({ id: `e${e.id}`, date: e.all_day ? e.starts_at.slice(0, 10) : browserDay(e.starts_at), title: e.title, color: k.color, kind: k.label, time: e.all_day ? null : time(e.starts_at),
      sub: projectName?.(e.project_id), icon: e.kind === 'meeting' ? <Users className="size-4" /> : <Flag className="size-4" />, onClick: () => onEvent(e) });
  }
  for (const t of tasks) {
    if (!t.due_on) continue;
    items.push({ id: `t${t.id}`, date: t.due_on, title: t.title, color: '#FF9A6B', kind: 'Task due', sub: projectName?.(t.project_id),
      faded: t.status === 'done', icon: <SquareCheck className="size-4" />, onClick: () => onTask(t) });
  }
  for (const p of posts) {
    if (!p.scheduled_at) continue;
    const pm = platformMeta(p.platform);
    items.push({ id: `p${p.id}`, date: browserDay(p.scheduled_at), title: p.title, color: pm.color, kind: pm.label, time: time(p.scheduled_at),
      sub: projectName?.(p.project_id), faded: p.status === 'posted', icon: <Megaphone className="size-4" />, onClick: () => onPost(p) });
  }
  for (const s of sprints) {
    items.push({ id: `ss${s.id}`, date: s.starts_on, title: `${s.name} starts`, color: '#7C5CFF', kind: 'Sprint', sub: projectName?.(s.project_id), icon: <Rocket className="size-4" />, onClick: () => onSprint(s) });
    items.push({ id: `se${s.id}`, date: s.ends_on, title: `${s.name} ends`, color: '#7C5CFF', kind: 'Sprint', sub: projectName?.(s.project_id), icon: <CalendarCheck className="size-4" />, onClick: () => onSprint(s) });
  }
  return items;
}

export function EventSheet({ event, project, canEdit, onClose }: {
  event: ProjectEvent | { new: true; day: string } | null; project: ProjectWithTeam; canEdit: boolean; onClose: () => void;
}) {
  const e = event && !('new' in event) ? event : null;
  const [form, setForm] = useState({ title: '', kind: 'meeting', starts_at: '', ends_at: '', location: '', notes: '', client_visible: true, all_day: false });
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useProjectRefresh();
  const toast = useToast();
  const k = e ? `e${e.id}` : event ? `new-${(event as { day: string }).day}` : null;
  if (k !== key) {
    setKey(k);
    if (e) {
      setForm(e.all_day
        ? { title: e.title, kind: e.kind, starts_at: e.starts_at.slice(0, 10), ends_at: e.ends_at ? e.ends_at.slice(0, 10) : '',
            location: e.location ?? '', notes: e.notes ?? '', client_visible: e.client_visible, all_day: true }
        : { title: e.title, kind: e.kind, starts_at: toLocalInput(new Date(e.starts_at)), ends_at: e.ends_at ? toLocalInput(new Date(e.ends_at)) : '',
            location: e.location ?? '', notes: e.notes ?? '', client_visible: e.client_visible, all_day: false });
    } else if (event) {
      const day = (event as { day: string }).day;
      setForm({ title: '', kind: 'meeting', starts_at: `${day}T15:00`, ends_at: `${day}T15:30`, location: '', notes: '', client_visible: true, all_day: false });
    }
  }

  const save = async () => {
    if (!form.title.trim()) { toast({ title: 'Give it a name', tone: 'warning' }); return; }
    setBusy(true);
    try {
      // All-day: the date at 12:00 UTC, so it lands on the same day in every time zone.
      const at = (v: string) => (form.all_day ? `${v.slice(0, 10)}T12:00:00Z` : new Date(v).toISOString());
      const row = {
        title: form.title.trim(), kind: form.kind, starts_at: at(form.starts_at),
        ends_at: form.ends_at ? at(form.ends_at) : null, location: form.location.trim() || null,
        notes: form.notes.trim() || null, client_visible: form.client_visible, all_day: form.all_day,
      };
      if (e) must(await supabase.from('project_events').update(row).eq('id', e.id).select());
      else must(await supabase.from('project_events').insert({ ...row, project_id: project.id }).select());
      toast({ title: e ? 'Saved' : 'Added to the calendar', tone: 'success' });
      refresh(project.id);
      onClose();
    } catch (err) { toast({ title: (err as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!e) return;
    const { error } = await supabase.from('project_events').delete().eq('id', e.id);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    refresh(project.id);
    onClose();
  };

  if (e && !canEdit) {
    const k2 = eventKindMeta(e.kind);
    return (
      <Sheet open onClose={onClose} title={e.title} width={460}>
        <div className="space-y-3 text-[14px]">
          <Pill tone="info"><span style={{ color: k2.color }}>{k2.label}</span></Pill>
          <div className="font-semibold">{e.all_day
            ? `${format(parseISO(e.starts_at.slice(0, 10)), 'EEE d MMM')}${e.ends_at ? ` – ${format(parseISO(e.ends_at.slice(0, 10)), 'EEE d MMM')}` : ''}`
            : <>{friendly(e.starts_at)}{e.ends_at && ` – ${time(e.ends_at)}`}</>}</div>
          {e.location && (/^https?:/.test(e.location)
            ? <Button variant="primary" onClick={() => window.open(e.location!, '_blank', 'noopener')}>Join</Button>
            : <div className="text-2">{e.location}</div>)}
          {e.notes && <p className="text-2 whitespace-pre-wrap">{e.notes}</p>}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={!!event} onClose={onClose} width={560} title={e ? 'Edit' : 'Add to the calendar'}
      footer={<>
        {e && <Button variant="ghost" className="mr-auto text-bad" onClick={remove}>Delete</Button>}
        <Button variant="glass" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>{e ? 'Save' : 'Add'}</Button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="What" autoFocus={!e} value={form.title} onChange={(x) => setForm({ ...form, title: x.target.value })} placeholder="e.g. Design review call" />
        <Picker label="Kind" value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={EVENT_KINDS.map((x) => ({ value: x.key, label: x.label, dot: x.color }))} />
        <Input label="Where / link" value={form.location} onChange={(x) => setForm({ ...form, location: x.target.value })} placeholder="Zoom or Meet link" />
        <Input label="Starts" type={form.all_day ? 'date' : 'datetime-local'} value={form.starts_at} onChange={(x) => setForm({ ...form, starts_at: x.target.value })} />
        <Input label="Ends" type={form.all_day ? 'date' : 'datetime-local'} value={form.ends_at} onChange={(x) => setForm({ ...form, ends_at: x.target.value })} />
        <div className="sm:col-span-2">
          <Switch checked={form.all_day} label="All day (a date, no time)"
            onChange={(v) => setForm({ ...form, all_day: v, starts_at: v ? form.starts_at.slice(0, 10) : `${form.starts_at.slice(0, 10)}T15:00`, ends_at: v ? form.ends_at.slice(0, 10) : '' })} />
        </div>
        <Textarea className="sm:col-span-2" label="Notes" rows={2} value={form.notes} onChange={(x) => setForm({ ...form, notes: x.target.value })} />
        <div className="sm:col-span-2"><Switch checked={form.client_visible} onChange={(v) => setForm({ ...form, client_visible: v })} label="On the client's calendar too" /></div>
      </div>
    </Sheet>
  );
}
