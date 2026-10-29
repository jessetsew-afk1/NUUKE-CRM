/**
 * Text kits: leads picked for one salesperson to text from Zoom Phone, each with its
 * message ready to paste. Zoom can open a new text on a number but can't fill in the
 * words, so "Send text" copies the message and opens Zoom; the rep pastes and sends.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { must, rpc, supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
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

export function useMarkText() {
  const qc = useQueryClient();
  return async (id: number, status: KitStatus | 'reset') => {
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

/**
 * The kits are written in Isaiah's voice. When someone else sends one it opens with
 * their own name instead ("Ashley here, from Isaiah's team."), so nobody texts as Isaiah.
 */
export function signedMessage(message: string, sender: string | null | undefined) {
  const first = (sender ?? '').trim().split(/\s+/)[0];
  if (!first || /^isaiah$/i.test(first)) return message;
  return message
    .replace(/\bIsaiah here\./, `${first} here, from Isaiah's team.`)
    .replace(/\bSoy Isaiah\./, `Soy ${first}, del equipo de Isaiah.`);
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
