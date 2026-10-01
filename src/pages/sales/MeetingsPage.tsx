import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { addDays, format, isSameDay, isToday, isTomorrow, parseISO, startOfWeek } from 'date-fns';
import { CalendarCheck, CalendarX, Check, ChevronLeft, ChevronRight, Clock, Link2, Plus, UserX, Video } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { useMeetings } from '@/data/sales';
import { must, supabase } from '@/lib/supabase';
import type { Meeting } from '@/lib/types';
import { Agent } from '@/agent/Agent';
import { Button, Empty, IconButton, Input, PageHeader, Panel, Pill, Segmented, Sheet, Skeleton, Stat, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { time, toLocalInput } from '@/lib/format';

const STATUS = {
  scheduled: { label: 'Scheduled', tone: 'info' as const },
  completed: { label: 'Held', tone: 'good' as const },
  no_show: { label: 'No-show', tone: 'warn' as const },
  cancelled: { label: 'Cancelled', tone: 'neutral' as const },
};

export default function MeetingsPage() {
  const { agent } = useAuth();
  const meetings = useMeetings();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selected, setSelected] = useState<Date | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');

  const all = meetings.data ?? [];
  const now = Date.now();
  const needsOutcome = all.filter((m) => m.status === 'scheduled' && Date.parse(m.starts_at) + m.duration_minutes * 60_000 < now);
  const upcoming = all.filter((m) => Date.parse(m.starts_at) >= now - 30 * 60_000 && m.status === 'scheduled');
  const past = all.filter((m) => Date.parse(m.starts_at) < now && m.status !== 'scheduled').reverse();

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const list = selected
    ? all.filter((m) => isSameDay(parseISO(m.starts_at), selected))
    : view === 'upcoming' ? upcoming : past.slice(0, 60);

  const groups = useMemo(() => {
    const g = new Map<string, Meeting[]>();
    for (const m of list) {
      const d = parseISO(m.starts_at);
      const key = isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEEE d MMMM');
      g.set(key, [...(g.get(key) ?? []), m]);
    }
    return [...g.entries()];
  }, [list]);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = all.filter((m) => Date.parse(m.starts_at) >= monthStart && Date.parse(m.starts_at) < now);
  const held = thisMonth.filter((m) => m.status === 'completed').length;
  const noShow = thisMonth.filter((m) => m.status === 'no_show').length;

  return (
    <>
      <PageHeader title="Meetings" sub="Everything you have booked, and what happened." right={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add meeting</Button>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Coming up" value={upcoming.length} sub="scheduled" icon={<CalendarCheck className="size-4" />} accent="#7C5CFF" />
        <Stat label="Held this month" value={held} sub={`${thisMonth.length} in total`} icon={<Check className="size-4" />} accent="#30C46C" />
        <Stat label="No-shows" value={noShow} sub={thisMonth.length ? `${Math.round((noShow / thisMonth.length) * 100)}% of this month` : '—'} icon={<UserX className="size-4" />} accent="#FF9F0A" />
        <Stat label="Waiting for an outcome" value={needsOutcome.length} sub="past meetings to mark" icon={<Clock className="size-4" />} accent="#FF453A" />
      </div>

      {/* week strip */}
      <Panel className="mb-5 !p-3">
        <div className="flex items-center gap-2">
          <IconButton label="Previous week" onClick={() => setWeekStart((w) => addDays(w, -7))}><ChevronLeft className="size-4" /></IconButton>
          <div className="grid flex-1 grid-cols-7 gap-1.5">
            {days.map((d) => {
              const n = all.filter((m) => isSameDay(parseISO(m.starts_at), d) && m.status !== 'cancelled').length;
              const active = selected && isSameDay(d, selected);
              return (
                <motion.button
                  key={d.toISOString()}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setSelected(active ? null : d)}
                  className={clsx('relative flex flex-col items-center rounded-2xl py-2', active ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'hover:bg-[var(--fill)]')}
                >
                  <span className={clsx('text-[11px] font-bold uppercase', !active && 'text-3')}>{format(d, 'EEE')}</span>
                  <span className={clsx('tabular text-[18px] font-extrabold', isToday(d) && !active && 'text-iris')}>{format(d, 'd')}</span>
                  <span className="mt-0.5 flex h-1.5 gap-0.5">
                    {Array.from({ length: Math.min(n, 4) }, (_, i) => <span key={i} className={clsx('size-1.5 rounded-full', active ? 'bg-white' : 'bg-iris')} />)}
                  </span>
                </motion.button>
              );
            })}
          </div>
          <IconButton label="Next week" onClick={() => setWeekStart((w) => addDays(w, 7))}><ChevronRight className="size-4" /></IconButton>
        </div>
      </Panel>

      {needsOutcome.length > 0 && !selected && (
        <Panel className="mb-5" style={{ boxShadow: '0 0 0 1.5px rgba(255,159,10,.5), var(--shadow)' }}>
          <h3 className="mb-3 text-[15px] font-bold">Did these happen?</h3>
          <div className="space-y-2">{needsOutcome.slice(0, 6).map((m) => <MeetingRow key={m.id} m={m} ask />)}</div>
        </Panel>
      )}

      <div className="mb-3 flex items-center justify-between">
        {selected ? (
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold">{format(selected, 'EEEE d MMMM')}</h3>
            <button type="button" className="text-[13px] font-bold text-iris" onClick={() => setSelected(null)}>Show all</button>
          </div>
        ) : (
          <Segmented value={view} onChange={setView} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
        )}
      </div>

      {meetings.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[76px] rounded-[22px]" />)}</div>
      ) : groups.length === 0 ? (
        <Panel><Empty art={<Agent config={agent} size={120} mood="idle" />} title="No meetings here" body="Book one from the dialer by choosing “Meeting booked”, or add it here." /></Panel>
      ) : (
        <div className="space-y-6">
          {groups.map(([label, ms]) => (
            <section key={label}>
              <div className="text-3 mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.12em]">{label}</div>
              <div className="space-y-2">{ms.map((m) => <MeetingRow key={m.id} m={m} />)}</div>
            </section>
          ))}
        </div>
      )}

      <AddMeeting open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function MeetingRow({ m, ask }: { m: Meeting; ask?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const setStatus = async (status: Meeting['status']) => {
    const { error } = await supabase.from('meetings').update({ status }).eq('id', m.id);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    void qc.invalidateQueries({ queryKey: ['meetings'] });
    void qc.invalidateQueries({ queryKey: ['sales-stats'] });
  };
  const st = STATUS[m.status as keyof typeof STATUS];
  const start = parseISO(m.starts_at);
  const soon = m.status === 'scheduled' && start.getTime() - Date.now() < 60 * 60_000 && start.getTime() > Date.now();
  return (
    <motion.div layout className="glass flex flex-wrap items-center gap-4 rounded-[22px] px-4 py-3">
      <div className={clsx('grid w-[64px] shrink-0 place-items-center rounded-2xl py-1.5', soon ? 'bg-iris text-white' : 'fill')}>
        <span className="tabular text-[15px] font-extrabold">{format(start, 'h:mm')}</span>
        <span className={clsx('text-[11px] font-bold', !soon && 'text-3')}>{format(start, 'a')}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold">{m.title}</div>
        <div className="text-2 flex flex-wrap items-center gap-x-3 text-[13px]">
          <span>{m.duration_minutes} min · ends {time(new Date(start.getTime() + m.duration_minutes * 60_000))}</span>
          {m.location && (/^https?:/.test(m.location)
            ? <a href={m.location} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-iris"><Link2 className="size-3.5" />Join link</a>
            : <span className="inline-flex items-center gap-1"><Video className="size-3.5" />{m.location}</span>)}
        </div>
        {m.notes && <div className="text-3 mt-0.5 truncate text-[12px]">{m.notes}</div>}
      </div>
      {ask || (m.status === 'scheduled' && start.getTime() < Date.now()) ? (
        <div className="flex gap-1.5">
          <Button size="sm" variant="success" icon={<Check className="size-3.5" />} onClick={() => void setStatus('completed')}>Held</Button>
          <Button size="sm" variant="glass" icon={<UserX className="size-3.5" />} onClick={() => void setStatus('no_show')}>No-show</Button>
          <Button size="sm" variant="ghost" icon={<CalendarX className="size-3.5" />} onClick={() => void setStatus('cancelled')}>Cancelled</Button>
        </div>
      ) : (
        <Pill tone={st.tone}>{st.label}</Pill>
      )}
    </motion.div>
  );
}

function AddMeeting({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [at, setAt] = useState(() => toLocalInput(new Date(Math.ceil(Date.now() / 1_800_000) * 1_800_000 + 86_400_000)));
  const [mins, setMins] = useState('30');
  const [location, setLocation] = useState('Zoom');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim() || !at) { toast({ title: 'Add a title and a time', tone: 'warning' }); return; }
    setBusy(true);
    try {
      must(await supabase.from('meetings').insert({
        owner_id: profile!.id, title: title.trim(), starts_at: new Date(at).toISOString(), duration_minutes: Number(mins),
        location: location.trim() || null, notes: notes.trim() || null,
      }).select());
      void qc.invalidateQueries({ queryKey: ['meetings'] });
      toast({ title: 'Meeting added', body: `${title} · ${format(new Date(at), 'EEE d MMM, h:mm a')}`, tone: 'success' });
      setTitle(''); setNotes('');
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a meeting" width={520}
      footer={<><Button variant="glass" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Add meeting</Button></>}>
      <div className="space-y-4">
        <Input label="With / about" placeholder="e.g. Discovery call — Maria Lopez" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input label="When" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          <div>
            <label className="label">Length</label>
            <Segmented value={mins} onChange={setMins} options={[{ value: '15', label: '15m' }, { value: '30', label: '30m' }, { value: '45', label: '45m' }, { value: '60', label: '1h' }]} />
          </div>
        </div>
        <Input label="Where" placeholder="Zoom, Google Meet, or paste the link" value={location} onChange={(e) => setLocation(e.target.value)} />
        <Textarea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}

