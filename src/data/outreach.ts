import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { liveChannel, must, rpc, supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import type { Tone } from '@/ui/kit';

export type Prospect = Database['public']['Tables']['outreach_prospects']['Row'];
export type OutreachAction = 'sent' | 'followed' | 'replied' | 'booked' | 'reminded' | 'held' | 'no_show' | 'no' | 'no_ig' | 'handle' | 'reopen';
export type ReplyKind = 'yes' | 'cost' | 'info' | 'have_someone' | 'not_interested' | 'medical' | 'other';

export const STATUS: Record<string, { label: string; tone: Tone }> = {
  not_sent: { label: 'Not sent', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  replied: { label: 'Replied', tone: 'iris' },
  info: { label: 'Wants info', tone: 'iris' },
  booked: { label: 'Booked', tone: 'great' },
  held: { label: 'Held', tone: 'good' },
  no_show: { label: 'No-show', tone: 'warn' },
  no: { label: 'No', tone: 'bad' },
  no_reply: { label: 'No reply', tone: 'neutral' },
  no_ig: { label: 'No IG', tone: 'neutral' },
};

export const READY: Record<string, { label: string; tone: Tone }> = {
  ready: { label: 'Ready', tone: 'good' },
  check: { label: 'Check they post', tone: 'warn' },
  facebook: { label: 'Facebook DM', tone: 'info' },
  search: { label: 'Find their Instagram', tone: 'warn' },
  info: { label: 'Waiting on Isaiah', tone: 'neutral' },
};

/** Today's date in US Eastern, the day outreach runs on. */
export const etToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const etDay = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso)) : null);
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** What's waiting on the setter today, in the order she should do it. */
export function queues(rows: Prospect[] | undefined) {
  const today = etToday();
  const all = rows ?? [];
  const tomorrow = addDays(today, 1);
  return {
    remind: all.filter((p) => p.status === 'booked' && !p.reminded_at && etDay(p.call_at) === tomorrow),
    noShow: all.filter((p) => p.status === 'no_show'),
    replies: all.filter((p) => p.status === 'replied' && p.reply_kind === 'yes'),
    followUps: all.filter((p) => (p.status === 'sent' && p.follow_step < 2 || p.status === 'info') && p.next_follow_on && p.next_follow_on <= today),
    next: all
      .filter((p) => p.status === 'not_sent' && p.ready !== 'info' && p.available_on <= today)
      .sort((a, b) => a.position - b.position),
    later: all.filter((p) => p.status === 'not_sent' && p.available_on > today),
    upcoming: all.filter((p) => p.status === 'booked').sort((a, b) => (a.call_at ?? '').localeCompare(b.call_at ?? '')),
  };
}
export const dueCount = (rows: Prospect[] | undefined) => {
  const q = queues(rows);
  return q.remind.length + q.noShow.length + q.replies.length + q.followUps.length;
};

export function useProspects(enabled = true) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['outreach', uid],
    enabled: enabled && !!uid,
    refetchInterval: 60_000,
    queryFn: async () => must(await supabase.from('outreach_prospects').select('*').order('position')) as Prospect[],
  });
  useEffect(() => {
    if (!enabled || !uid) return;
    const channel = liveChannel(`outreach:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outreach_prospects' }, () => {
        void qc.invalidateQueries({ queryKey: ['outreach'] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, uid, qc]);
  return q;
}

export interface OutreachNumbers {
  today: string;
  target: number;
  touches_today: number;
  memos_today: number;
  week: { memos: number; follow_ups: number; replies: number; booked: number; held: number; no_ig: number };
  all: { sent: number; replies: number; booked: number; held: number; no_ig: number; left: number };
  pay_per_held: number;
  earned: number;
  setter_name: string | null;
  closer_name: string | null;
}

export function useOutreachNumbers(setterId: string | null | undefined) {
  return useQuery({
    queryKey: ['outreach', 'numbers', setterId],
    enabled: !!setterId,
    refetchInterval: 60_000,
    queryFn: () => rpc<OutreachNumbers>('outreach_numbers', { p_setter: setterId! }),
  });
}

export async function act(id: number, action: OutreachAction, note?: string | null, callAt?: string | null) {
  return rpc<Prospect>('outreach_act', {
    p_id: id, p_action: action, p_note: (note ?? null) as string, p_call_at: (callAt ?? null) as string,
  });
}

/** Deep links that open the Instagram (or Messenger) app on her phone. */
export const igProfile = (h: string) => `https://instagram.com/${h}`;
export const igDm = (h: string) => `https://ig.me/m/${h}`;
export function messengerLink(facebook: string | null) {
  const m = facebook?.match(/facebook\.com\/(?:profile\.php\?id=(\d+)|([^/?#]+))/i);
  const page = m?.[1] ?? m?.[2];
  return page ? `https://m.me/${page}` : facebook;
}
/** Where to message them: Instagram DM, else Facebook Messenger. */
export function dmLink(p: Prospect) {
  if (p.instagram) return igDm(p.instagram);
  return messengerLink(p.facebook);
}

/** "Thu 29 Oct, 2:00 PM ET" */
export function etTime(iso: string | null | undefined, withDay = true) {
  if (!iso) return '';
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return withDay ? `${day}, ${time} ET` : `${time} ET`;
}

/** "2026-10-29T14:00" typed as Eastern time → an exact moment. */
export function etToIso(local: string) {
  const [d, t] = local.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = (t ?? '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (k: string) => Number(parts.find((x) => x.type === k)?.value);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess + (guess - shown)).toISOString();
}
