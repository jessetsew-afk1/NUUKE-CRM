/**
 * Ready-to-send outreach for the lead on screen: texts for Zoom Phone, emails and a
 * call opener, written from what the lead actually asked for.
 *
 * How it decides what to say:
 *   1. Read the lead's query (their own words) for what they want, e.g. "a booking app",
 *      "more customers", "a Shopify store". If the query names nothing,
 *   2. fall back to the service they picked, and if that's empty too,
 *   3. use a general version.
 * It also pulls out who it's for ("your dog grooming business"), where they posted
 * (Bark, Upwork, a Facebook form…) and how long ago, and writes those in.
 *
 * The style follows what works in cold outreach today: open with the reason you're
 * calling, acknowledge they've likely been flooded with calls, ask one easy question,
 * ask about interest before asking for time, keep texts under ~300 characters and
 * emails short, and end with a no-pressure break-up message.
 */
import type { Lead } from '@/lib/types';

export type Topic =
  | 'leads' | 'ai' | 'game' | 'animation' | 'ecommerce' | 'app' | 'software' | 'website' | 'design' | 'branding' | 'copy' | 'general';

export interface OutreachContext {
  lead: Pick<Lead, 'name' | 'query' | 'service' | 'platform' | 'lead_date' | 'attempts'>;
  repName: string;
  repTitle?: string | null;
  company?: string;
  pitch?: string | null;
  website?: string | null;
  bookingLink?: string | null;
}

export interface TextMsg { id: string; label: string; text: string; suggested?: boolean }
export interface EmailMsg { id: string; label: string; subject: string; body: string; suggested?: boolean }
export interface CallScript { opener: string; reason: string; questions: string[]; notInterested: string; alreadyHired: string }
export interface Outreach {
  topic: Topic;
  topicLabel: string;
  basedOn: 'query' | 'service' | 'general';
  about: string;
  texts: TextMsg[];
  emails: EmailMsg[];
  call: CallScript;
}

/* ------------------------------------------------------------- recognising */
const TOPIC_RULES: { topic: Topic; re: RegExp }[] = [
  { topic: 'leads', re: /\b(?:more|get|getting|generate|generating|new|extra|increase|grow|growing|boost)\s+(?:my\s+|our\s+)?(?:leads?|customers?|clients?|sales|bookings?|enquiries|inquiries|calls|traffic|patients|members|followers)\b|lead\s*gen|marketing|\bseo\b|google ads|facebook ads|meta ads|\bppc\b|social media (?:marketing|management|ads)|advertis|paid ads|email campaign/i },
  { topic: 'game', re: /\b(?:game|games|gaming|unity|unreal|roblox|augmented reality|virtual reality|ar\/vr|ar\b|vr\b|metaverse|oculus|quest)\b/i },
  { topic: 'animation', re: /animat|explainer|motion graphic|video edit|\bcartoon|\b2d\b|\b3d (?:model|render|anim)|whiteboard video|promo video/i },
  { topic: 'ecommerce', re: /shopify|e-?commerce|online (?:store|shop)|woo-?commerce|sell (?:online|my products)|amazon (?:store|listing)|etsy|bigcommerce|dropship/i },
  { topic: 'app', re: /\b(?:mobile app|apps?|ios|android|iphone|ipad|play store|app store|mobile application|flutter|react native)\b/i },
  { topic: 'software', re: /software|saas|\bcrm\b|\berp\b|portal|dashboard|web app|platform|\bsystem\b|database|internal tool|booking system|inventory|\bapi\b/i },
  { topic: 'ai', re: /\b(?:ai|a\.i\.|chat\s?bot|gpt|chatgpt|openai|llm|machine learning|automation|automate|automated workflow|zapier|voice agent)\b/i },
  { topic: 'website', re: /website|web site|landing page|wordpress|webflow|\bwix\b|squarespace|web design|web develop|\bsite\b|homepage/i },
  { topic: 'design', re: /ui\s*\/\s*ux|\bux\b|\bui\b|user experience|figma|wireframe|prototype|product design/i },
  { topic: 'branding', re: /\blogo\b|branding|brand identity|rebrand|graphic design|brand guide|business card|packaging/i },
  { topic: 'copy', re: /copy ?writ|content writ|\bblog|article|ghost ?writ|script ?writ|\bcopy for\b|web copy|newsletter/i },
];

const TOPIC_LABEL: Record<Topic, string> = {
  leads: 'Getting more leads', ai: 'AI & automation', game: 'Game / AR / VR', animation: 'Animation & video', ecommerce: 'E-commerce',
  app: 'Mobile app', software: 'Custom software', website: 'Website', design: 'UI/UX design', branding: 'Branding', copy: 'Copywriting',
  general: 'Their project',
};

function score(text: string) {
  const s = new Map<Topic, number>();
  TOPIC_RULES.forEach(({ topic, re }, i) => {
    const hits = text.match(new RegExp(re.source, 'gi'))?.length ?? 0;
    if (hits) s.set(topic, hits * 10 - i * 0.01); // earlier rules win ties
  });
  return s;
}

function pickTopic(query: string, service: string): { topic: Topic; basedOn: Outreach['basedOn'] } {
  const fromQuery = score(query);
  // Someone who says they want more customers wants marketing, whatever the service says.
  if (/\b(?:more|get|generate|new|increase|grow|boost)\s+(?:my\s+|our\s+)?(?:leads?|customers?|clients?|sales|bookings?|patients)\b/i.test(query)) {
    return { topic: 'leads', basedOn: 'query' };
  }
  const best = (m: Map<Topic, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const q = best(fromQuery);
  if (q) return { topic: q, basedOn: 'query' };
  const s = best(score(service));
  if (s) return { topic: s, basedOn: 'service' };
  return { topic: 'general', basedOn: 'general' };
}

const KIND_RE = /\b(booking|appointment|scheduling|delivery|food delivery|fitness|workout|dating|social(?: media)?|marketplace|e-?learning|education(?:al)?|learning|food|restaurant|real estate|property|healthcare|health|medical|telehealth|taxi|ride[- ]?sharing|chat|messaging|finance|banking|fintech|budgeting|events?|travel|shopping|church|pet|sports?|music|meditation|wellness|crypto|trading|recipe|job|recruiting|hr|inventory|loyalty|rewards|ordering|parking|grocery|beauty|salon)\s+(?:app|application|platform|website|site|system|portal)\b/i;
const BIZ_RE = /\b(?:my|our)\s+((?:[a-z][a-z'&-]*\s){0,3}?(?:business|company|startup|start-up|brand|store|shop|salon|spa|restaurant|cafe|café|bakery|clinic|practice|agency|gym|studio|church|school|academy|firm|nonprofit|non-profit|charity|podcast|channel|product|band|team|club|hotel|farm|boutique|dealership|franchise))\b/i;
const EXISTING_RE = /\b(?:existing|current|already have|redesign|revamp|rebuild|re-?build|update|upgrade|fix|improve|outdated|old (?:site|website|app)|migrate|maintenance)\b/i;
const MARKETPLACE_RE = /bark|thumbtack|upwork|fiverr|clutch|houzz|angi|yelp|freelancer|guru|peopleperhour|toptal|99designs|sortlist|designrush|goodfirms|linkedin|craigslist|nextdoor/i;

const lower = (s: string) => s.replace(/\s+/g, ' ').trim().split(' ')
  .map((w) => (/[A-Z]/.test(w.slice(1)) ? w : w.toLowerCase())).join(' ');
const an = (word: string) => (/^[aeiou]/i.test(word.trim()) ? 'an' : 'a');

function firstName(name: string | null | undefined) {
  const n = (name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!n || n.includes('@') || /\d/.test(n) || n.length < 2) return 'there';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

function whenPhrase(date: string | null | undefined) {
  if (!date) return '';
  const days = Math.floor((Date.now() - Date.parse(`${date}T12:00:00`)) / 864e5);
  if (days <= 1) return ' yesterday';
  if (days <= 4) return ' a few days ago';
  if (days <= 10) return ' last week';
  if (days <= 45) return ' a few weeks back';
  if (days <= 120) return ' a couple of months back';
  return ' a while back';
}

/** "posted on Bark about …" and "the request you posted on Bark". */
function wherePhrase(platform: string | null | undefined) {
  const p = (platform ?? '').trim();
  if (!p) return { postedAbout: 'got in touch about', source: '', market: false };
  if (MARKETPLACE_RE.test(p)) return { postedAbout: `posted on ${p} about`, source: `the request you posted on ${p}`, market: true };
  if (/facebook|instagram|meta|tiktok|google|ads?\b/i.test(p)) {
    const where = p.replace(/\s*ads?$/i, '');
    return { postedAbout: `filled in our form on ${where} about`, source: `the form you filled in on ${where}`, market: false };
  }
  if (/website|web|site|form|landing/i.test(p)) return { postedAbout: 'got in touch through our website about', source: 'the enquiry you sent through our website', market: false };
  if (/referr/i.test(p)) return { postedAbout: 'were referred to us about', source: 'your referral', market: false };
  return { postedAbout: `got in touch via ${p} about`, source: `your enquiry via ${p}`, market: false };
}

/* ---------------------------------------------------------------- the copy */
interface TopicCopy {
  /** what they asked for, e.g. "a booking app for your bakery" */
  about: string;
  /** a short way to refer back to it: "the app", "your marketing" */
  ref: string;
  hook: string;
  problem: string;
  offer: string;
  subject: string;
  offerSubject: string;
  reason: string;
  questions: string[];
}

function copyFor(topic: Topic, d: { kind: string | null; biz: string | null; existing: boolean; query: string }): TopicCopy {
  const forBiz = d.biz ? ` for ${d.biz}` : '';
  const kind = d.kind ? `${d.kind} ` : '';
  switch (topic) {
    case 'app': return {
      about: `${d.existing ? 'updating your' : an(kind || 'app')} ${kind}app${forBiz}`.replace(/\s+/g, ' '),
      ref: `the ${kind}app`,
      hook: 'are you thinking iPhone and Android from day one, or starting with one? It changes the budget a lot.',
      problem: d.existing
        ? 'With an app that\'s already out there, the quickest wins usually come from fixing the two or three things users complain about most — not a full rebuild.'
        : 'What usually decides how these go isn\'t the design — it\'s scoping a first version you can launch in weeks, then growing it from real users.',
      offer: d.existing ? 'a short review of the current app with the first things I\'d fix' : 'a one-page scope for a first version of the app, with a realistic price range',
      subject: 'Your app brief', offerSubject: 'App scope',
      reason: `we build ${kind}apps${d.biz ? ' for businesses like yours' : ''}, and I had a couple of quick questions on yours.`,
      questions: ['What do people do today instead of using an app like this?', 'iPhone, Android, or both from day one?', 'What does success look like 90 days after launch?'],
    };
    case 'website': return {
      about: d.existing ? `a refresh of your website${forBiz}` : `a new website${forBiz}`,
      ref: 'the website',
      hook: 'what\'s the one thing you want visitors to do that they\'re not doing now — call, book or buy?',
      problem: 'Most sites look fine. The ones that pay for themselves are built around one clear action — a call, a booking, a sale.',
      offer: d.existing ? 'a short video walkthrough of what I\'d change first on your current site' : 'a one-page plan for the site — pages, features and a price range',
      subject: 'Your website', offerSubject: 'Website plan',
      reason: 'I had a quick idea on the site and two questions to see if we\'re even a fit.',
      questions: ['What should visitors do on the site that they don\'t do now?', 'Is there a site we\'re replacing, or starting fresh?', 'Who\'ll update the content after launch?'],
    };
    case 'ecommerce': return {
      about: `${d.existing ? 'improving your online store' : 'an online store'}${forBiz}`,
      ref: 'the store',
      hook: 'is it more about getting people to the store, or getting more of them to check out?',
      problem: 'With online stores, most of the money is lost at checkout and on mobile — not on the homepage.',
      offer: 'a quick review of your checkout and product pages, with the three fixes I\'d make first',
      subject: 'Your store', offerSubject: 'Checkout idea',
      reason: 'we build and fix online stores, and I wanted to ask where yours is at.',
      questions: ['Shopify, WooCommerce, or starting from scratch?', 'Is it more traffic you need, or more of your visitors buying?', 'Which integrations are non-negotiable — payments, shipping, inventory?'],
    };
    case 'leads': {
      const who = d.query.match(/\b(customers?|clients?|leads?|sales|bookings?|patients|members|enquiries|inquiries|calls|traffic)\b/i)?.[1]?.toLowerCase() ?? 'customers';
      return {
        about: `getting more ${who}${forBiz}`,
        ref: d.biz ? `the marketing for ${d.biz}` : 'your marketing',
        hook: 'what\'s a good customer worth to you? That tells us how hard to push on ads versus SEO.',
        problem: 'When leads dry up it\'s rarely one thing — it\'s usually where the traffic comes from and what happens in the first minute after someone lands.',
        offer: 'a 10-minute recorded look at where your leads are leaking, so you can watch it whenever',
        subject: `More ${who}`, offerSubject: 'Lead leak review',
        reason: `you mentioned wanting more ${who}, and I had a couple of quick questions to see whether we can actually help.`,
        questions: ['What makes a lead a good one for you, and what\'s one worth?', 'Where do your best customers come from today?', 'What have you tried that stopped working?'],
      };
    }
    case 'software': {
      const thing = /\bcrm\b/i.test(d.query) ? 'CRM' : /portal/i.test(d.query) ? 'portal' : /dashboard/i.test(d.query) ? 'dashboard' : /web app/i.test(d.query) ? 'web app' : /saas/i.test(d.query) ? 'SaaS product' : `${kind}software`.trim();
      return {
        about: `a custom ${thing}${forBiz}`,
        ref: `the ${thing}`,
        hook: 'what\'s the manual process this would replace, and who\'d use it every day?',
        problem: 'Custom software goes wrong when it\'s built around a feature list instead of the one workflow that\'s eating your team\'s time.',
        offer: 'a one-page plan for the first workflow we\'d build, with a price range',
        subject: 'Your software project', offerSubject: 'First workflow',
        reason: `we build custom ${thing === 'software' ? 'software' : `${thing}s`}, and I wanted to understand the problem you're solving.`,
        questions: ['What manual process does this replace, and who uses it daily?', 'Which tools does it need to connect to?', 'Is there a date it has to be live by?'],
      };
    }
    case 'game': {
      const xr = /\b(?:ar|vr|augmented|virtual reality|metaverse|oculus|quest)\b/i.test(d.query) || /ar\/vr/i.test(d.query);
      const thing = xr ? 'AR/VR experience' : 'game';
      return {
        about: `${an(thing)} ${thing}${forBiz}`,
        ref: `the ${thing}`,
        hook: 'who\'s it for, and on what — phone, PC or a headset?',
        problem: `${xr ? 'AR/VR projects' : 'Games'} live or die on the first playable version, so the smart move is getting one in your hands early.`,
        offer: 'a short outline of what a first playable version would include, with the cost',
        subject: xr ? 'Your AR/VR project' : 'Your game idea', offerSubject: 'First playable',
        reason: `we build ${xr ? 'AR/VR experiences' : 'games'}, and I wanted to hear where yours is at.`,
        questions: ['Who\'s the player, and on what hardware?', 'Is it for marketing, training or a commercial release?', 'Any games or apps you\'d point to as a reference?'],
      };
    }
    case 'animation': {
      const thing = /explainer/i.test(d.query) ? 'explainer video' : /3d/i.test(d.query) ? '3D animation' : /2d/i.test(d.query) ? '2D animation' : 'animation';
      return {
        about: `${an(thing)} ${thing}${forBiz}`,
        ref: `the ${thing}`,
        hook: 'where will the video run, and what should people do after watching it?',
        problem: 'The animation is the easy part — what makes it work is a tight script and knowing exactly where it\'ll be shown.',
        offer: 'a rough script outline and a style reference, so you can see the direction before committing',
        subject: 'Your animation', offerSubject: 'Script outline',
        reason: `we make ${thing}s, and I had two quick questions on yours.`,
        questions: ['Where will it run, and what should viewers do next?', 'Do you have a script, or should we write it?', 'How long should it be, and who signs it off?'],
      };
    }
    case 'design': return {
      about: `UI/UX design${forBiz}`,
      ref: 'the design work',
      hook: 'is there a product already, or are we designing it before it\'s built?',
      problem: 'Most products don\'t need prettier screens — they need fewer steps between the user and the thing they came to do.',
      offer: 'a quick review of your current flow, or a sketch of the main screens if you\'re starting fresh',
      subject: 'Your design project', offerSubject: 'Design review',
      reason: 'we design apps and websites, and I wanted to ask where the product is at.',
      questions: ['Is there a live product, or is this before development?', 'Where do users get stuck today?', 'Who are the main users?'],
    };
    case 'branding': {
      const thing = /\blogo\b/i.test(d.query) && !/brand/i.test(d.query) ? 'logo' : 'branding';
      return {
        about: `${d.existing ? 'refreshing your' : thing === 'logo' ? 'a new' : 'new'} ${thing}${forBiz}`,
        ref: `the ${thing}`,
        hook: 'is this a refresh of what you have, or starting from a blank page?',
        problem: 'Good branding starts with what customers misunderstand about you — not with colours and fonts.',
        offer: 'two or three quick style directions to react to',
        subject: thing === 'logo' ? 'Your logo' : 'Your branding', offerSubject: 'Style directions',
        reason: 'we do branding, and I wanted to ask a couple of questions before suggesting anything.',
        questions: ['What do customers misunderstand about you today?', 'Is this a refresh or a full rebrand?', 'Where will it be used most — online, packaging, signage?'],
      };
    }
    case 'copy': return {
      about: `copywriting${forBiz}`,
      ref: 'the copy',
      hook: 'which page or piece isn\'t pulling its weight right now?',
      problem: 'Copy that converts comes from knowing the one objection that stops your reader — not from more words.',
      offer: 'a rewrite of one section, so you can judge the style before committing',
      subject: 'Your copy project', offerSubject: 'Sample rewrite',
      reason: 'we write copy for websites and campaigns, and I had a quick question on yours.',
      questions: ['Which page is underperforming, and how do you know?', 'What objection stops your reader from buying?', 'Is there a tone or brand voice we should match?'],
    };
    case 'ai': {
      const thing = /chat\s?bot/i.test(d.query) ? 'chatbot' : /voice/i.test(d.query) ? 'AI voice agent' : /automat/i.test(d.query) ? 'automation' : 'AI project';
      return {
        about: `${thing === 'automation' ? 'automating part of' : `${an(thing)} ${thing} for`} ${d.biz ?? 'your business'}`,
        ref: `the ${thing}`,
        hook: 'which repetitive task is eating the most hours right now?',
        problem: 'The AI projects that pay off start with one boring, repetitive task — not a big platform.',
        offer: 'a one-page plan for automating that first task, with a cost',
        subject: 'Your AI project', offerSubject: 'Automation plan',
        reason: 'we build AI and automation tools, and I wanted to ask what you\'re hoping to take off your plate.',
        questions: ['Which repetitive task eats the most hours?', 'What would you need to see to trust it without a human checking?', 'Which tools does it need to plug into?'],
      };
    }
    default: return {
      about: `your project${forBiz}`,
      ref: 'the project',
      hook: 'what\'s the one outcome that would make this project a win for you?',
      problem: 'Most projects go sideways in the scoping, not the building — so we start by pinning down exactly what a win looks like.',
      offer: 'a one-page plan with a realistic price range',
      subject: 'Your project', offerSubject: 'Project plan',
      reason: 'I wanted to understand what you\'re looking for before suggesting anything.',
      questions: ['What made you post the request when you did?', 'What would make this a win six months from now?', 'Have you worked with an agency before — what went wrong?'],
    };
  }
}

/* ---------------------------------------------------------------- building */
export function buildOutreach(ctx: OutreachContext): Outreach {
  const query = (ctx.lead.query ?? '').trim();
  const service = (ctx.lead.service ?? '').trim();
  const { topic, basedOn } = pickTopic(query, service);
  const words = `${query}\n${service}`;
  const kindMatch = query.match(KIND_RE)?.[1] ?? null;
  const bizMatch = query.match(BIZ_RE)?.[1] ?? null;
  const d = {
    kind: kindMatch ? lower(kindMatch).replace(/^e-?learning$/, 'e-learning') : null,
    biz: bizMatch ? `your ${lower(bizMatch)}` : null,
    existing: EXISTING_RE.test(query),
    query: words,
  };
  const c = copyFor(topic, d);
  const name = firstName(ctx.lead.name);
  const rep = (ctx.repName || 'the team').split(/\s+/)[0];
  const company = ctx.company || 'NUUKE';
  const pitch = (ctx.pitch || 'a design and development studio').replace(/\.$/, '');
  const { postedAbout, source, market } = wherePhrase(ctx.lead.platform);
  const when = whenPhrase(ctx.lead.lead_date);
  const sourceClause = source ? ` — ${source}${when}` : '';
  const attempts = ctx.lead.attempts ?? 0;
  const sign = [`${ctx.repName || rep}`, `${ctx.repTitle ? `${ctx.repTitle}, ` : ''}${company}`, ctx.website].filter(Boolean).join('\n');
  const booking = ctx.bookingLink ? `\n\nIf it's easier, grab a time that suits you here: ${ctx.bookingLink}` : '';
  const flooded = market
    ? 'I\'m guessing your phone hasn\'t stopped since, so I\'ll keep this short.'
    : 'I know you probably weren\'t expecting a message, so I\'ll keep this short.';

  const texts: TextMsg[] = [
    {
      id: 'first', label: 'First text (after a missed call)', suggested: attempts === 0,
      text: `Hi ${name}, ${rep} from ${company} here. I just tried calling about ${c.about}${sourceClause}. Is it still something you're working on? Reply STOP to opt out.`,
    },
    {
      id: 'interrupt', label: market ? 'Pattern interrupt (they\'ve had lots of calls)' : 'Quick check-in',
      suggested: attempts === 0 && market,
      text: market
        ? `Hi ${name}, has your phone been busy since you ${postedAbout} ${c.about}? I'm ${rep} at ${company}. I'll skip the pitch: is the project still open, or already sorted?`
        : `Hi ${name}, ${rep} from ${company}. You asked about ${c.about}${when} — did you end up finding someone, or is it still open?`,
    },
    ...(market ? [{
      id: 'friendly', label: 'Friendly opener',
      text: `Hey ${name}, how's it going? Have you been getting a lot of calls since you posted about ${c.about}${when}? I'm ${rep} from ${company} — promise I'm not one of the spammy ones. Is it still on your list?`,
    }] : []),
    {
      id: 'question', label: 'One sharp question', suggested: attempts > 0 && attempts < 3,
      text: `Hi ${name}, ${rep} at ${company}. One quick question on ${c.ref}: ${c.hook} Happy to talk it through in 10 minutes.`,
    },
    {
      id: 'voicemail', label: 'After leaving a voicemail',
      text: `Hi ${name}, just left you a short voicemail about ${c.about}. Happy to send over ${c.offer} — or is a quick call this week easier? — ${rep}, ${company}`,
    },
    {
      id: 'choice', label: 'Reply-with-a-number check-in', suggested: attempts > 0 && attempts < 3,
      text: `Hi ${name}, quick one on ${c.ref}: 1) still planning 2) on hold 3) went with someone else? Just reply with the number. — ${rep}, ${company}`,
    },
    {
      id: 'breakup', label: 'Last text (no more chasing)', suggested: attempts >= 3,
      text: `Hi ${name}, I'll stop chasing on ${c.ref} after this one. If it comes back on your list, this is my direct line — happy to pick it up any time. All the best, ${rep}`,
    },
  ];

  const emails: EmailMsg[] = [
    {
      id: 'intro', label: 'First email', suggested: attempts < 2, subject: c.subject,
      body: `Hi ${name},\n\nYou ${postedAbout} ${c.about}${when} — ${market ? 'and I\'m guessing a few agencies have been in touch since' : 'so I wanted to follow up personally'}.\n\n${c.problem}\n\nWe're ${pitch}, and this is exactly the kind of work our team does.\n\nIs this still a live project?\n\n${sign}`,
    },
    {
      id: 'offer', label: 'Follow-up with something useful', suggested: attempts >= 2 && attempts < 3, subject: c.offerSubject,
      body: `Hi ${name},\n\nFollowing up on ${c.about}. Rather than another "just checking in", I can put together ${c.offer} — no call needed.\n\nWant me to send it over?${booking}\n\n${sign}`,
    },
    {
      id: 'breakup', label: 'Closing the loop', suggested: attempts >= 3, subject: 'Closing the loop',
      body: `Hi ${name},\n\nI haven't heard back about ${c.ref}, so I'm guessing the timing's off or you've picked a team — either is completely fine.\n\nHave you given up on the project for now? If it comes back, just reply here and I'll pick it straight up.\n\n${sign}`,
    },
  ];

  const call: CallScript = {
    opener: `Hi ${name}, it's ${rep} from ${company}. The reason I'm calling — you ${postedAbout} ${c.about}${when}. ${flooded} Can I take 30 seconds to tell you why I called, and then you decide if it's worth a chat?`,
    reason: `The reason: ${c.reason}`,
    questions: [...c.questions, 'Have you spoken to other agencies yet — what didn\'t feel right?'],
    notInterested: `Totally fair — you didn't ask me to call today. Out of curiosity, is it the timing, or have you already found someone?`,
    alreadyHired: `Good to hear it's moving. If anything changes with ${c.ref}, would it be OK if I checked back in a few weeks?`,
  };

  return { topic, topicLabel: TOPIC_LABEL[topic], basedOn, about: c.about, texts, emails, call };
}
