import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Video } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useMeetingsWithLeads, type MeetingWithLead } from '@/data/sales';
import { bothTimes, zoneMeta } from '@/lib/timezones';
import { Agent } from '@/agent/Agent';
import { Empty, PageHeader, Panel, PanelHeader, Skeleton } from '@/ui/kit';
import { ago } from '@/lib/format';
import { MeetingSheet } from '@/sales/MeetingSheet';
import { MeetingsCalendar } from '@/sales/MeetingsCalendar';

/** For technical managers: the client meetings they've been put on, with everything to prep. */
export default function TechMeetingsPage() {
  const { agent } = useAuth();
  const meetings = useMeetingsWithLeads('tm');
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<MeetingWithLead | null>(null);
  const all = meetings.data ?? [];
  const next = all.filter((m) => m.status === 'scheduled' && Date.parse(m.starts_at) + m.duration_minutes * 60_000 >= Date.now()).slice(0, 3);

  // Opened from a notification: /meetings/tech?meeting=12
  useEffect(() => {
    const id = Number(params.get('meeting'));
    if (id && meetings.data) {
      const m = meetings.data.find((x) => x.id === id);
      if (m) setOpen(m);
      params.delete('meeting');
      setParams(params, { replace: true });
    }
  }, [params, setParams, meetings.data]);

  return (
    <>
      <PageHeader title="Client meetings" sub="Meetings you're joining as the technical manager — with the lead's details, the call transcript and the rep's prep notes." />
      {meetings.isLoading ? <Skeleton className="h-[520px] rounded-[26px]" /> : all.length === 0 ? (
        <Panel><Empty art={<Agent config={agent} size={130} mood="idle" />} title="No meetings yet"
          body="When a rep books a meeting and picks you as the technical manager, it lands here and you get a notification." /></Panel>
      ) : (
        <>
          {next.length > 0 && (
            <Panel className="mb-5">
              <PanelHeader title="Up next" sub="Tap one for the prep sheet." />
              <div className="grid gap-3 md:grid-cols-3">
                {next.map((m, i) => {
                  const z = zoneMeta(m.timezone);
                  return (
                    <motion.button key={m.id} type="button" onClick={() => setOpen(m)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      whileHover={{ y: -3 }} className="rounded-[22px] p-4 text-left" style={{ background: `${z.color}16`, boxShadow: `inset 0 0 0 1px ${z.color}40` }}>
                      <div className="flex items-center gap-2 text-[12px] font-bold" style={{ color: z.color }}><Clock className="size-3.5" />starts {ago(m.starts_at)}</div>
                      <div className="mt-1 truncate text-[16px] font-extrabold">{m.leads?.name || m.title}</div>
                      <div className="text-2 truncate text-[13px]">{m.leads?.service ?? m.title}</div>
                      <div className="mt-2 text-[12.5px] font-semibold">{bothTimes(m.starts_at, m.timezone)}</div>
                      {m.location && /^https?:/.test(m.location) && <div className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-iris"><Video className="size-3.5" />Has a join link</div>}
                    </motion.button>
                  );
                })}
              </div>
            </Panel>
          )}
          <MeetingsCalendar meetings={all} onOpen={setOpen} />
        </>
      )}
      <MeetingSheet meeting={open} onClose={() => setOpen(null)} />
    </>
  );
}
