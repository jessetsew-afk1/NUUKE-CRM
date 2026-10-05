import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CalendarClock, ExternalLink, FileText, Globe, Link2, Mail, Phone, PhoneCall, UserCog, Video,
} from 'lucide-react';
import { useAuth } from '@/app/auth';
import { usePeople } from '@/data/common';
import type { MeetingLead, MeetingWithLead } from '@/data/sales';
import { must, supabase } from '@/lib/supabase';
import { splitPhones, zoomCallHref } from '@/lib/phones';
import { bothTimes, zoneMeta } from '@/lib/timezones';
import type { Meeting } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Input, Pill, Segmented, Sheet, Spinner, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { ago } from '@/lib/format';
import { CopyButton, parseQuery } from './LeadCard';
import { MeetingFields, draftExtras, draftForLead, draftFromMeeting, draftStartsAt, type MeetingDraft } from './MeetingFields';

export const MEETING_STATUS = {
  scheduled: { label: 'Scheduled', tone: 'info' as const },
  completed: { label: 'Held', tone: 'good' as const },
  no_show: { label: 'No-show', tone: 'warn' as const },
  cancelled: { label: 'Cancelled', tone: 'neutral' as const },
};

type AnyMeeting = Meeting & { leads?: MeetingLead | null };

/**
 * One meeting. The rep who booked it (and the admin) can change everything; a
 * technical manager sees it as a prep sheet: when, where, who, and everything the rep
 * collected.
 */
export function MeetingSheet({ meeting, onClose }: { meeting: AnyMeeting | 'new' | null; onClose: () => void }) {
  const { profile } = useAuth();
  const m = meeting && meeting !== 'new' ? meeting : null;
  const canEdit = meeting === 'new' || (!!m && (m.owner_id === profile?.id || profile?.role === 'admin'));
  const [tab, setTab] = useState<'details' | 'prep'>('details');
  const [key, setKey] = useState<string | null>(null);
  const k = m ? `m${m.id}` : meeting === 'new' ? 'new' : null;
  if (k !== key) { setKey(k); setTab(canEdit ? 'details' : 'prep'); }

  return (
    <Sheet open={!!meeting} onClose={onClose} width={720}
      title={meeting === 'new' ? 'Add a meeting' : m?.title ?? 'Meeting'}>
      {m && canEdit && (
        <Segmented className="mb-4" value={tab} onChange={setTab} options={[
          { value: 'details', label: 'Edit details' }, { value: 'prep', label: 'Lead & prep' },
        ]} />
      )}
      {meeting && (tab === 'details' && canEdit
        ? <MeetingEditor key={k} meeting={m} onDone={onClose} />
        : m && <MeetingPrep meeting={m} />)}
    </Sheet>
  );
}

/* ================================================================== editor */
function MeetingEditor({ meeting, onDone }: { meeting: AnyMeeting | null; onDone: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [draft, setDraft] = useState<MeetingDraft>(() => (meeting ? draftFromMeeting(meeting) : { ...draftForLead(null), tz: 'America/New_York' }));
  const [status, setStatus] = useState<string>(meeting?.status ?? 'scheduled');
  const [notes, setNotes] = useState(meeting?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const startsAt = draftStartsAt(draft);
    if (!title.trim() || !startsAt) { toast({ title: 'Add a title and a time', tone: 'warning' }); return; }
    setBusy(true);
    try {
      const row = {
        title: title.trim(), starts_at: startsAt, duration_minutes: Number(draft.minutes), status,
        notes: notes.trim() || null, ...draftExtras(draft),
      };
      if (meeting) must(await supabase.from('meetings').update(row).eq('id', meeting.id).select());
      else must(await supabase.from('meetings').insert({ ...row, owner_id: profile!.id }).select());
      void qc.invalidateQueries({ queryKey: ['meetings'] });
      void qc.invalidateQueries({ queryKey: ['sales-stats'] });
      const moved = meeting && meeting.starts_at !== startsAt;
      toast({
        title: meeting ? (moved ? 'Meeting moved' : 'Meeting saved') : 'Meeting added',
        body: `${bothTimes(startsAt, draft.tz)}${draft.tm && (moved || draft.tm !== meeting?.technical_manager_id) ? ' · the technical manager has been told' : ''}`,
        tone: 'success',
      });
      onDone();
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Input label="Meeting" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Discovery call — Maria Lopez" autoFocus={!meeting} />
      <MeetingFields draft={draft} onChange={setDraft} openPrep={!!meeting && !!(meeting.transcript || meeting.client_website || meeting.client_links || meeting.prep_notes)} />
      {meeting && (
        <div>
          <label className="label">How did it go?</label>
          <Segmented value={status} onChange={setStatus} options={Object.entries(MEETING_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        </div>
      )}
      <Textarea label="Your notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="glass" onClick={onDone}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>{meeting ? 'Save meeting' : 'Add meeting'}</Button>
      </div>
    </div>
  );
}

/* =================================================================== prep */
function useMeetingLead(meeting: AnyMeeting) {
  return useQuery({
    queryKey: ['meeting-lead', meeting.lead_id],
    enabled: !!meeting.lead_id && meeting.leads === undefined,
    queryFn: async () => must(await supabase.from('leads')
      .select('id, name, phone, personal_email, work_email, country, service, platform, query, post_link')
      .eq('id', meeting.lead_id!).maybeSingle()) as MeetingLead | null,
  });
}

const linkify = (s: string) => (/^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+/.test(s) ? `https://${s}` : null);

export function MeetingPrep({ meeting }: { meeting: AnyMeeting }) {
  const people = usePeople();
  const fetched = useMeetingLead(meeting);
  const lead = meeting.leads !== undefined ? meeting.leads : fetched.data;
  const rep = people.data?.find((p) => p.id === meeting.owner_id);
  const tm = people.data?.find((p) => p.id === meeting.technical_manager_id);
  const zone = zoneMeta(meeting.timezone);
  const start = Date.parse(meeting.starts_at);
  const live = start - Date.now() < 10 * 60_000 && start + meeting.duration_minutes * 60_000 > Date.now();
  const st = MEETING_STATUS[meeting.status as keyof typeof MEETING_STATUS] ?? MEETING_STATUS.scheduled;
  const phones = splitPhones(lead?.phone);
  const qa = parseQuery(lead?.query);
  const links = (meeting.client_links ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const isLink = meeting.location && /^https?:/i.test(meeting.location);

  return (
    <div className="space-y-5">
      <div className="rounded-[22px] p-4" style={{ background: `${zone.color}18`, boxShadow: `inset 0 0 0 1px ${zone.color}40` }}>
        <div className="flex flex-wrap items-start gap-3">
          <CalendarClock className="mt-1 size-5 shrink-0" style={{ color: zone.color }} />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold">{bothTimes(meeting.starts_at, meeting.timezone)}</div>
            <div className="text-2 text-[13px]">
              {meeting.duration_minutes} minutes · client is on {zone.label} time · {start > Date.now() ? `starts ${ago(meeting.starts_at)}` : `was ${ago(meeting.starts_at)}`}
            </div>
          </div>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {isLink ? (
            <a href={meeting.location!} target="_blank" rel="noreferrer"
              className={clsx('inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[14px] font-bold text-white', live ? 'bg-ok' : 'bg-[#0B5CFF]')}>
              <Video className="size-4" /> {live ? 'Join now' : 'Join link'}
            </a>
          ) : meeting.location ? <span className="fill inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold"><Video className="size-4" />{meeting.location}</span>
            : <span className="text-3 text-[13px]">No meeting link yet.</span>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Person label="Booked by" who={rep} />
        <Person label="Technical manager" who={tm} empty="Nobody assigned" />
      </div>

      <section>
        <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-iris">The client</h3>
        {fetched.isLoading ? <Spinner /> : !lead ? <p className="text-3 text-[13px]">No lead linked to this meeting.</p> : (
          <div className="fill space-y-3 rounded-[22px] p-4">
            <div>
              <div className="text-[18px] font-extrabold">{lead.name || 'Unnamed lead'}</div>
              <div className="text-2 text-[13px]">{[lead.service, lead.platform, lead.country].filter(Boolean).join(' · ')}</div>
            </div>
            {phones.map((p, i) => (
              <div key={p + i} className="flex flex-wrap items-center gap-2">
                <Phone className="text-3 size-4" />
                <span className="tabular font-mono text-[15px] font-semibold">{p}</span>
                <CopyButton value={p} label="Number" className="!h-8" />
                <a href={zoomCallHref(p, lead.country)} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#0B5CFF] px-3 text-[12px] font-bold text-white">
                  <PhoneCall className="size-3.5" /> Call
                </a>
              </div>
            ))}
            {[lead.personal_email, lead.work_email].filter(Boolean).map((e) => (
              <div key={e} className="flex items-center gap-2 text-[14px]"><Mail className="text-3 size-4" /><a className="font-semibold hover:underline" href={`mailto:${e}`}>{e}</a></div>
            ))}
            {lead.post_link && <a href={lead.post_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-iris"><ExternalLink className="size-3.5" />Their original post</a>}
            {qa && (
              <dl className="grid gap-2 border-t border-[var(--hairline)] pt-3 sm:grid-cols-2">
                {qa.map((p, i) => (
                  <div key={i} className={clsx(!p.q && 'sm:col-span-2')}>
                    {p.q && <dt className="text-2 text-[12px]">{p.q}</dt>}
                    <dd className="whitespace-pre-wrap text-[13.5px] font-semibold">{p.a}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-iris">Prep</h3>
        <div className="space-y-3">
          {meeting.client_website && (
            <a href={linkify(meeting.client_website) ?? '#'} target="_blank" rel="noreferrer" className="fill flex items-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-semibold hover:bg-[var(--fill-2)]">
              <Globe className="size-4 text-iris" /> <span className="min-w-0 truncate">{meeting.client_website}</span> <ExternalLink className="text-3 ml-auto size-3.5" />
            </a>
          )}
          {links.length > 0 && (
            <div className="fill space-y-1.5 rounded-2xl px-4 py-3">
              {links.map((l) => {
                const href = linkify(l);
                return href
                  ? <a key={l} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13.5px] font-semibold text-iris hover:underline"><Link2 className="size-3.5 shrink-0" /><span className="truncate">{l}</span></a>
                  : <div key={l} className="text-[13.5px]">{l}</div>;
              })}
            </div>
          )}
          {meeting.prep_notes && (
            <div className="rounded-2xl bg-iris/10 px-4 py-3">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-iris">Notes for the technical manager</div>
              <p className="whitespace-pre-wrap text-[14px]">{meeting.prep_notes}</p>
            </div>
          )}
          {meeting.transcript ? (
            <div className="fill rounded-2xl">
              <div className="flex items-center gap-2 px-4 pt-3">
                <FileText className="size-4 text-iris" />
                <span className="flex-1 text-[13px] font-bold">Call transcript</span>
                <CopyButton value={meeting.transcript} label="Transcript" quiet className="!h-8" />
              </div>
              <pre className="scroll-y max-h-[320px] whitespace-pre-wrap px-4 py-3 font-sans text-[13.5px] leading-relaxed">{meeting.transcript}</pre>
            </div>
          ) : null}
          {!meeting.client_website && !links.length && !meeting.prep_notes && !meeting.transcript && (
            <p className="text-3 text-[13px]">The rep didn't add any prep for this one.</p>
          )}
          {meeting.notes && <p className="text-2 text-[13px]"><b>Rep's notes:</b> {meeting.notes}</p>}
        </div>
      </section>
    </div>
  );
}

function Person({ label, who, empty = '—' }: { label: string; who?: { id: string; full_name: string; avatar: unknown; title?: string | null } | null; empty?: string }) {
  return (
    <div className="fill flex items-center gap-3 rounded-2xl p-3">
      {who ? <AgentAvatar who={who} size={36} /> : <span className="fill-2 grid size-9 place-items-center rounded-full"><UserCog className="text-3 size-4" /></span>}
      <div className="min-w-0">
        <div className="text-3 text-[11px] font-bold uppercase tracking-wider">{label}</div>
        <div className="truncate text-[14px] font-bold">{who?.full_name ?? empty}</div>
      </div>
    </div>
  );
}

export type { MeetingWithLead };
