import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarDays, Globe2, UserCog } from 'lucide-react';
import { usePeople } from '@/data/common';
import { useMeetingsWithLeads, useTechManagers, type MeetingWithLead } from '@/data/sales';
import { PKT, dayIn, zoneMeta } from '@/lib/timezones';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Chip, PageHeader, Panel, Picker, Skeleton, Stat } from '@/ui/kit';
import { MeetingSheet } from '@/sales/MeetingSheet';
import { MeetingsCalendar } from '@/sales/MeetingsCalendar';

/** Every meeting the sales floor has booked, on one time-zone-aware calendar. */
export default function AdminMeetingsPage() {
  const meetings = useMeetingsWithLeads('all');
  const people = usePeople();
  const tms = useTechManagers();
  const [open, setOpen] = useState<MeetingWithLead | null>(null);
  const [rep, setRep] = useState('');
  const [tm, setTm] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);

  const reps = (people.data ?? []).filter((p) => p.role === 'sales');
  const all = meetings.data ?? [];
  const list = useMemo(() => all.filter((m) => {
    if (!showCancelled && m.status === 'cancelled') return false;
    if (rep && m.owner_id !== rep) return false;
    if (tm === 'none' && m.technical_manager_id) return false;
    if (tm && tm !== 'none' && m.technical_manager_id !== tm) return false;
    if (zones.length && !zones.includes(m.timezone ?? PKT)) return false;
    return true;
  }), [all, rep, tm, zones, showCancelled]);

  const today = dayIn(new Date(), PKT);
  const weekAhead = Date.now() + 7 * 864e5;
  const upcoming = all.filter((m) => m.status === 'scheduled' && Date.parse(m.starts_at) >= Date.now());
  const todays = upcoming.filter((m) => dayIn(m.starts_at, PKT) === today);
  const noTm = upcoming.filter((m) => !m.technical_manager_id);
  const zoneCounts = new Map<string, number>();
  for (const m of all) if (m.status !== 'cancelled') zoneCounts.set(m.timezone ?? PKT, (zoneCounts.get(m.timezone ?? PKT) ?? 0) + 1);
  const topZone = [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <PageHeader title="Meetings calendar" sub="Every meeting the team has booked, in any time zone. Colours show the client's zone; switch the clock to see them in Pakistan time or the client's." />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Coming up" value={upcoming.length} sub={`${upcoming.filter((m) => Date.parse(m.starts_at) < weekAhead).length} in the next 7 days`} icon={<CalendarCheck className="size-4" />} accent="#7C5CFF" />
        <Stat label="Today (PKT)" value={todays.length} sub="still to happen" icon={<CalendarDays className="size-4" />} accent="#0A84FF" />
        <Stat label="No technical manager" value={noTm.length} sub={noTm.length ? 'upcoming meetings to staff' : 'all covered'} icon={<UserCog className="size-4" />} accent={noTm.length ? '#FF9F0A' : '#30C46C'} />
        <Stat label="Busiest zone" value={topZone ? zoneMeta(topZone[0]).label : '—'} sub={topZone ? `${topZone[1]} meetings` : 'no meetings yet'} icon={<Globe2 className="size-4" />} accent={topZone ? zoneMeta(topZone[0]).color : '#8E8AA0'} />
      </div>

      <Panel className="mb-5 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Picker className="w-[210px]" value={rep} onChange={setRep} options={[{ value: '', label: 'Every rep' },
            ...reps.map((p) => ({ value: p.id, label: p.full_name, icon: <AgentAvatar who={p} size={20} /> }))]} />
          <Picker className="w-[230px]" value={tm} onChange={setTm} options={[{ value: '', label: 'Any technical manager' }, { value: 'none', label: 'No technical manager yet' },
            ...(tms.data ?? []).map((p) => ({ value: p.id, label: p.full_name, icon: <AgentAvatar who={p} size={20} /> }))]} />
          <Chip active={showCancelled} onClick={() => setShowCancelled((v) => !v)}>Show cancelled</Chip>
          <div className="flex flex-wrap gap-1.5">
            {[...zoneCounts.keys()].map((z) => (
              <Chip key={z} dot={zoneMeta(z).color} active={zones.includes(z)} count={zoneCounts.get(z)}
                onClick={() => setZones((s) => (s.includes(z) ? s.filter((x) => x !== z) : [...s, z]))}>{zoneMeta(z).label}</Chip>
            ))}
          </div>
        </div>
      </Panel>

      {meetings.isLoading ? <Skeleton className="h-[640px] rounded-[26px]" /> : <MeetingsCalendar meetings={list} onOpen={setOpen} />}
      <MeetingSheet meeting={open} onClose={() => setOpen(null)} />
    </>
  );
}
