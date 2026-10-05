import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ChevronDown, Clock, FileText, Globe, Link2, UserCog } from 'lucide-react';
import { useTechManagers, type MeetingExtras } from '@/data/sales';
import { ZONES, PKT, bothTimes, guessZone, isoToZonedInput, zoneMeta, zonedInputToISO } from '@/lib/timezones';
import type { Lead, Meeting } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Input, Label, Picker, Segmented, Textarea } from '@/ui/kit';

export interface MeetingDraft {
  tz: string;
  local: string; // datetime-local, in the client's zone
  minutes: string;
  tm: string;
  location: string;
  transcript: string;
  website: string;
  links: string;
  prep: string;
}

export function draftForLead(lead: Pick<Lead, 'phone' | 'country'> | null): MeetingDraft & { why: string | null } {
  const g = lead ? guessZone(lead.phone, lead.country) : null;
  return {
    tz: g?.id ?? 'America/New_York', why: g ? g.why : null,
    local: '', minutes: '30', tm: '', location: '', transcript: '', website: '', links: '', prep: '',
  };
}

export function draftFromMeeting(m: Meeting): MeetingDraft {
  const tz = m.timezone ?? PKT;
  return {
    tz, local: isoToZonedInput(m.starts_at, tz), minutes: String(m.duration_minutes), tm: m.technical_manager_id ?? '',
    location: m.location ?? '', transcript: m.transcript ?? '', website: m.client_website ?? '', links: m.client_links ?? '', prep: m.prep_notes ?? '',
  };
}

export function draftStartsAt(d: MeetingDraft) {
  return d.local ? zonedInputToISO(d.local, d.tz) : null;
}

export function draftExtras(d: MeetingDraft): MeetingExtras {
  const t = (v: string) => v.trim() || null;
  return {
    timezone: d.tz, technical_manager_id: d.tm || null, location: t(d.location), transcript: t(d.transcript),
    client_website: t(d.website), client_links: t(d.links), prep_notes: t(d.prep),
  };
}

/** Time (in the client's zone), length, technical manager, link, and the prep a TM needs. */
export function MeetingFields({ draft, onChange, why, openPrep }: {
  draft: MeetingDraft; onChange: (d: MeetingDraft) => void; why?: string | null; openPrep?: boolean;
}) {
  const tms = useTechManagers();
  const [prepOpen, setPrepOpen] = useState(openPrep ?? false);
  const set = <K extends keyof MeetingDraft>(k: K, v: MeetingDraft[K]) => onChange({ ...draft, [k]: v });
  const iso = draftStartsAt(draft);
  const zone = zoneMeta(draft.tz);
  const prepCount = [draft.transcript, draft.website, draft.links, draft.prep].filter((x) => x.trim()).length;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Picker label="Client's time zone" value={draft.tz} onChange={(v) => {
          // Keep the same wall-clock time the client said; only the zone changes.
          onChange({ ...draft, tz: v });
        }}
          options={ZONES.map((z) => ({ value: z.id, label: z.label, hint: z.id === draft.tz && why ? `guessed from ${why}` : z.short || undefined, dot: z.color }))} />
        <Input label={`Meeting time (${zone.label} time)`} type="datetime-local" value={draft.local} onChange={(e) => set('local', e.target.value)} />
      </div>
      {iso && (
        <div className="flex items-center gap-2 rounded-2xl bg-iris/10 px-3.5 py-2.5 text-[13px] font-semibold">
          <Clock className="size-4 shrink-0 text-iris" />
          <span>{bothTimes(iso, draft.tz)}</span>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div>
          <Label>Length</Label>
          <Segmented value={draft.minutes} onChange={(v) => set('minutes', v)}
            options={[{ value: '15', label: '15m' }, { value: '30', label: '30m' }, { value: '45', label: '45m' }, { value: '60', label: '1h' }]} />
        </div>
        <Picker label="Technical manager" value={draft.tm} onChange={(v) => set('tm', v)}
          placeholder={tms.data?.length ? 'Choose who joins' : 'None set up yet'}
          options={[{ value: '', label: 'No technical manager', icon: <UserCog className="text-3 size-4" /> },
            ...(tms.data ?? []).map((p) => ({ value: p.id, label: p.full_name, hint: p.title ?? p.department ?? undefined, icon: <AgentAvatar who={p} size={20} /> }))]} />
      </div>
      <Input label="Meeting link" placeholder="Zoom or Google Meet link" value={draft.location} onChange={(e) => set('location', e.target.value)} leading={<Link2 className="size-4" />} />

      <div className="fill rounded-[20px]">
        <button type="button" onClick={() => setPrepOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13.5px] font-bold">
          <FileText className="size-4 text-iris" />
          <span className="flex-1">Prep for the meeting <span className="text-3 font-semibold">— transcript, website, socials, notes</span></span>
          {prepCount > 0 && <span className="rounded-full bg-iris px-2 text-[11px] leading-5 text-white">{prepCount}</span>}
          <ChevronDown className={clsx('size-4 transition-transform', prepOpen && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>
          {prepOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-3 px-4 pb-4">
                <Textarea label="Call transcript" hint="paste the whole conversation" rows={6} value={draft.transcript} onChange={(e) => set('transcript', e.target.value)}
                  placeholder="Paste the call transcript from Zoom here…" />
                <Input label="Client's website" placeholder="https://…" value={draft.website} onChange={(e) => set('website', e.target.value)} leading={<Globe className="size-4" />} />
                <Textarea label="Socials & other links" hint="one per line" rows={3} value={draft.links} onChange={(e) => set('links', e.target.value)}
                  placeholder={'instagram.com/…\nlinkedin.com/in/…\nCompetitor they like: …'} />
                <Textarea label="Notes for the technical manager" rows={3} value={draft.prep} onChange={(e) => set('prep', e.target.value)}
                  placeholder="Budget, timeline, who decides, what they care about most…" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
