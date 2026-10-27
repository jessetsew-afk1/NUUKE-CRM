/**
 * The playbook's words, filled in for one prospect. The setter says the memo in her
 * own words; everything else is copied and pasted as is.
 */
import type { Prospect, ReplyKind } from '@/data/outreach';

export interface ScriptContext {
  setter: string;
  closer: string;
  bookingLink: string;
  bookingMessage: string;
  closerFirst: string;
  payPerHeld: number;
}

const first = (s: string) => s.trim().split(/\s+/)[0] || s;

/** The voice memo, as a guide to say out loud (25 to 35 seconds). */
export function memoScript(p: Prospect, c: ScriptContext) {
  return [
    `Hi ${p.name}, this is ${first(c.setter)} with Nuuke.`,
    // ⟨…⟩ is a prompt she says in her own words (the playbook's brackets).
    `${first(c.closer)}, who runs Nuuke, emailed you${p.hook ? ` about ⟨${p.hook.split(';')[0].replace(/^"|"$/g, '').trim()}⟩` : ''}.`,
    p.line ?? '',
    'We take episodes like that and cut them into short clips that get women to book a discovery call.',
    `Would you be open to a quick call so ${first(c.closer)} can make you three free clips from one of your episodes? No cost, and you keep them either way.`,
  ].filter(Boolean);
}

export const afterMemo = (p: Prospect, c: ScriptContext) =>
  `Hi ${p.name}, ${first(c.setter)} from Nuuke. ${first(c.closer)} emailed you recently. Quick voice note above.`;

export function followUp(p: Prospect) {
  if (p.status === 'info') return `Hi ${p.name}, did the two examples come through? Happy to answer anything, and the free clips are still on offer.`;
  return p.follow_step === 0
    ? `Hi ${p.name}, just bumping my voice note. Happy to send the free clips if you're curious. A yes or no is totally fine.`
    : `Last note from me, ${p.name}. If now's not the time, no worries at all. I'll leave you be.`;
}

export function bookingText(p: Prospect, c: ScriptContext) {
  return c.bookingMessage.replace(/\[name\]/gi, p.name).replace(/\[link\]/gi, c.bookingLink);
}

export const REPLIES: { kind: ReplyKind; label: string; answer: (p: Prospect, c: ScriptContext) => string; after: (c: ScriptContext) => string }[] = [
  {
    kind: 'yes', label: 'Yes / tell me more',
    answer: (p, c) => bookingText(p, c),
    after: () => 'Mark Booked once they pick a time.',
  },
  {
    kind: 'cost', label: 'How much does it cost?',
    answer: (_p, c) => `The clips are free. ${first(c.closer)} walks through options on the call; it depends on how much content you have.`,
    after: () => 'Never quote a price.',
  },
  {
    kind: 'info', label: 'Send me info',
    answer: (_p, c) => `Sure! ${first(c.closer)} will email you two examples today.`,
    after: (c) => `${first(c.closer)} is told automatically. You'll be asked to check in again in 2 days.`,
  },
  {
    kind: 'have_someone', label: 'We already have someone',
    answer: () => 'Totally fair. If you ever want a second set of eyes, the free clips offer stands.',
    after: () => 'They come off your list.',
  },
  {
    kind: 'not_interested', label: 'Not interested / stop',
    answer: () => 'Thanks for letting me know. Have a great week!',
    after: () => 'They come off your list. Never message again.',
  },
  {
    kind: 'medical', label: 'A health or medical question',
    answer: () => "That's a great question for your own patients. I'm just on the marketing side!",
    after: () => 'Then steer back to the free clips.',
  },
  {
    kind: 'other', label: 'Something else',
    answer: (_p, c) => `Thanks for getting back to me! Happy to have ${first(c.closer)} walk you through it on a quick call.`,
    after: (c) => `Stuck? Text ${first(c.closer)}.`,
  },
];

export const reminderText = (p: Prospect, c: ScriptContext, time: string) => `Looking forward to tomorrow, ${p.name}! ${first(c.closer)} will call at ${time}.`;
export const noShowText = (p: Prospect, c: ScriptContext) =>
  `No worries, ${p.name}, things come up! Want to grab another time? ${c.bookingLink}`;
