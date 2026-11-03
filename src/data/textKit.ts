/**
 * Text kits: leads picked for one salesperson to text from Zoom Phone, each with its
 * message ready to paste. Zoom can open a new text on a number but can't fill in the
 * words, so "Send text" copies the message and opens Zoom; the rep pastes and sends.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { must, rpc, supabase } from '@/lib/supabase';
import type { Database, Json } from '@/lib/database.types';
import type { Tone } from '@/ui/kit';

export type KitText = Database['public']['Tables']['text_kit']['Row'];
export type KitStatus = 'to_text' | 'texted' | 'replied' | 'opted_out';

export const KIT_STATUS: Record<KitStatus, { label: string; tone: Tone }> = {
  to_text: { label: 'To text', tone: 'neutral' },
  texted: { label: 'Texted', tone: 'info' },
  replied: { label: 'Replied', tone: 'great' },
  opted_out: { label: 'Opted out', tone: 'bad' },
};

/** Only text between 9am and 8pm in their time zone. */
export const TEXT_FROM = 9;
export const TEXT_UNTIL = 20;

export function useTextKit(enabled = true) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['text-kit', uid],
    enabled: enabled && !!uid,
    staleTime: 30_000,
    queryFn: async () => must(await supabase.from('text_kit').select('*').order('kit').order('position')) as KitText[],
  });
}

/** Follow-ups go out this many days after the text before, if they still haven't answered. */
export const FOLLOWUP_GAP_DAYS = 3;

export type Touch = 2 | 3;

/**
 * The follow-up that comes next for someone who hasn't answered: which one, its words,
 * and when it's due. Null when they replied, opted out, had all three, or none is written yet.
 */
export function nextTouch(r: KitText, now = new Date()) {
  if (r.status !== 'texted' || !r.texted_at) return null;
  const step = (touch: Touch, message: string | null, after: string) => {
    if (!message) return null;
    const dueAt = new Date(new Date(after).getTime() + FOLLOWUP_GAP_DAYS * 86_400_000);
    return { touch, message, dueAt, due: dueAt <= now };
  };
  if (!r.touch2_at) return step(2, r.followup_2, r.texted_at);
  if (!r.touch3_at) return step(3, r.followup_3, r.touch2_at);
  return null;
}

/** How many texts they've had so far (1 to 3). */
export const touchesSent = (r: KitText) => (r.texted_at ? 1 : 0) + (r.touch2_at ? 1 : 0) + (r.touch3_at ? 1 : 0);

export function useMarkText() {
  const qc = useQueryClient();
  return async (id: number, status: KitStatus | 'reset' | `touch${Touch}`) => {
    await rpc('text_kit_mark', { p_id: id, p_status: status });
    await qc.invalidateQueries({ queryKey: ['text-kit'] });
  };
}

/** Their local time now, and whether it's inside the texting window. */
export function localTime(tz: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const label = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(now).toLowerCase().replace(' ', '');
  return { hour, label, ok: hour >= TEXT_FROM && hour < TEXT_UNTIL };
}

/** Hand an admin-chosen number of "to text" leads from one person to another. Returns how many moved. */
export const assignTexts = (to: string, count: number, from: string) =>
  rpc<number>('text_kit_assign', { p_to: to, p_count: count, p_from: from });

export { signedMessage } from '@/lib/signed';

/* ------------------------------------------------------------------ follow-up sheets */
/** Column headers of the follow-up sheet; the upload finds columns by these names. */
export const FOLLOWUP_COLUMNS = [
  'Text ID', 'Name', 'Phone', 'Sent by', 'Status', 'First text sent', 'Bark post date', 'What they asked for',
  'First message', 'Follow-up 2', 'Follow-up 3', 'Said no',
] as const;

/**
 * Everyone who could still get a follow-up (not replied, not opted out), with what they
 * asked for and the first text, for a bot to write the 2nd and 3rd texts. Follow-ups
 * already written are filled in, so the sheet can go back and forth.
 */
export function followupSheet(rows: KitText[], ownerName: (id: string) => string, onlyMissing: boolean) {
  const open = rows
    .filter((r) => r.status === 'to_text' || r.status === 'texted')
    .filter((r) => !onlyMissing || !r.followup_2 || !r.followup_3)
    .sort((a, b) => (a.texted_at ? 0 : 1) - (b.texted_at ? 0 : 1) || (a.texted_at ?? '').localeCompare(b.texted_at ?? '') || a.position - b.position);
  return open.map((r) => [
    r.id, r.name, prettyPhone(r.phone), ownerName(r.owner_id), r.status === 'texted' ? 'Texted' : 'Not texted yet',
    r.texted_at?.slice(0, 10) ?? '', r.posted_on ?? '', tidyAsk(r.asked_for), r.message, r.followup_2 ?? '', r.followup_3 ?? '', '',
  ]);
}

export interface FollowupRow { id?: string; phone?: string; followup_2?: string; followup_3?: string; said_no?: boolean }
export interface FollowupResult { matched: number; written: number; said_no: number; not_found: string[] }

/** Save follow-ups from a filled sheet, a thousand rows at a time. Admin only. */
export async function loadFollowups(rows: FollowupRow[]) {
  const total: FollowupResult = { matched: 0, written: 0, said_no: 0, not_found: [] };
  for (let i = 0; i < rows.length; i += 1000) {
    const r = await rpc<FollowupResult>('text_kit_followups', { p_rows: rows.slice(i, i + 1000) as unknown as Json });
    total.matched += r.matched;
    total.written += r.written;
    total.said_no += r.said_no;
    total.not_found.push(...r.not_found);
  }
  return total;
}

/** Zoom Phone's "new text" link: opens the Zoom app with the number in the To field. */
export const zoomSmsHref = (phone: string) => `zoomphonesms://${phone}`;

/** "(260) 667-3672" from "+12606673672". */
export function prettyPhone(e164: string) {
  const d = e164.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

/** Bark's form answers run together ("DetailsWhat type of project is this?Application - business…"); space them out. */
export const tidyAsk = (s: string | null) =>
  (s ?? '').replace(/^Details\s*/, '').replace(/\?(?=\S)/g, '? ').replace(/([a-z])(?=(What|How|Do you|Which)\b)/g, '$1 · ').trim();

/** Replies and opt-outs per version, to see which message works better. */
export function versionStats(rows: KitText[]) {
  return (['A', 'B'] as const).map((v) => {
    const mine = rows.filter((r) => r.version === v);
    const sent = mine.filter((r) => r.status !== 'to_text').length;
    const replied = mine.filter((r) => r.status === 'replied').length;
    const optedOut = mine.filter((r) => r.status === 'opted_out').length;
    return { version: v, total: mine.length, sent, replied, optedOut, rate: sent ? replied / sent : null };
  });
}

/* ------------------------------------------------------------------ reply assistant */
export type ThreadMessage = Database['public']['Tables']['text_thread']['Row'];
export type ReplyIntent = 'interested' | 'question' | 'not_now' | 'not_interested' | 'stop' | 'wrong_person' | 'other';
export interface ReplySuggestion { reply: string; intent: ReplyIntent; next_step: string; opted_out: boolean }

export const INTENT: Record<ReplyIntent, { label: string; tone: Tone }> = {
  interested: { label: 'Interested', tone: 'great' },
  question: { label: 'Has a question', tone: 'info' },
  not_now: { label: 'Not right now', tone: 'warn' },
  not_interested: { label: 'Said no', tone: 'bad' },
  stop: { label: 'Asked to stop', tone: 'bad' },
  wrong_person: { label: 'Wrong person', tone: 'neutral' },
  other: { label: 'Reply', tone: 'neutral' },
};

/** Everything said with one prospect: their replies, what we sent, and suggestions. */
export function useThread(kitId: number, enabled = true) {
  return useQuery({
    queryKey: ['text-thread', kitId],
    enabled,
    queryFn: async () => must(await supabase.from('text_thread').select('*').eq('kit_id', kitId).order('created_at').order('id')) as ThreadMessage[],
  });
}

/**
 * Ask the assistant for a reply. Pass what they texted back (saved to the conversation
 * first), or leave it out to get another draft for the same message.
 */
export async function suggestReply(kitId: number, theirMessage?: string, instruction?: string): Promise<ReplySuggestion> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/reply-assist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify({ kit_id: kitId, their_message: theirMessage || undefined, instruction: instruction || undefined }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? (res.status === 504 || res.status === 502 ? 'The assistant took too long. Try again.' : `Request failed (${res.status})`));
  return json as ReplySuggestion;
}

/** Save to the conversation what was actually sent (or a reply that came in). */
export const addToThread = (kitId: number, kind: 'them' | 'us', body: string) =>
  rpc<ThreadMessage>('text_thread_add', { p_kit: kitId, p_kind: kind, p_body: body });

export function usePlaybook() {
  return useQuery({
    queryKey: ['ai-playbook'],
    queryFn: async () => must(await supabase.from('ai_playbook').select('*').eq('id', 1).maybeSingle()) as Database['public']['Tables']['ai_playbook']['Row'] | null,
  });
}

export const savePlaybook = (body: string) => rpc('ai_playbook_save', { p_body: body });
