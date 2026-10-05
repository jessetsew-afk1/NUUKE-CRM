/**
 * Ready-to-send outreach for the lead on screen: texts for Zoom Phone, emails and a
 * call opener, written from what the lead actually wrote.
 *
 * The query comes first. We read it like a person would:
 *   1. Find the part they typed themselves (on Bark that's the text under "Message"),
 *      and the answers they picked ("New app from scratch", "$5,000 – $10,000"…).
 *   2. Pull out the details they gave us: their brand or business name, their website,
 *      a book / album / podcast / event they mentioned and when it comes out, what
 *      they already have ("I have the content"), and what they need help with.
 *   3. Work out what they want built (graphics, an app, a website…) from their words.
 * Only when there's no query do we write from the service they picked, and only when
 * that's empty too do we use a general version.
 *
 * The style follows what works in cold outreach today: give the reason for calling,
 * acknowledge they've probably had a lot of calls, mention their details so they know
 * it's not a robocall, ask one easy question about *their* thing, ask about interest
 * before asking for time, and end with a no-pressure last message. Plain punctuation
 * only: no long dashes, which read as machine-written.
 */
import type { Lead } from '@/lib/types';

export type Topic =
  | 'leads' | 'game' | 'animation' | 'ecommerce' | 'app' | 'software' | 'ai' | 'website'
  | 'social' | 'graphics' | 'branding' | 'design' | 'copy' | 'general';

export interface OutreachContext {
  lead: Pick<Lead, 'name' | 'query' | 'service' | 'platform' | 'lead_date' | 'attempts'>;
  repName: string;
  repTitle?: string | null;
  company?: string;
  pitch?: string | null;
  website?: string | null;
  bookingLink?: string | null;
  /** for tests: what "today" is */
  now?: Date;
}

export interface TextMsg { id: string; label: string; text: string; suggested?: boolean }
export interface EmailMsg { id: string; label: string; subject: string; body: string; suggested?: boolean }
export interface CallScript { opener: string; reason: string; questions: string[]; notInterested: string; alreadyHired: string }
export interface Fact { label: string; value: string }
export interface Outreach {
  topic: Topic;
  topicLabel: string;
  basedOn: 'query' | 'service' | 'general';
  /** one line: what they want, e.g. "Social media graphics for Healing Heart Co." */
  about: string;
  /** the details we picked out of their query, shown so the rep can check we read it right */
  facts: Fact[];
  texts: TextMsg[];
  emails: EmailMsg[];
  call: CallScript;
}

/* ------------------------------------------------------------ reading the query */
const FREE_LABEL = /^(?:message|your message|additional (?:details|information|info|comments)|details|project details|job details|description|project description|anything else[^?]*|other (?:details|information|info)|comments?|notes?|tell us (?:more|about)[^?]*|more (?:details|info)[^?]*|brief|project brief|summary|requirements|what (?:do you need|are you looking for)[^?]*)\s*[:?]?$/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const isQuestion = (l: string) => /\?\s*$/.test(l);
/** A line the client typed themselves, rather than a form label or a picked answer. */
const isProse = (l: string) =>
  (!isQuestion(l) && words(l) >= 7)
  || /[a-z][.!]\s+[A-Z]/.test(l)
  || (words(l) >= 4 && /^(?:i|i'm|i’m|i've|we|we're|we’re|my|our|hi|hello|hey|looking|need|we've)\b/i.test(l));

export interface ReadQuery { message: string; answers: { q: string; a: string }[] }

/** Splits a query into the bit they wrote and the form answers they picked. */
export function readQuery(raw: string | null | undefined): ReadQuery {
  const text = (raw ?? '')
    // "… Message Looking for…" pasted on one line: put the label on its own line
    .replace(/(^|\s)(Message|Additional details|Project details|Project description)\s*:?\s+(?=[A-Z])/g, '\n$2\n');
  const lines = text.split(/\r?\n|\s+\/\s+/).map((l) => l.trim()).filter(Boolean);
  const message: string[] = [];
  const answers: { q: string; a: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (FREE_LABEL.test(l)) {
      // everything after "Message" up to the next question is theirs
      while (i + 1 < lines.length && !isQuestion(lines[i + 1]) && !FREE_LABEL.test(lines[i + 1])) message.push(lines[++i]);
      continue;
    }
    const inline = l.match(/^([^:.!?]{2,60}\??)\s*:\s+(.+)$/);
    if (inline && !/^https?$/i.test(inline[1])) {
      if (FREE_LABEL.test(inline[1])) message.push(inline[2]);
      else answers.push({ q: inline[1].trim(), a: inline[2].trim() });
      continue;
    }
    if (isQuestion(l)) {
      if (words(l) >= 12 && (i + 1 >= lines.length || isQuestion(lines[i + 1]))) { message.push(l); continue; }
      const picked: string[] = [];
      while (i + 1 < lines.length && !isQuestion(lines[i + 1]) && !isProse(lines[i + 1]) && !FREE_LABEL.test(lines[i + 1])) picked.push(lines[++i]);
      answers.push({ q: l, a: picked.join(', ') });
      continue;
    }
    if (isProse(l)) { message.push(l); continue; }
    // Bark-style "Label" then "Answer" on the next line, without a question mark
    const next = lines[i + 1];
    if (next && !isQuestion(next) && !isProse(next) && !FREE_LABEL.test(next) && words(l) >= 2) {
      answers.push({ q: l, a: next });
      i++;
      continue;
    }
    answers.push({ q: '', a: l });
  }
  return { message: message.join(' ').replace(/\s+/g, ' ').trim(), answers };
}

/* ----------------------------------------------------------------- details */
type Verb = 'publish' | 'release' | 'launch' | 'open' | 'happen';
interface Timing { verb: Verb; when: string; date: { m: number; d: number } | null; month: number | null }
interface Named { kind: string; name: string; work: boolean; timing: Timing | null }
interface Details {
  message: string;
  answers: { q: string; a: string }[];
  brand: Named | null;
  works: Named[];
  site: string | null;
  socials: string[];
  /** a generic "your bakery" when they didn't give a name */
  biz: string | null;
  bizTiming: Timing | null;
  has: string[];
  posting: boolean;
  wants: string[];
  helpWith: string | null;
  existing: boolean;
  kind: string | null;
  start: string | null;
  budget: string | null;
  answered: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const DAY = String.raw`\d{1,2}(?:st|nd|rd|th)?`;
const DATE_RE = new RegExp(String.raw`\b(?:(${MONTH})\.?\s+(${DAY})\b|(${DAY})\s+(?:of\s+)?(${MONTH})\b)`, 'i');
const WHEN_RE = new RegExp(String.raw`\b(soon|any day now|(?:in|by|this|next|early|late|end of|the end of)\s+(?:${MONTH}\b|spring|summer|fall|autumn|winter|the (?:month|week|year)|a (?:few|couple of) (?:weeks|months)|\d+ (?:weeks|months|days)|week|month|year))`, 'i');
const VERB_RE = /\b(launch(?:ing|es|ed)?|go(?:ing)? live|(?:grand )?open(?:ing|s)?|releas(?:e|es|ing|ed)|com(?:ing|es) out|out on|available|publish(?:ing|es|ed)?|premier(?:e|es|ing)|drop(?:s|ping)?|debut(?:ing|s)?)\b/i;

const WORK_NOUNS = "children's book|picture book|cookbook|e-?book|book|novel|memoir|album|ep|single|song|film|movie|documentary|online course|course|program|programme|event|conference|festival|summit|workshop|retreat|campaign|game|podcast|show|series";
const ORG_NOUNS = 'clothing line|clothing brand|skincare line|skincare brand|brand|business|company|startup|start-up|store|shop|boutique|salon|spa|restaurant|cafe|café|bakery|clinic|practice|agency|gym|studio|church|ministry|school|academy|firm|nonprofit|non-profit|charity|organi[sz]ation|foundation|hotel|farm|label|line|collection|franchise|dealership|channel|band|app|website|product';
const MODIFIERS = String.raw`(?:(?!(?:and|or|the|a|an|is|was|to|for|with|of|in|on|at|my|our|i|we)\b)[\w'’&-]+\s+){0,2}`;
const OWNED_RE = new RegExp(String.raw`\b(?:my|our)\s+(${MODIFIERS})(${WORK_NOUNS}|${ORG_NOUNS})\b`, 'gi');
const FILLER = /^(?:my|our|a|an|the|new|own|small|first|second|third|debut|upcoming|latest|next|little|online|family|personal|local|current|existing|very|brand)$/i;
/** "our new SaaS product" → "SaaS product"; "my book" → "book" */
const kindOf = (mods: string, noun: string) => [...mods.trim().split(/\s+/).filter((w) => w && !FILLER.test(w)), noun].join(' ').toLowerCase().replace(/\bsaas\b/, 'SaaS');
const WORK_SET = new RegExp(`^(?:${WORK_NOUNS})$`, 'i');

const NAME = String.raw`[A-Z0-9][\w'’&!+.-]*(?:(?:\s+(?:&|and|of|the|n'|'n'|de|la|le|du|von|van))*\s+[A-Z0-9][\w'’&!+.-]*){0,6}`;
const NAME_RE = new RegExp(`^${NAME}`);
const STOP = new Set(['i', "i'm", 'i’m', "i've", "i'll", 'we', "we're", 'my', 'our', 'it', "it's", 'this', 'that', 'the', 'a', 'an', 'hi', 'hello', 'hey', 'please', 'thanks', 'thank', 'looking', 'need', 'also', 'and', 'but', 'so', 'just', 'currently', 'basically', 'we’re', 'is', 'will', 'would', 'can', 'could', 'should', 'have', 'has', 'available', 'launching', 'coming', 'instagram', 'facebook', 'tiktok', 'twitter', 'youtube', 'linkedin', 'pinterest', 'google', 'shopify', 'wordpress', 'wix', 'squarespace', 'etsy', 'amazon', 'canva', 'ios', 'android', 'apple', 'iphone', 'website', 'www', 'http', 'https', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'asap', 'usa', 'us', 'uk', 'ui', 'ux', 'ai', 'seo', 'crm']);
const ABBREV = /\b(?:co|inc|ltd|corp|llc|st|bros|intl)\.$/i;

/** Tidies a captured name: drop trailing punctuation unless it's "Co." and friends. */
function cleanName(raw: string): string | null {
  let n = raw.trim().replace(/[,;:!?)"”’]+$/, '');
  if (n.endsWith('.') && !ABBREV.test(n)) n = n.slice(0, -1);
  // "Dear Healing Heart (available" can't happen (no parens in NAME), but "Heart Available" can
  const parts = n.split(/\s+/);
  while (parts.length && STOP.has(parts[parts.length - 1].toLowerCase().replace(/[.'’]/g, ''))) parts.pop();
  while (parts.length && STOP.has(parts[0].toLowerCase().replace(/[.]/g, '')) && !(parts[0] === 'The' && parts.length > 1)) parts.shift();
  n = parts.join(' ');
  if (!n || n.length < 2 || STOP.has(n.toLowerCase())) return null;
  if (/^\d+$/.test(n)) return null;
  return n;
}

/** After "my book", find the name they gave it within the same sentence. */
function nameAfter(rest: string): string | null {
  const s = rest.split(/[.!?](?:\s|$)|\n/)[0].slice(0, 90);
  const quoted = s.match(/["“‘']([^"”’']{2,60})["”’']/);
  if (quoted) return cleanName(quoted[1]);
  const tries = [
    /^\s*(?:is|was|will be)?\s*(?:called|named|titled|is called|is named)\s+(.+)/i,
    /^\s*(?:is|,|:|-|–|—)\s*(.+)/,
    /^[^,:()–—]*?\s(?:-|–|—|:)\s*(.+)/,
    /^\s+(.+)/,
  ];
  for (const re of tries) {
    const m = s.match(re);
    if (!m) continue;
    const cand = m[1].replace(/^["“‘'(]/, '').match(NAME_RE)?.[0];
    if (cand) {
      const n = cleanName(cand);
      if (n) return n;
    }
  }
  return null;
}

function parseTiming(windowText: string, kind: string): Timing | null {
  const verbWord = windowText.match(VERB_RE)?.[1]?.toLowerCase() ?? '';
  const dm = windowText.match(DATE_RE);
  const wm = windowText.match(WHEN_RE);
  if (!dm && !wm && !/launch|open|releas|publish|coming out|go(?:ing)? live/.test(verbWord)) return null;
  if (!dm && !wm) return null; // "launching" with no time tells us nothing new
  let verb: Verb = defaultVerb(kind);
  if (/publish/.test(verbWord) && verb !== 'happen') verb = 'publish';
  else if (/releas|com(?:ing|es) out|out on|drop|debut|premier/.test(verbWord) && verb !== 'happen') verb = verb === 'publish' ? 'publish' : 'release';
  else if (/launch|go(?:ing)? live/.test(verbWord) && verb !== 'happen') verb = 'launch';
  else if (/open/.test(verbWord)) verb = 'open';
  if (dm) {
    const monthWord = (dm[1] ?? dm[4]).toLowerCase().slice(0, 3);
    const m = MONTHS.indexOf(monthWord);
    const d = parseInt(dm[2] ?? dm[3], 10);
    if (m >= 0 && d >= 1 && d <= 31) {
      return { verb, when: `${cap(MONTHS[m])}${MONTH_TAIL[m]} ${d}`, date: { m, d }, month: m };
    }
  }
  const w = wm![1].toLowerCase().replace(/\s+/g, ' ');
  const mm = w.match(new RegExp(MONTH, 'i'));
  const month = mm ? MONTHS.indexOf(mm[0].slice(0, 3).toLowerCase()) : null;
  return { verb, when: w.replace(new RegExp(MONTH, 'i'), (x) => fullMonth(x)), date: null, month };
}
const MONTH_TAIL = ['uary', 'ruary', 'ch', 'il', '', 'e', 'y', 'ust', 'tember', 'ober', 'ember', 'ember'];
const fullMonth = (x: string) => { const i = MONTHS.indexOf(x.slice(0, 3).toLowerCase()); return i >= 0 ? `${cap(MONTHS[i])}${MONTH_TAIL[i]}` : x; };

function defaultVerb(kind: string): Verb {
  if (/book|novel|memoir|cookbook/.test(kind)) return 'publish';
  if (/album|ep|single|song|film|movie|documentary/.test(kind)) return 'release';
  if (/event|conference|festival|summit|workshop|retreat/.test(kind)) return 'happen';
  if (/store|shop|boutique|salon|spa|restaurant|cafe|café|bakery|clinic|gym|studio|hotel/.test(kind)) return 'open';
  return 'launch';
}

const DOMAIN_RE = /(?<![@\w.-])(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9][a-z0-9-]*\.)+(?:com|co|net|org|io|ai|app|shop|store|biz|info|us|ca|uk|au|nz|ie|in|pk|ae|de|fr|es|it|nl|me|tv|art|design|studio|online|site|xyz|dev|health|life|church|blog|agency|com\.au|co\.uk|org\.uk|co\.nz))(?![a-z0-9-])(\/[^\s),]*)?/gi;
const SOCIAL_HOST = /^(?:instagram|facebook|fb|tiktok|twitter|x|linkedin|youtube|pinterest|threads|linktr)\./i;

/** "Healing Heart Co." from healingheartco.com, matching the words to the domain. */
function nameFromDomain(text: string, stem: string): string | null {
  const toks = [...text.matchAll(/[A-Za-z0-9][\w'’.-]*/g)].map((m) => ({ w: m[0], i: m.index!, e: m.index! + m[0].length }));
  let best: string | null = null;
  for (let a = 0; a < toks.length; a++) {
    if (!/^[A-Z0-9]/.test(toks[a].w)) continue;
    let plain = '';
    let withAnd = '';
    for (let b = a; b < Math.min(toks.length, a + 7); b++) {
      if (b > a) {
        const gap = text.slice(toks[b - 1].e, toks[b].i);
        if (!/^\s*(?:&\s*)?$/.test(gap)) break;
        if (gap.includes('&')) withAnd += 'and';
      }
      const c = toks[b].w.toLowerCase().replace(/[^a-z0-9]/g, '');
      plain += c;
      withAnd += c;
      const hit = plain === stem || withAnd === stem;
      if (hit && b > a) {
        const raw = text.slice(toks[a].i, toks[b].e);
        const n = cleanName(raw);
        if (n && (!best || n.length > best.length)) best = n;
      }
      if (!stem.startsWith(plain) && !stem.startsWith(withAnd)) break;
    }
  }
  return best;
}

const HAS_RE = /\b(?:i|we)(?:'ve|’ve| have)?\s+(?:already\s+)?(?:got|have|wrote|written|finished)\s+((?:the|my|our|all(?: of)?(?: the| my| our)?|some|a|most of the)\s+)?(content|copy|text|wording|captions|photos?|pictures|images|videos?|footage|logo|brand(?:ing| guidelines?| kit| colou?rs)?|designs?|mock-?ups?|wireframes?|sketch(?:es)?|script|domain|hosting|website|site|budget|idea|plan|products?|manuscript|book)\b/gi;
const POSTING_RE = /\baction(?:ing)?\s+(?:it|them|this)\b|\bpost(?:ing)?\s+(?:it|them|for (?:me|us))\b|\bmanag(?:e|ing)\s+(?:my|our|the)\s+(?:accounts?|pages?|socials?|social media|instagram|facebook|tiktok)\b|\bschedul(?:e|ing)\s+(?:the\s+)?(?:posts?|content)\b|\brun(?:ning)?\s+(?:my|our|the)\s+(?:accounts?|socials?|social media|pages?)\b|\bsomeone to post\b|\bsocial media manag/i;
const WANT_RE = /\b(looking for|in need of|needs?|needing|wants?|wanting|would like|i'd like|seeking|require|requires)\s+(?!to\s+(?:know|talk|discuss|chat|speak)\b)((?:[^.!?\n;]|\.(?=[a-z0-9])){4,160})/gi;
const KIND_RE = /\b(booking|appointment|scheduling|delivery|food delivery|fitness|workout|dating|social(?: media)?|marketplace|e-?learning|education(?:al)?|learning|food|restaurant|real estate|property|healthcare|health|medical|telehealth|taxi|ride[- ]?sharing|chat|messaging|finance|banking|fintech|budgeting|events?|travel|shopping|church|pet|sports?|music|meditation|wellness|crypto|trading|recipe|job|recruiting|hr|inventory|loyalty|rewards|ordering|parking|grocery|beauty|salon)\s+(app|application|platform|website|site|system|portal)\b/i;
const BIZ_RE = /\b(?:my|our)\s+((?:[a-z][a-z'&-]*\s){0,3}?(?:business|company|startup|start-up|brand|store|shop|salon|spa|restaurant|cafe|café|bakery|clinic|practice|agency|gym|studio|church|school|academy|firm|nonprofit|non-profit|charity|podcast|channel|product|band|team|club|hotel|farm|boutique|dealership|franchise|clothing line))\b/i;
const EXISTING_RE = /\b(?:existing|current|already have (?:a|an) (?:site|website|app|store|logo)|redesign|revamp|rebuild|re-?build|update|upgrade|fix|improve|outdated|old (?:site|website|app)|migrate|maintenance)\b/i;
const MARKETPLACE_RE = /bark|thumbtack|upwork|fiverr|clutch|houzz|angi|yelp|freelancer|guru|peopleperhour|toptal|99designs|sortlist|designrush|goodfirms|linkedin|craigslist|nextdoor/i;

/** "my" → "your", "I need" → "you need": their words, said back to them. */
function flip(s: string) {
  return s
    .replace(/\bI am\b/g, 'you are').replace(/\bI was\b/g, 'you were').replace(/\bwe are\b/gi, 'you are').replace(/\bwe were\b/gi, 'you were')
    .replace(/\bI['’]m\b/g, "you're").replace(/\bI['’]ve\b/g, "you've").replace(/\bI['’]ll\b/g, "you'll").replace(/\bI['’]d\b/g, "you'd")
    .replace(/\bwe['’]re\b/gi, "you're").replace(/\bwe['’]ve\b/gi, "you've")
    .replace(/\bmyself\b/gi, 'yourself').replace(/\bourselves\b/gi, 'yourselves').replace(/\bmine\b/gi, 'yours').replace(/\bours\b/gi, 'yours')
    .replace(/\b(?:my|our)\b/gi, 'your').replace(/\bme\b/g, 'you').replace(/\bus\b/g, 'you')
    .replace(/\bI\b/g, 'you').replace(/\bwe\b/gi, 'you');
}

/** Shortens a phrase at a natural break so it reads well when said back. */
function trimPhrase(s: string, max = 80) {
  let t = s.trim().replace(/\s+/g, ' ').replace(/[\s,]+$/, '');
  t = t.replace(/\b(?:https?:\/\/)?www\./gi, '');
  t = t.split(/\s+(?:so that|so|because|as|but|since|which|who|where|and then|and also|as well as|launching|coming out|available|opening|releasing|due)\b|,\s+(?:it|which|that|and|but|so|we|i)\b/i)[0];
  t = t.replace(/\s*\([^)]*\)?$/, '');
  if (t.length > 70 && t.includes(', ')) t = t.slice(0, t.indexOf(', '));
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '');
  return t.replace(/[\s,:;-]+$/, '').replace(/\s+(?:and|or|the|a|an|on|in|for|to|with|of|at)$/i, '');
}

function readDetails(query: string): Details {
  const { message, answers } = readQuery(query);
  const prose = message || answers.filter((x) => !x.q).map((x) => x.a).join('. ');
  const all = `${prose}\n${answers.map((x) => x.a).join('\n')}`;

  // websites and social handles
  const sites: string[] = [];
  const socials: string[] = [];
  for (const m of all.matchAll(DOMAIN_RE)) {
    const host = m[1].toLowerCase();
    if (SOCIAL_HOST.test(host)) { if (m[2] && m[2].length > 1) socials.push(`${host}${m[2]}`.replace(/\/$/, '')); continue; }
    if (!sites.includes(host)) sites.push(host);
  }
  for (const m of all.matchAll(/(?<![\w.])@([a-z0-9_.]{3,30})(?![\w@])/gi)) {
    const h = `@${m[1].replace(/\.$/, '')}`;
    if (!socials.includes(h)) socials.push(h);
  }

  // named things: "my book - Dear Healing Heart", "a salon called Glow Bar"
  const named: Named[] = [];
  const add = (kind: string, name: string | null, at: number, end: number) => {
    if (!name) return;
    const k = kind.replace(/\be-?book$/i, 'ebook').replace('start-up', 'startup');
    if (named.some((n) => n.name.toLowerCase() === name.toLowerCase())) return;
    if (sites.some((s) => s.startsWith(name.toLowerCase()))) return; // the "name" was the domain itself
    const win = prose.slice(at, end);
    const noun = k.split(' ').slice(-1)[0];
    named.push({ kind: k, name, work: WORK_SET.test(noun) || WORK_SET.test(k), timing: parseTiming(win, k) });
  };
  const owned = [...prose.matchAll(OWNED_RE)];
  owned.forEach((m, idx) => {
    const start = m.index! + m[0].length;
    const nextOwned = owned[idx + 1]?.index ?? prose.length;
    const sentenceEnd = (() => { const r = prose.slice(start).search(/[.!?](?:\s|$)(?<!\b(?:Co|Inc|Ltd|St|Corp)\.\s?)/); return r < 0 ? prose.length : start + r + 1; })();
    const stop = Math.min(nextOwned, Math.max(sentenceEnd, start + 1), start + 140);
    add(kindOf(m[1], m[2]), nameAfter(prose.slice(start, stop)), m.index!, stop);
  });
  for (const m of prose.matchAll(new RegExp(String.raw`\b(${MODIFIERS})(${WORK_NOUNS}|${ORG_NOUNS})\s+(?:called|named|titled)\s+["“‘']?(${NAME})`, 'g'))) {
    add(kindOf(m[1], m[2]), cleanName(m[3]), m.index!, Math.min(prose.length, m.index! + m[0].length + 60));
  }
  for (const m of prose.matchAll(new RegExp(String.raw`\b(?:I|we)\s+(?:run|own|founded|started|manage)\s+(${NAME})`, 'g'))) {
    add('business', cleanName(m[1]), m.index!, m.index! + m[0].length);
  }
  for (const m of prose.matchAll(new RegExp(String.raw`\b(?:owner|founder|co-founder|CEO|director)\s+(?:of|at)\s+(${NAME})`, 'g'))) {
    add('business', cleanName(m[1]), m.index!, m.index! + m[0].length);
  }
  // the domain usually spells the brand: healingheartco.com → "Healing Heart Co."
  for (const s of sites) {
    const stem = s.split('.')[0].replace(/-/g, '');
    const n = nameFromDomain(prose, stem);
    if (n && !named.some((x) => x.name.toLowerCase() === n.toLowerCase())) {
      const near = named.find((x) => !x.work && n.toLowerCase().includes(x.name.toLowerCase()));
      if (near) near.name = n;
      else named.unshift({ kind: 'brand', name: n, work: false, timing: null });
    }
  }
  // a product name in "my app/website X" is really the brand
  const brand = named.find((n) => !n.work) ?? null;
  const works = named.filter((n) => n.work);
  if (brand && !brand.timing) {
    // "My brand is launching soon - Healing Heart Co." the timing sits before the name
    const at = prose.toLowerCase().indexOf(brand.name.toLowerCase());
    const before = prose.slice(Math.max(0, at - 60), at);
    if (/\b(?:my|our)\s+\w+/.test(before)) brand.timing = parseTiming(before, brand.kind);
  }

  const bizRaw = brand ? null : prose.match(BIZ_RE)?.[1] ?? null;
  const bizMatch = bizRaw && !works.some((w) => w.kind.includes(bizRaw.toLowerCase().split(' ').slice(-1)[0]) || bizRaw.toLowerCase().endsWith(w.kind.split(' ').slice(-1)[0])) ? bizRaw.replace(/^(?:new|own|small|little)\s+/i, '') : null;
  const biz = bizMatch ? `your ${lower(bizMatch)}` : null;
  let bizTiming: Timing | null = null;
  if (biz && bizMatch) {
    const at = prose.toLowerCase().indexOf(bizMatch.toLowerCase());
    bizTiming = parseTiming(prose.slice(Math.max(0, at - 10), at + bizMatch.length + 60).split(/[.!?](?:\s|$)/)[0], bizMatch);
  }

  const has: string[] = [];
  for (const m of prose.matchAll(HAS_RE)) {
    const det = (m[1] ?? '').trim().toLowerCase();
    const thing = m[2].toLowerCase();
    const phrase = `${det ? flip(det) : /^(?:logo|website|site|domain|budget|idea|plan|manuscript|book)$/.test(thing) ? 'a' : 'the'} ${thing}`.replace(/^a (?=[aeiou])/, 'an ');
    if (!has.includes(phrase)) has.push(phrase);
  }

  const wants: string[] = [];
  let helpWith: string | null = null;
  for (const m of prose.matchAll(WANT_RE)) {
    const verb = m[1].toLowerCase();
    const obj = trimPhrase(m[2]);
    if (!obj || words(obj) < 2 && !/^\w{4,}$/.test(obj)) continue;
    const help = obj.match(/^(?:some\s+)?help\s+(?:with|on|for)\s+(.+)/i);
    if (help && !helpWith) helpWith = trimPhrase(help[1]);
    wants.push(`${verb} ${obj}`);
  }

  const startAns = answers.find((x) => /\bwhen\b|start|timeline|time ?frame|deadline|done by/i.test(x.q) && x.a && !/recommended|flexible|not sure|no rush|whenever|unsure|^n\/?a$/i.test(x.a));
  const budgetAns = answers.find((x) => /budget|spend|price|cost/i.test(x.q) && x.a && !/not sure|unsure|^n\/?a$|prefer not/i.test(x.a));
  const kindMatch = all.match(KIND_RE);

  return {
    message, answers,
    brand, works,
    site: sites[0] ?? null,
    socials: socials.slice(0, 3),
    biz, bizTiming,
    has: has.slice(0, 3),
    posting: POSTING_RE.test(prose),
    wants: wants.slice(0, 3),
    helpWith,
    existing: EXISTING_RE.test(all),
    kind: kindMatch ? lower(kindMatch[1]).replace(/^e-?learning$/, 'e-learning') : null,
    start: startAns?.a ?? null,
    budget: budgetAns?.a ?? null,
    answered: answers.map((x) => `${x.q} ${x.a}`).join('\n'),
  };
}

/* ------------------------------------------------------------- recognising */
const TOPIC_RULES: { topic: Topic; re: RegExp }[] = [
  { topic: 'leads', re: /\b(?:more|get|getting|generate|generating|new|extra|increase|grow|growing|boost)\s+(?:my\s+|our\s+)?(?:leads?|customers?|clients?|sales|bookings?|enquiries|inquiries|calls|traffic|patients|members|followers)\b|lead\s*gen|marketing|\bseo\b|google ads|facebook ads|instagram ads|meta ads|\bppc\b|advertis|paid ads|email campaign/i },
  { topic: 'game', re: /\b(?:game|games|gaming|unity|unreal|roblox|augmented reality|virtual reality|ar\/vr|ar\b|vr\b|metaverse|oculus|quest)\b/i },
  { topic: 'animation', re: /animat|explainer|motion graphic|video edit|\bcartoon|\b2d\b|\b3d (?:model|render|anim)|whiteboard video|promo video/i },
  { topic: 'ecommerce', re: /shopify|e-?commerce|online (?:store|shop)|woo-?commerce|sell (?:online|my products)|amazon (?:store|listing)|etsy|bigcommerce|dropship/i },
  { topic: 'app', re: /\b(?:mobile app|apps?|ios|android|iphone|ipad|play store|app store|mobile application|flutter|react native)\b/i },
  { topic: 'software', re: /software|saas|\bcrm\b|\berp\b|portal|dashboard|web app|database|internal tool|booking system|management system|inventory system|\bapi\b/i },
  { topic: 'ai', re: /\b(?:ai|a\.i\.|chat\s?bot|gpt|chatgpt|openai|llm|machine learning|automation|automate|automated workflow|zapier|voice agent)\b/i },
  { topic: 'website', re: /website|web site|landing page|wordpress|webflow|\bwix\b|squarespace|web design|web develop|\bsite\b|homepage/i },
  { topic: 'social', re: /social (?:media|platforms?|channels?|accounts?|posts?|content)|\bsocials\b|instagram|facebook page|tiktok|\breels\b|content calendar|linkedin posts?|youtube channel|influencer|community manag/i },
  { topic: 'graphics', re: /graphic design|graphics?\b|\bflyers?\b|\bposters?\b|brochures?|\bbanners?\b|book cover|album cover|cover design|cover art|\bcover for (?:my|our|the|a|an)\b|infographic|menu design|\bcanva\b|illustrat|print design|\bmerch\b|t-?shirt design|thumbnails?|carousel|post designs?|pitch deck|presentation design/i },
  { topic: 'branding', re: /\blogo\b|branding|brand identity|rebrand|brand guide|style guide|business cards?|packaging|label design|visual identity/i },
  { topic: 'design', re: /ui\s*\/\s*ux|\bux\b|\bui\b|user experience|figma|wireframe|prototype|product design/i },
  { topic: 'copy', re: /copy ?writ|content writ|\bblog|article|ghost ?writ|script ?writ|\bcopy for\b|web copy|newsletter/i },
];

const TOPIC_LABEL: Record<Topic, string> = {
  leads: 'Getting more leads', ai: 'AI & automation', game: 'Game / AR / VR', animation: 'Animation & video', ecommerce: 'E-commerce',
  app: 'Mobile app', software: 'Custom software', website: 'Website', social: 'Social media', graphics: 'Graphic design',
  branding: 'Logo & branding', design: 'UI/UX design', copy: 'Copywriting', general: 'Their project',
};

/** Hits per topic, weighted: what they typed counts most, picked answers less, form questions barely. */
function score(parts: { text: string; weight: number }[]) {
  const s = new Map<Topic, { pts: number; first: number }>();
  let offset = 0;
  for (const { text, weight } of parts) {
    TOPIC_RULES.forEach(({ topic, re }, order) => {
      for (const m of text.matchAll(new RegExp(re.source, 'gi'))) {
        const cur = s.get(topic) ?? { pts: 0, first: Infinity };
        cur.pts += weight;
        cur.first = Math.min(cur.first, offset + m.index! + order * 0.001);
        s.set(topic, cur);
      }
    });
    offset += text.length + 1;
  }
  return s;
}
const best = (m: Map<Topic, { pts: number; first: number }>) =>
  [...m.entries()].sort((a, b) => b[1].pts - a[1].pts || a[1].first - b[1].first)[0]?.[0];

function pickTopic(d: Details, service: string): { topic: Topic; basedOn: Outreach['basedOn'] } {
  // names and web addresses say nothing about the job ("Pixel Apps Studio", "mygame.io")
  const scrub = (t: string) => {
    let x = t.replace(DOMAIN_RE, ' ');
    for (const n of [d.brand, ...d.works]) if (n) x = x.split(n.name).join(' ');
    return x;
  };
  const q = score([
    { text: scrub(d.message), weight: 3 },
    { text: scrub(d.answers.map((x) => x.a).join('\n')), weight: 2 },
    { text: d.answers.map((x) => x.q).join('\n'), weight: 0.5 },
  ]);
  const fromQuery = best(q);
  if (fromQuery) return { topic: fromQuery, basedOn: 'query' };
  const s = best(score([{ text: service, weight: 1 }]));
  if (s) return { topic: s, basedOn: 'service' };
  return { topic: 'general', basedOn: d.message || d.answers.length ? 'query' : 'general' };
}

/* ------------------------------------------------------------------ helpers */
const lower = (s: string) => s.replace(/\s+/g, ' ').trim().split(' ')
  .map((w) => (/[A-Z]/.test(w.slice(1)) ? w : w.toLowerCase())).join(' ');
const an = (word: string) => (/^(?:[aeiou]|hon|hour)/i.test(word.trim()) && !/^(?:uni|use|usu|euro|one)/i.test(word.trim()) ? 'an' : 'a');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lcFirst = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^(?:I\b|I'm)/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function firstName(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/);
  if (parts.length > 1 && /^(?:mr|mrs|ms|miss|dr|pastor|rev|reverend|prof|father|sister|coach)\.?$/i.test(parts[0])) {
    const t = parts[0].replace(/\.$/, '');
    return `${t.charAt(0).toUpperCase()}${t.slice(1).toLowerCase()}${/^(?:mr|mrs|ms|dr)$/i.test(t) ? '.' : ''} ${parts[1].charAt(0).toUpperCase()}${parts[1].slice(1)}`;
  }
  const n = parts[0] ?? '';
  if (!n || n.includes('@') || /\d/.test(n) || n.length < 2) return 'there';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

function whenPhrase(date: string | null | undefined, now: Date) {
  if (!date) return '';
  const days = Math.floor((now.getTime() - Date.parse(`${date}T12:00:00`)) / 864e5);
  if (days <= 1) return ' yesterday';
  if (days <= 4) return ' a few days ago';
  if (days <= 10) return ' last week';
  if (days <= 45) return ' a few weeks back';
  if (days <= 120) return ' a couple of months back';
  return ' a while back';
}

type Source = 'market' | 'form' | 'website' | 'referral' | 'other' | 'none';
function sourceOf(platform: string | null | undefined): { kind: Source; name: string } {
  const p = (platform ?? '').trim();
  if (!p) return { kind: 'none', name: '' };
  if (MARKETPLACE_RE.test(p)) return { kind: 'market', name: p };
  if (/facebook|instagram|meta|tiktok|google|ads?\b/i.test(p)) return { kind: 'form', name: p.replace(/\s*ads?$/i, '') };
  if (/website|web|site|form|landing/i.test(p)) return { kind: 'website', name: p };
  if (/referr/i.test(p)) return { kind: 'referral', name: p };
  return { kind: 'other', name: p };
}

/** Is a mentioned date already behind us? Uses the lead date to work out the year. */
function isPast(t: Timing, leadDate: string | null | undefined, now: Date) {
  const ref = leadDate ? new Date(`${leadDate}T12:00:00`) : now;
  if (t.date || t.month !== null) {
    const m = t.date?.m ?? t.month!;
    const d = t.date?.d ?? 28;
    let when = new Date(ref.getFullYear(), m, d, 23, 59);
    if (when.getTime() < ref.getTime() - 21 * 864e5) when = new Date(ref.getFullYear() + 1, m, d, 23, 59);
    return when.getTime() < now.getTime();
  }
  // "soon": after six weeks, it's probably happened
  return now.getTime() - ref.getTime() > 42 * 864e5;
}

/** " on May 5", " in November", " next month", or "" for "soon". */
function whenWords(t: Timing) {
  if (t.date) return ` on ${t.when}`;
  if (t.when === 'soon' || !t.when) return t.when === 'soon' ? ' soon' : '';
  return ` ${t.when}`;
}

/** One easy, friendly question about the thing they told us about. */
function detailQuestion(n: Named, t: Timing, leadDate: string | null | undefined, now: Date, short: boolean): string {
  const ref = short ? `the ${n.kind.split(' ').slice(-1)[0]}` : n.name;
  const past = isPast(t, leadDate, now);
  const on = t.date ? ` on ${t.when}` : /^(?:in|by|this|next|early|late|end|the end)/.test(t.when) ? ` ${t.when}` : '';
  const forWhen = t.date ? ` for ${t.when}` : on;
  switch (t.verb) {
    case 'publish':
    case 'release':
      if (past) return on ? `Did ${ref} come out${on} like you planned?` : `Did ${ref} end up coming out?`;
      return on ? `Is ${ref} still on track${forWhen}?` : `When is ${ref} coming out?`;
    case 'open':
      if (past) return on ? `Did ${ref} open${on} like you planned?` : `Is ${ref} open yet?`;
      return on ? `Is ${ref} still on track to open${on}?` : `Is ${ref} open yet?`;
    case 'happen':
      if (past) return `How did ${ref} go?`;
      return on ? `Is ${ref} still on${forWhen}?` : `Is ${ref} still going ahead?`;
    default:
      if (past) return on ? `Did ${ref} launch${on} like you planned?` : `Has ${ref} launched yet?`;
      return on ? `Is ${ref} still on track to launch${on}?` : `Has ${ref} launched yet?`;
  }
}

/* ---------------------------------------------------------------- the copy */
interface TopicCopy {
  /** fills "the ___ post you made": "graphic design" */
  noun: string;
  /** what they want, no "for …": "social media graphics" */
  want: string;
  /** a short way to refer back to it: "the graphics" */
  thing: string;
  /** one sharp question, as a full sentence */
  hook: string;
  /** an insight for the first email */
  problem: string;
  /** something useful we can send */
  offer: string;
  subject: string;
  offerSubject: string;
  /** "We design social media graphics": what we do, in their terms */
  we: string;
  questions: string[];
}

function copyFor(topic: Topic, d: Details, q: string, service: string): TopicCopy {
  const kind = d.kind ? `${d.kind} ` : '';
  const answered = d.answered;
  switch (topic) {
    case 'graphics': {
      const social = /social|instagram|facebook|tiktok|linkedin|pinterest|\bposts?\b|reels?|stories/i.test(q);
      const thing = /album cover|cover (?:for|art|design)[^.]{0,30}\b(?:album|ep|single|song)/i.test(q) ? 'album cover'
        : /book cover|cover (?:design|art)|cover for (?:my|our|the|a|an)/i.test(q) ? 'book cover'
        : /flyer/i.test(q) && /poster/i.test(q) ? 'flyers and posters' : /flyer/i.test(q) ? 'flyers' : /poster/i.test(q) ? 'posters' : /brochure/i.test(q) ? 'brochure'
        : /menu/i.test(q) ? 'menu design' : /pitch deck|presentation/i.test(q) ? 'pitch deck'
        : /merch|t-?shirt|apparel/i.test(q) ? 'merch designs' : /infographic/i.test(q) ? 'infographics'
        : /thumbnail/i.test(q) ? 'YouTube thumbnails' : social ? 'social media graphics' : 'graphics';
      const hasContent = d.has.some((h) => /content|copy|text|captions|photos?|pictures|images/.test(h));
      const hook = social
        ? hasContent
          ? d.posting ? 'Since you already have the content, do you want us to design the posts and get them scheduled too, or just hand you the files?' : 'Since you already have the content, is it just the designs you need, or posting them as well?'
          : 'Which platforms matter most to you right now: Instagram, Facebook or TikTok?'
        : thing === 'book cover' ? (d.has.some((h) => /manuscript|book/.test(h)) ? 'Do you have a style in mind for the cover, or a few covers you love?' : 'Is the manuscript finished, and do you have a style in mind for the cover?')
        : 'Do you have brand colours and fonts already, or are we starting fresh?';
      return {
        noun: 'graphic design',
        want: /cover|brochure|pitch deck|menu design/.test(thing) ? `${an(thing)} ${thing}` : thing,
        thing: thing === 'social media graphics' ? 'the graphics' : `the ${thing}`,
        hook,
        problem: social
          ? 'With social graphics, what makes the difference is a consistent look people recognise in their feed, so every post feels like the same brand.'
          : 'Good design starts with what the piece has to do, whether that is a click, a sale or a sign-up, not just how it looks.',
        offer: social ? 'a couple of sample post designs in your brand style' : /cover/.test(thing) ? 'two rough cover ideas to react to' : 'a quick mock-up so you can see the direction first',
        subject: cap(thing), offerSubject: social ? 'A couple of sample posts' : 'A quick mock-up',
        we: social ? (d.posting ? 'We design social media graphics, and we can handle the posting too' : 'We design social media graphics for growing brands')
          : thing === 'graphics' ? 'We do graphic design' : `We design ${/s$/.test(thing) ? thing : `${thing}s`}`,
        questions: [
          social ? (d.socials.length || /instagram|facebook|tiktok|linkedin|pinterest/i.test(q) ? 'How many posts a week are you aiming for?' : 'Which platforms matter most: Instagram, Facebook or TikTok?')
            : /cover/.test(thing) ? 'Is it for print, ebook, or both?' : 'Where will these be used, online or in print?',
          social && hasContent ? (d.posting ? 'Do you want us to schedule and post everything, or hand the files over?' : 'You have the content ready. Do you want us to post it too, or just design it?')
            : social ? 'Do you have the content ready, or do you need help with the captions too?'
            : /cover/.test(thing) ? 'Are there a few covers in your genre that you love?' : 'Do you have the text and images ready?',
          'Do you have brand colours, fonts or a logo we should match?',
        ],
      };
    }
    case 'social': return {
      noun: 'social media',
      want: d.posting || /manag/i.test(q) ? 'help running your social media' : 'social media content',
      thing: 'the social media',
      hook: 'Is it more the content itself you need, or someone to keep the posting consistent?',
      problem: 'Most accounts don\'t need more posts. They need a simple plan, a consistent look and someone who shows up every week.',
      offer: 'a sample two-week content plan with a few post designs',
      subject: 'Your social media', offerSubject: 'A two-week content plan',
      we: 'We run social media for small brands, from the designs to the posting',
      questions: ['Which platforms matter most to you?', 'How often are you posting right now, and who does it?', d.has.length ? 'What do you still need from us besides what you already have?' : 'Do you have photos and content, or should we create them?', 'What would a good month on social look like for you?'],
    };
    case 'branding': {
      const logo = /\blogo\b/i.test(q) && !/branding|brand identity|rebrand/i.test(q);
      const word = logo ? 'logo' : 'branding';
      return {
        noun: logo ? 'logo design' : 'branding',
        want: d.existing ? `a refresh of your ${word}` : logo ? 'a new logo' : 'new branding',
        thing: `the ${word}`,
        hook: 'Is this a refresh of what you have, or starting from a blank page?',
        problem: 'Good branding starts with what people should feel and remember about you, not with colours and fonts.',
        offer: 'two or three quick style directions to react to',
        subject: logo ? 'Your logo' : 'Your branding', offerSubject: 'A few style directions',
        we: 'We design logos and brand identities',
        questions: ['What should people feel when they see the brand?', 'Is this a refresh, or starting fresh?', 'Where will it be used most: online, packaging or signage?'],
      };
    }
    case 'app': {
      const platformsAnswered = /ios|android|iphone|both/i.test(answered);
      return {
        noun: kind ? `${kind}app` : 'mobile app',
        want: d.existing ? `updates to your ${kind}app` : kind ? `${an(kind)} ${kind}app` : 'a new app',
        thing: `the ${kind}app`,
        hook: platformsAnswered ? 'What do people do today instead of using an app like this?' : 'Are you thinking iPhone and Android from day one, or starting with one? It changes the budget a lot.',
        problem: d.existing
          ? 'With an app that\'s already out there, the quickest wins usually come from fixing the two or three things users complain about most, not a full rebuild.'
          : 'What usually decides how these go isn\'t the design. It\'s scoping a first version you can launch in weeks, then growing it from real users.',
        offer: d.existing ? 'a short review of the current app with the first things I\'d fix' : 'a one-page scope for a first version of the app, with a realistic price range',
        subject: 'Your app idea', offerSubject: 'A first version of the app',
        we: kind ? `We build ${kind}apps` : 'We build mobile apps',
        questions: [
          'What do people do today instead of using an app like this?',
          ...(platformsAnswered ? [] : ['iPhone, Android, or both from day one?']),
          'What does success look like 90 days after launch?',
        ],
      };
    }
    case 'website': return {
      noun: 'website',
      want: d.existing ? `a refresh of ${d.site ?? 'your website'}` : 'a new website',
      thing: 'the website',
      hook: 'What\'s the one thing you want visitors to do that they\'re not doing now: call, book or buy?',
      problem: 'Most sites look fine. The ones that pay for themselves are built around one clear action, like a call, a booking or a sale.',
      offer: d.existing ? 'a short video walkthrough of what I\'d change first on your current site' : 'a one-page plan for the site with the pages, features and a price range',
      subject: 'Your website', offerSubject: 'A plan for the site',
      we: 'We design and build websites',
      questions: ['What should visitors do on the site that they don\'t do now?', d.site ? `Is ${d.site} the site we'd be replacing, or is this something new?` : 'Is there a site we\'re replacing, or starting fresh?', 'Who\'ll update the content after launch?'],
    };
    case 'ecommerce': {
      const shopify = /shopify/i.test(q);
      return {
        noun: shopify ? 'Shopify' : 'online store',
        want: `${d.existing ? 'improving your online store' : shopify ? 'a Shopify store' : 'an online store'}`,
        thing: 'the store',
        hook: 'Is it more about getting people to the store, or getting more of them to check out?',
        problem: 'With online stores, most of the money is lost at checkout and on mobile, not on the homepage.',
        offer: 'a quick review of your checkout and product pages, with the three fixes I\'d make first',
        subject: 'Your online store', offerSubject: 'A checkout idea',
        we: 'We build and fix online stores',
        questions: [shopify ? 'Is the store already on Shopify, or are we setting it up?' : 'Shopify, WooCommerce, or starting from scratch?', 'Is it more traffic you need, or more of your visitors buying?', 'Which integrations are a must: payments, shipping, inventory?'],
      };
    }
    case 'leads': {
      const who = q.match(/\b(customers?|clients?|leads?|sales|bookings?|patients|members|enquiries|inquiries|calls|traffic|followers)\b/i)?.[1]?.toLowerCase() ?? 'customers';
      return {
        noun: 'marketing',
        want: `getting more ${who}`,
        thing: 'the marketing',
        hook: 'What\'s a good customer worth to you? That tells us how hard to push on ads versus SEO.',
        problem: 'When leads dry up it\'s rarely one thing. It\'s usually where the traffic comes from and what happens in the first minute after someone lands.',
        offer: 'a 10-minute recorded look at where your leads are leaking, so you can watch it whenever',
        subject: `More ${who}`, offerSubject: 'Where your leads are leaking',
        we: 'We run marketing that brings in leads, from ads to SEO',
        questions: ['What makes a lead a good one for you, and what\'s one worth?', 'Where do your best customers come from today?', 'What have you tried that stopped working?'],
      };
    }
    case 'software': {
      const thing = /\bcrm\b/i.test(q) ? 'CRM' : /portal/i.test(q) ? 'portal' : /dashboard/i.test(q) ? 'dashboard' : /web app/i.test(q) ? 'web app' : /saas/i.test(q) ? 'SaaS product' : /\b(?:platform|system)\b/i.test(q) && d.kind ? `${d.kind} system` : 'software';
      const plain = thing === 'software';
      return {
        noun: plain ? 'software' : thing,
        want: plain ? 'custom software' : `${an(thing)} custom ${thing}`,
        thing: `the ${thing}`,
        hook: 'What\'s the manual process this would replace, and who would use it every day?',
        problem: 'Custom software goes wrong when it\'s built around a feature list instead of the one workflow that\'s eating your team\'s time.',
        offer: 'a one-page plan for the first workflow we\'d build, with a price range',
        subject: plain ? 'Your software project' : `Your ${thing}`, offerSubject: 'The first workflow',
        we: plain ? 'We build custom software' : `We build custom ${thing === 'CRM' ? 'CRMs' : `${thing}s`}`,
        questions: ['What manual process does this replace, and who uses it daily?', 'Which tools does it need to connect to?', 'Is there a date it has to be live by?'],
      };
    }
    case 'game': {
      const xr = /\b(?:ar|vr|augmented|virtual reality|metaverse|oculus|quest)\b/i.test(q) || /ar\/vr/i.test(q);
      const thing = xr ? 'AR/VR experience' : 'game';
      return {
        noun: xr ? 'AR/VR' : 'game',
        want: `${an(thing)} ${thing}`,
        thing: `the ${thing}`,
        hook: 'Who\'s it for, and on what: phone, PC or a headset?',
        problem: `${xr ? 'AR/VR projects' : 'Games'} live or die on the first playable version, so the smart move is getting one in your hands early.`,
        offer: 'a short outline of what a first playable version would include, with the cost',
        subject: xr ? 'Your AR/VR project' : 'Your game idea', offerSubject: 'A first playable version',
        we: xr ? 'We build AR and VR experiences' : 'We build games',
        questions: ['Who\'s the player, and on what hardware?', 'Is it for marketing, training or a commercial release?', 'Any games or apps you\'d point to as a reference?'],
      };
    }
    case 'animation': {
      const thing = /explainer/i.test(q) ? 'explainer video' : /\b3d\b/i.test(q) ? '3D animation' : /\b2d\b/i.test(q) ? '2D animation' : /promo/i.test(q) ? 'promo video' : 'animation';
      return {
        noun: thing === 'animation' ? 'animation' : thing,
        want: `${an(thing)} ${thing}`,
        thing: `the ${thing}`,
        hook: 'Where will the video run, and what should people do after watching it?',
        problem: 'The animation is the easy part. What makes it work is a tight script and knowing exactly where it will be shown.',
        offer: 'a rough script outline and a style reference, so you can see the direction before committing',
        subject: `Your ${thing}`, offerSubject: 'A script outline',
        we: `We make ${thing === 'animation' ? 'animations' : `${thing}s`}`,
        questions: ['Where will it run, and what should viewers do next?', 'Do you have a script, or should we write it?', 'How long should it be, and who signs it off?'],
      };
    }
    case 'design': return {
      noun: 'UI/UX design',
      want: 'UI/UX design',
      thing: 'the design work',
      hook: 'Is there a product already, or are we designing it before it\'s built?',
      problem: 'Most products don\'t need prettier screens. They need fewer steps between the user and the thing they came to do.',
      offer: 'a quick review of your current flow, or a sketch of the main screens if you\'re starting fresh',
      subject: 'Your design project', offerSubject: 'A quick design review',
      we: 'We design apps and websites',
      questions: ['Is there a live product, or is this before development?', 'Where do users get stuck today?', 'Who are the main users?'],
    };
    case 'copy': return {
      noun: 'copywriting',
      want: 'copywriting',
      thing: 'the copy',
      hook: 'Which page or piece isn\'t pulling its weight right now?',
      problem: 'Copy that converts comes from knowing the one doubt that stops your reader, not from more words.',
      offer: 'a rewrite of one section, so you can judge the style before committing',
      subject: 'Your copy project', offerSubject: 'A sample rewrite',
      we: 'We write copy for websites and campaigns',
      questions: ['Which page is underperforming, and how do you know?', 'What doubt stops your reader from buying?', 'Is there a tone or brand voice we should match?'],
    };
    case 'ai': {
      const thing = /chat\s?bot/i.test(q) ? 'chatbot' : /voice/i.test(q) ? 'AI voice agent' : /automat/i.test(q) ? 'automation' : 'AI project';
      return {
        noun: thing === 'automation' ? 'automation' : thing === 'AI project' ? 'AI' : thing,
        want: thing === 'automation' ? 'automating part of your work' : `${an(thing)} ${thing}`,
        thing: `the ${thing}`,
        hook: 'Which repetitive task is eating the most hours right now?',
        problem: 'The AI projects that pay off start with one boring, repetitive task, not a big platform.',
        offer: 'a one-page plan for automating that first task, with a cost',
        subject: 'Your AI project', offerSubject: 'An automation plan',
        we: 'We build AI and automation tools',
        questions: ['Which repetitive task eats the most hours?', 'What would you need to see to trust it without a human checking?', 'Which tools does it need to plug into?'],
      };
    }
    default: {
      const s = service ? lower(service) : '';
      return {
        noun: s || 'project',
        want: s || 'your project',
        thing: s ? `the ${s}` : 'the project',
        hook: 'What\'s the one outcome that would make this a win for you?',
        problem: 'Most projects go sideways in the planning, not the building, so we start by pinning down exactly what a win looks like.',
        offer: 'a one-page plan with a realistic price range',
        subject: s ? cap(s) : 'Your project', offerSubject: 'A project plan',
        we: s ? `We help with ${s}` : 'We\'re a design and development studio',
        questions: ['What made you post the request when you did?', 'What would make this a win six months from now?', 'Have you worked with an agency before? What went wrong?'],
      };
    }
  }
}

/* ---------------------------------------------------------------- building */
/** Plain punctuation only: long dashes become commas, number ranges become "to". */
export function tidy(s: string) {
  return s
    .replace(/(\d)\s*[–—]\s*(?=[$£€]?\d)/g, '$1 to ')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/([A-Za-z])\.\.(?=\s|$)/g, '$1.')
    .replace(/\.([,?!])/g, (m, p, off, str) => (/\b(?:Co|Inc|Ltd|St|Corp)$/.test(str.slice(0, off)) ? m : p))
    .replace(/,\s*,/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([,.?!])/g, '$1');
}

export function buildOutreach(ctx: OutreachContext): Outreach {
  const now = ctx.now ?? new Date();
  const query = (ctx.lead.query ?? '').trim();
  const service = (ctx.lead.service ?? '').trim();
  const d = readDetails(query);
  const { topic, basedOn } = pickTopic(d, service);
  const qText = basedOn === 'service' ? service : `${d.message}\n${d.answers.map((x) => x.a).join('\n')}`;
  const c = copyFor(topic, d, qText, service);
  const leadDate = ctx.lead.lead_date;

  const name = firstName(ctx.lead.name);
  const rep = (ctx.repName || 'the team').split(/\s+/)[0];
  const company = ctx.company || 'NUUKE';
  const pitch = (ctx.pitch || 'a design and development studio').replace(/\.$/, '');
  const src = sourceOf(ctx.lead.platform);
  const market = src.kind === 'market';
  const when = whenPhrase(leadDate, now);
  const attempts = ctx.lead.attempts ?? 0;

  // Their details, written a few ways
  const brand = d.brand;
  const work = d.works[0] ?? null;
  const brandRef = brand?.name ?? d.biz;
  const workRef = work ? `your ${work.kind}, ${work.name}` : null;
  const forText = brandRef && workRef ? `for ${brandRef} and ${workRef}` : brandRef ? `for ${brandRef}` : workRef ? `for ${workRef}` : '';
  const forCall = brand
    ? `It was for ${brand.name}, your ${brand.kind}${workRef ? `, and also ${workRef}` : ''}.`
    : d.biz ? `It was for ${d.biz}${workRef ? `, and also ${workRef}` : ''}.`
    : workRef ? `It was for ${workRef}.` : '';
  const refThing = `${c.thing}${brandRef ? ` for ${brandRef}` : work ? ` for ${work.name}` : ''}`;

  // The one easy question: about their book / launch if they mentioned one, else the job
  const timed = [...d.works.filter((w) => w.timing?.date), ...d.works.filter((w) => w.timing && !w.timing.date),
    ...(brand?.timing ? [brand] : []), ...d.works.filter((w) => !w.timing)];
  const focus = timed[0] ?? null;
  const askTiming = focus?.timing ?? (focus?.work ? { verb: defaultVerb(focus.kind), when: '', date: null, month: null } as Timing : null);
  const easy = (short: boolean) => {
    if (focus && askTiming) return detailQuestion(focus, askTiming, leadDate, now, short);
    if (d.biz && d.bizTiming) return detailQuestion({ kind: d.biz.replace(/^your /, ''), name: d.biz, work: false, timing: d.bizTiming }, d.bizTiming, leadDate, now, true);
    return null;
  };
  const easyQ = easy(false);
  const easyCall = easy(true);

  // Their words said back to them
  const echo = (() => {
    if (d.has.length && d.helpWith) return `You mentioned you already have ${list(d.has)} and need help with ${flip(d.helpWith)}.`;
    const w = d.wants[0];
    const m = w?.match(/^(looking for|in need of|would like|i'd like|\S+)\s+(.+)$/i);
    const verb = m?.[1].toLowerCase() ?? '';
    const said = /^looking for|seeking/.test(verb) ? 'you were looking for' : /would like|i'd like/.test(verb) ? "you'd like" : /^want/.test(verb) ? 'you want' : 'you need';
    const wantPart = m ? `${said} ${flip(m[2])}` : '';
    if (wantPart && d.has.length) return `You mentioned ${wantPart}, and that you already have ${list(d.has)}.`;
    if (d.has.length) return `You mentioned you already have ${list(d.has)}.`;
    return wantPart ? `You mentioned ${wantPart}.` : '';
  })();

  // Where they asked, and how we refer to it
  const postRef = market ? `the ${c.noun} post you made${when}`
    : src.kind === 'form' ? `the form you filled in on ${src.name}${when} about ${c.want}`
    : src.kind === 'website' ? `the enquiry you sent through our website${when} about ${c.want}`
    : src.kind === 'referral' ? `your referral${when} about ${c.want}`
    : `your ${c.noun} enquiry${when}`;
  const postFor = forText ? `${postRef}${when && market ? ',' : ''} ${forText}` : postRef;
  const youPosted = market ? `You posted on ${src.name}${when} about ${c.want}`
    : src.kind === 'form' ? `You filled in our form on ${src.name}${when} about ${c.want}`
    : src.kind === 'website' ? `You got in touch through our website${when} about ${c.want}`
    : src.kind === 'referral' ? `You were referred to us${when} about ${c.want}`
    : `You got in touch${when} about ${c.want}`;

  const sign = [`${ctx.repName || rep}`, `${ctx.repTitle ? `${ctx.repTitle}, ` : ''}${company}`, ctx.website].filter(Boolean).join('\n');
  const booking = ctx.bookingLink ? `\n\nIf it's easier, grab a time that suits you here: ${ctx.bookingLink}` : '';
  const luck = work ? `Best of luck with ${work.name}!` : brand?.timing ? `Best of luck with the ${brand.name} launch!` : brand ? `Best of luck with ${brand.name}!` : '';
  const subjectLine = brandRef && brand ? `${cap(c.thing.replace(/^the /, ''))} for ${brand.name}` : c.subject;

  const texts: TextMsg[] = [
    {
      id: 'first', label: 'First text (after a missed call)', suggested: attempts === 0,
      text: `Hi ${name}, it's ${rep} from ${company}. I just tried calling about ${postFor}. Is it still something you need help with? Reply STOP to opt out.`,
    },
    {
      id: 'interrupt', label: market ? 'Pattern interrupt (they\'ve had lots of calls)' : 'Quick check-in',
      suggested: attempts === 0 && market,
      text: market
        ? `Hi ${name}, ${rep} from ${company} here. You've probably had a lot of calls since your ${c.noun} post on ${src.name}, so I'll skip the pitch. Quick question: ${lcFirst(easyQ ?? 'Is it still open, or already sorted?')}`
        : `Hi ${name}, ${rep} from ${company}. You asked us about ${c.want}${forText ? ` ${forText}` : ''}${when}. ${easyQ ?? 'Did you end up finding someone, or is it still open?'}`,
    },
    ...(market ? [{
      id: 'friendly', label: 'Friendly opener',
      text: `Hey ${name}, how's it going? Have you been getting a lot of spam calls since that ${c.noun} post you made${when}${brandRef ? ` for ${brandRef}` : ''}? I'm ${rep} from ${company}, and I promise I'm not one of the spammy ones. Is it still on your list?`,
    }] : []),
    {
      id: 'question', label: 'One sharp question', suggested: attempts > 0 && attempts < 3,
      text: `Hi ${name}, ${rep} at ${company}, with one quick question on ${refThing}. ${c.hook}`,
    },
    {
      id: 'voicemail', label: 'After leaving a voicemail',
      text: `Hi ${name}, I just left you a short voicemail about ${refThing}. Happy to send over ${c.offer}, or is a quick call this week easier? ${rep}, ${company}`,
    },
    {
      id: 'choice', label: 'Reply-with-a-number check-in', suggested: attempts > 0 && attempts < 3,
      text: `Hi ${name}, quick one on ${refThing}: 1) still need help 2) on hold 3) already sorted? Just reply with the number. ${rep}, ${company}`,
    },
    {
      id: 'breakup', label: 'Last text (no more chasing)', suggested: attempts >= 3,
      text: `Hi ${name}, I'll stop chasing on ${refThing} after this one. If it comes back on your list, this is my direct line and I'm happy to pick it up any time. ${luck ? `${luck} ` : 'All the best, '}${rep}`,
    },
  ];

  const emails: EmailMsg[] = [
    {
      id: 'intro', label: 'First email', suggested: attempts < 2, subject: subjectLine,
      body: [
        `Hi ${name},`,
        `${youPosted}${forText ? ` ${forText}` : ''}. ${market ? 'I\'m guessing a few agencies have been in touch since, so I\'ll keep this short.' : 'I wanted to follow up personally.'}`,
        `${echo ? `${echo} ` : ''}${c.problem}`,
        `We're ${pitch}, and this is exactly the kind of work our team does.`,
        `${easyQ ? `${easyQ} ` : ''}If you still need a hand with ${c.thing}, I'd love to help.`,
        sign,
      ].join('\n\n'),
    },
    {
      id: 'offer', label: 'Follow-up with something useful', suggested: attempts >= 2 && attempts < 3, subject: c.offerSubject,
      body: `Hi ${name},\n\nFollowing up on ${refThing}. Rather than another "just checking in" email, I can put together ${c.offer}, no call needed.\n\nWant me to send it over?${booking}\n\n${sign}`,
    },
    {
      id: 'breakup', label: 'Closing the loop', suggested: attempts >= 3, subject: 'Closing the loop',
      body: `Hi ${name},\n\nI haven't heard back about ${refThing}, so I'm guessing the timing is off or you've found someone. Either is completely fine.\n\nHave you put it on hold for now? If it comes back, just reply here and I'll pick it straight up.${luck ? `\n\n${luck}` : ''}\n\n${sign}`,
    },
  ];

  const opener = market
    ? `Hey ${name}, it's ${rep} from ${company}. The reason I'm calling is, you might be getting a lot of spam calls, but this is about ${postRef}. ${forCall} ${easyCall ?? 'Is that still something you need help with?'}`
    : `Hi ${name}, it's ${rep} from ${company}. The reason I'm calling is ${postRef}. ${forCall} ${easyCall ?? 'Is it still something you\'re working on?'}`;

  // Questions that use what they told us, then the job's own questions
  const upcoming = timed.find((n) => n.timing && !isPast(n.timing, leadDate, now));
  const extraQs = [
    ...(upcoming?.timing ? [`Does this need to be ready before ${upcoming.name} ${upcoming.timing.verb === 'happen' ? 'happens' : upcoming.timing.verb === 'open' ? 'opens' : upcoming.timing.verb === 'launch' ? 'launches' : 'comes out'}${whenWords(upcoming.timing)}?`] : []),
    ...(d.site && topic !== 'website' ? [`Is ${d.site} live yet, and should everything match it?`] : []),
  ];
  const call: CallScript = {
    opener,
    reason: `${c.we}. ${echo ? `${echo} ` : ''}I just wanted to see if you still need a hand with that, and ask a couple of quick questions to see if we're a fit.`,
    questions: [...extraQs, ...c.questions, 'Have you spoken to anyone else about it yet? What didn\'t feel right?'].slice(0, 6),
    notInterested: 'Totally fair, you didn\'t ask me to call today. Just so I know, is it the timing, or have you already found someone?',
    alreadyHired: `Good to hear it's moving. If anything changes with ${refThing}, would it be OK if I checked back in a few weeks?`,
  };

  // What we read, for the rep to check at a glance
  const timingText = (t: Timing | null) => {
    if (!t) return '';
    const v = { publish: 'out', release: 'out', launch: 'launching', open: 'opening', happen: '' }[t.verb];
    return ` · ${`${v}${whenWords(t)}`.trim()}`;
  };
  const facts: Fact[] = [];
  if (basedOn !== 'general') facts.push({ label: 'Wants', value: `${cap(c.want.replace(/^your /, ''))}${d.posting && topic === 'graphics' ? ', and posting it' : ''}` });
  if (brand) facts.push({ label: cap(brand.kind), value: `${brand.name}${timingText(brand.timing)}` });
  else if (d.biz) facts.push({ label: 'Business', value: `${cap(d.biz.replace(/^your /, ''))}${timingText(d.bizTiming)}` });
  for (const w of d.works) facts.push({ label: cap(w.kind), value: `${w.name}${timingText(w.timing)}` });
  if (d.site) facts.push({ label: 'Website', value: d.site });
  if (d.socials.length) facts.push({ label: 'Socials', value: d.socials.join(', ') });
  if (d.has.length) facts.push({ label: 'Already has', value: list(d.has) });
  if (d.start) facts.push({ label: 'Start', value: d.start });
  if (d.budget) facts.push({ label: 'Budget', value: d.budget });

  const all = { texts, emails, call };
  const clean = <T,>(x: T): T => JSON.parse(JSON.stringify(x), (_k, v) => (typeof v === 'string' ? tidy(v) : v));
  const out = clean(all);
  return {
    topic, topicLabel: TOPIC_LABEL[topic], basedOn,
    about: tidy(`${cap(c.want.replace(/^your /, ''))}${brand ? ` for ${brand.name}` : d.biz ? ` for ${d.biz}` : ''}`),
    facts: clean(facts),
    texts: out.texts, emails: out.emails, call: out.call,
  };
}
