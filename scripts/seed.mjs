#!/usr/bin/env node
/**
 * Demo data for NUUKE CRM. Local / staging only — it deletes everything first.
 *
 *   npm run seed                 (reads .env.local)
 *
 * Builds a believable studio: an admin, five sales reps on an evening shift, three
 * production people, ~8,000 leads shaped like the real lead sheet, six weeks of
 * dialling history worked through the same rules the app uses, a pipeline, meetings
 * and attendance (with a few late days so payroll has something to show).
 * Every login's password is SEED_PASSWORD (default: NuukeDemo!2026).
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { seedProjects } from './seed-projects.mjs';

// ---------------------------------------------------------------------------- env
for (const file of ['.env.local', '.env']) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const URL_ = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.SEED_PASSWORD ?? 'NuukeDemo!2026';
if (!URL_ || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example).');
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL_) && !process.argv.includes('--yes-really')) {
  console.error(`Refusing to wipe ${URL_}. This is not a local database. Add --yes-really if you mean it.`);
  process.exit(1);
}
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
// Bulk updates go straight to Postgres; everything else goes through the API.
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Set DATABASE_URL (local: postgresql://postgres:postgres@127.0.0.1:54322/postgres).');
  process.exit(1);
}
const sql = new pg.Client({ connectionString: DATABASE_URL });

// --------------------------------------------------------------------- helpers
let seed = 20261001;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};
const TZ_OFFSET_H = 5; // Asia/Karachi, no daylight saving
const DAY = 86_400_000;
const localDate = (d = new Date()) => new Date(d.getTime() + TZ_OFFSET_H * 3600_000).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const isoDow = (iso) => ((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
/** Instant for a local date + "HH:MM" + extra minutes. */
const at = (iso, hhmm, plusMin = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.parse(iso + 'T00:00:00Z') + ((h - TZ_OFFSET_H) * 60 + m + plusMin) * 60_000);
};
async function chunked(table, rows, size = 1000, select = false) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const q = db.from(table).insert(rows.slice(i, i + size));
    const { data, error } = select ? await q.select() : await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

// ------------------------------------------------------------------------ people
const PEOPLE = [
  { key: 'admin', email: 'admin@nuuke.test', full_name: 'Aris Kamal', role: 'admin', department: 'management', title: 'Founder & CEO',
    emp: { monthly_salary_pkr: 0, tracks_attendance: false },
    avatar: { skin: 's4', eyes: 'cool', brows: 'soft', mouth: 'smirk', cheeks: false, hair: 'swoop', hairColor: 'black', hat: 'none', glasses: 'shades', outfit: 'suit', outfitColor: 'ink', accessory: 'none', held: 'coffee', pet: 'none', bg: 'violet' } },
  { key: 'zoya', email: 'zoya@nuuke.test', full_name: 'Zoya Malik', role: 'sales', department: 'sales', title: 'Senior Sales Executive',
    emp: { monthly_salary_pkr: 140000, shift_start: '18:00', monthly_target_usd: 12000 }, skill: 1.25, closer: 1.6,
    avatar: { skin: 's3', eyes: 'big', brows: 'soft', mouth: 'grin', cheeks: true, hair: 'hijab', hairColor: 'rose', hat: 'headset', glasses: 'none', outfit: 'kurta', outfitColor: 'mint', accessory: 'none', held: 'phone', pet: 'cat', bg: 'peach' } },
  { key: 'hamza', email: 'hamza@nuuke.test', full_name: 'Hamza Qureshi', role: 'sales', department: 'sales', title: 'Sales Executive',
    emp: { monthly_salary_pkr: 110000, shift_start: '18:00', monthly_target_usd: 10000 }, skill: 1.1, closer: 0.9,
    avatar: { skin: 's5', eyes: 'dot', brows: 'determined', mouth: 'smile', cheeks: false, hair: 'spiky', hairColor: 'black', hat: 'headset', glasses: 'square', outfit: 'hoodie', outfitColor: 'sky', accessory: 'none', held: 'coffee', pet: 'none', bg: 'sky' } },
  { key: 'sana', email: 'sana@nuuke.test', full_name: 'Sana Iqbal', role: 'sales', department: 'sales', title: 'Sales Executive',
    emp: { monthly_salary_pkr: 105000, shift_start: '18:00', monthly_target_usd: 10000 }, skill: 1.0, closer: 1.0,
    avatar: { skin: 's2', eyes: 'happy', brows: 'raised', mouth: 'cat', cheeks: true, hair: 'long', hairColor: 'brown', hat: 'none', glasses: 'round', outfit: 'sweater', outfitColor: 'lemon', accessory: 'scarf', held: 'laptop', pet: 'chick', bg: 'lemon' } },
  { key: 'bilal', email: 'bilal@nuuke.test', full_name: 'Bilal Anwar', role: 'sales', department: 'sales', title: 'Sales Executive',
    emp: { monthly_salary_pkr: 95000, shift_start: '18:00', monthly_target_usd: 9000 }, skill: 0.8, closer: 0.4, lateProne: true,
    avatar: { skin: 's6', eyes: 'sleepy', brows: 'soft', mouth: 'flat', cheeks: false, hair: 'curly', hairColor: 'black', hat: 'cap', glasses: 'none', outfit: 'tee', outfitColor: 'rose', accessory: 'chain', held: 'none', pet: 'dog', bg: 'rose' } },
  { key: 'mehak', email: 'mehak@nuuke.test', full_name: 'Mehak Raza', role: 'sales', department: 'sales', title: 'Junior Sales Executive',
    emp: { monthly_salary_pkr: 80000, shift_start: '18:00', monthly_target_usd: 8000 }, skill: 0.95, closer: 1.1,
    avatar: { skin: 's1', eyes: 'wink', brows: 'soft', mouth: 'tongue', cheeks: true, hair: 'bun', hairColor: 'auburn', hat: 'none', glasses: 'heart', outfit: 'overalls', outfitColor: 'violet', accessory: 'bowtie', held: 'megaphone', pet: 'blob', bg: 'mint' } },
  { key: 'faisal', email: 'faisal@nuuke.test', full_name: 'Faisal Rehman', role: 'production', department: 'development', title: 'Lead Engineer',
    emp: { monthly_salary_pkr: 260000, shift_start: '10:00' },
    avatar: { skin: 's4', eyes: 'dot', brows: 'determined', mouth: 'smile', cheeks: false, hair: 'buzz', hairColor: 'black', hat: 'beanie', glasses: 'round', outfit: 'hoodie', outfitColor: 'ink', accessory: 'lanyard', held: 'laptop', pet: 'none', bg: 'ink' } },
  { key: 'ayesha', email: 'ayesha@nuuke.test', full_name: 'Ayesha Noor', role: 'production', department: 'design', title: 'Product Designer',
    emp: { monthly_salary_pkr: 180000, shift_start: '10:00' },
    avatar: { skin: 's3', eyes: 'big', brows: 'raised', mouth: 'smile', cheeks: true, hair: 'bob', hairColor: 'purple', hat: 'beret', glasses: 'none', outfit: 'tee', outfitColor: 'peach', accessory: 'pearls', held: 'pencil', pet: 'cat', bg: 'rose' } },
  { key: 'umar', email: 'umar@nuuke.test', full_name: 'Umar Siddiqui', role: 'production', department: 'marketing', title: 'Content Strategist',
    emp: { monthly_salary_pkr: 150000, shift_start: '10:00' },
    avatar: { skin: 's5', eyes: 'happy', brows: 'soft', mouth: 'grin', cheeks: false, hair: 'mohawk', hairColor: 'blue', hat: 'none', glasses: 'none', outfit: 'jersey', outfitColor: 'sky', accessory: 'none', held: 'megaphone', pet: 'none', bg: 'sky' } },
];

// ------------------------------------------------------------------------- leads
const FIRST = ['Cassidy', 'Alyssa', 'Ameenah', 'Osato', 'Chelsey', 'Marcus', 'Priya', 'Daniel', 'Hannah', 'Tyrone', 'Sofia', 'Ethan',
  'Grace', 'Liam', 'Olivia', 'Noah', 'Ava', 'Mason', 'Isabella', 'Lucas', 'Mia', 'James', 'Amelia', 'Benjamin', 'Harper', 'Elijah',
  'Evelyn', 'Logan', 'Abigail', 'Jacob', 'Emily', 'Michael', 'Ella', 'Jackson', 'Scarlett', 'Aiden', 'Chloe', 'Samuel', 'Zara', 'Omar',
  'Fatima', 'Kwame', 'Aaliyah', 'Diego', 'Mei', 'Ravi', 'Leah', 'Connor', 'Naomi', 'Andre', 'Bianca', 'Trevor', 'Jasmine', 'Kofi'];
const LAST = ['Johnson', 'Williams', 'Brown', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Lee', 'Walker', 'Hall', 'Allen',
  'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner',
  'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Okafor', 'Nguyen', 'Patel', 'Khan', 'Osei'];
const MAIL = ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'me.com', 'hotmail.com', 'aol.com'];
const PLATFORMS = [['Bark', 55], ['Upwork', 12], ['LinkedIn', 9], ['Website', 10], ['Facebook Ads', 8], ['Clutch', 6]];
const COUNTRIES = [['United States', 70], ['United Kingdom', 10], ['Canada', 9], ['Australia', 7], ['United Arab Emirates', 4]];
const SERVICES = [
  ['Mobile App Development', 38], ['Web Development', 24], ['UI/UX Design', 12], ['E-commerce Store', 10],
  ['Digital Marketing', 9], ['Custom Software', 7],
];
const QUERIES = {
  'Mobile App Development': [
    ['What type of project is this?', ['Application', 'New app from scratch', 'Update to an existing app']],
    ['What platform do you need?', ['iOS and Android', 'iOS only', 'Android only', 'Not sure yet']],
    ['What is your budget?', ['$5,000 – $10,000', '$10,000 – $25,000', '$25,000+', 'Not sure yet']],
    ['When do you want to start?', ['As soon as possible', 'Within a month', 'In the next 3 months']],
  ],
  'Web Development': [
    ['What type of website do you need?', ['Business website', 'Web application', 'Landing page', 'Portal / dashboard']],
    ['How many pages?', ['1–5', '6–15', '16+', 'Not sure']],
    ['What is your budget?', ['$2,000 – $5,000', '$5,000 – $15,000', '$15,000+']],
  ],
  'UI/UX Design': [
    ['What needs designing?', ['Mobile app screens', 'Website redesign', 'Design system', 'Prototype for investors']],
    ['Do you have existing designs?', ['No, starting fresh', 'Yes, need a refresh', 'Wireframes only']],
  ],
  'E-commerce Store': [
    ['Which platform?', ['Shopify', 'WooCommerce', 'Custom', 'Not sure']],
    ['How many products?', ['Under 50', '50 – 500', '500+']],
  ],
  'Digital Marketing': [
    ['What do you need help with?', ['Social media management', 'Paid ads', 'SEO', 'Content creation']],
    ['Monthly budget?', ['$500 – $1,500', '$1,500 – $5,000', '$5,000+']],
  ],
  'Custom Software': [
    ['What should the software do?', ['Internal tool', 'CRM / ERP', 'Automation', 'Something else']],
    ['How many users?', ['Under 10', '10 – 100', '100+']],
  ],
};
const usPhone = () => `(${int(201, 989)}) ${int(200, 989)}-${String(int(0, 9999)).padStart(4, '0')}`;
const phoneFor = (country) => {
  switch (country) {
    case 'United Kingdom': return `+44 7${int(100, 999)} ${int(100000, 999999)}`;
    case 'Australia': return `+61 4${int(10, 99)} ${int(100, 999)} ${int(100, 999)}`;
    case 'United Arab Emirates': return `+971 5${int(0, 9)} ${int(100, 999)} ${int(1000, 9999)}`;
    default: return rnd() < 0.5 ? usPhone() : `${int(201, 989)} ${int(200, 989)} ${String(int(0, 9999)).padStart(4, '0')}`;
  }
};
function makeLead(leadDate) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const service = weighted(SERVICES);
  const country = weighted(COUNTRIES);
  const qa = QUERIES[service].map(([q, as]) => `${q}\n${pick(as)}`).join('\n\n');
  const handle = `${first}${rnd() < 0.5 ? last : last.slice(0, 1)}${rnd() < 0.4 ? int(1, 99) : ''}`.toLowerCase();
  return {
    lead_date: leadDate,
    platform: weighted(PLATFORMS),
    country,
    name: rnd() < 0.15 ? first : `${first} ${last}`,
    personal_email: rnd() < 0.93 ? `${handle}@${pick(MAIL)}` : null,
    work_email: rnd() < 0.2 ? `${first.toLowerCase()}@${last.toLowerCase()}${pick(['co', 'studio', 'group', 'llc'])}.com` : null,
    phone: rnd() < 0.96 ? phoneFor(country) : null,
    post_link: rnd() < 0.35 ? `https://www.bark.com/en/us/b/${service.toLowerCase().replace(/[^a-z]+/g, '-')}/${int(100000, 999999)}/` : null,
    query: qa,
    service,
  };
}

// ---------------------------------------------------------------- outcomes model
const OUTCOMES = [
  ['contact_not_established', 44], ['voicemail', 18], ['busy_callback', 5], ['contact_established', 9],
  ['interested', 1.4], ['meeting_booked', 0.7], ['proposal_presentation', 0.2], ['proposal_sent', 0.2],
  ['negotiation', 0.1], ['won', 0.08], ['not_interested', 6.5], ['wrong_person', 1.5],
  ['invalid_number', 4.2], ['do_not_call', 1.1], ['duplicate', 0.1],
];
const EFFECT = {
  contact_not_established: 'retry', voicemail: 'retry', contact_established: 'retry', busy_callback: 'callback',
  interested: 'pipeline', meeting_booked: 'pipeline', proposal_presentation: 'pipeline', proposal_sent: 'pipeline',
  negotiation: 'pipeline', won: 'closed', not_interested: 'closed', wrong_person: 'closed', invalid_number: 'closed',
  do_not_call: 'closed', duplicate: 'closed',
};
const CONNECTED = new Set(['busy_callback', 'contact_established', 'interested', 'meeting_booked', 'proposal_presentation',
  'proposal_sent', 'negotiation', 'won', 'not_interested', 'wrong_person', 'do_not_call']);
const PIPE_STAGE = { interested: 'prospect', meeting_booked: 'meeting', proposal_presentation: 'proposal',
  proposal_sent: 'proposal', negotiation: 'negotiation', won: 'won' };
const RANK = { prospect: 1, meeting: 2, proposal: 3, negotiation: 4, won: 5, lost: 5 };
const PROB = { prospect: 10, meeting: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 };
const COMMENTS = {
  contact_not_established: ['Rang out', 'No answer, tried twice', 'Straight to voicemail, no message box', 'Line busy'],
  voicemail: ['Left VM with intro + callback number', 'Left a short voicemail', 'VM left, will email too'],
  busy_callback: ['In a meeting, asked to call back', 'Driving — call back later today', 'Asked for a call tomorrow afternoon'],
  contact_established: ['Spoke briefly, will think about it', 'Gatekeeper, owner back tomorrow', 'Interested but comparing quotes'],
  interested: ['Wants a ballpark for iOS + Android', 'Needs MVP in 8 weeks — sending deck', 'Asked for portfolio, warm lead'],
  meeting_booked: ['Zoom booked with founder', 'Discovery call booked', 'Meeting set, CTO joining'],
  proposal_presentation: ['Walked through proposal, positive', 'Presented scope + timeline'],
  proposal_sent: ['Proposal emailed', 'Sent proposal with two options'],
  negotiation: ['Wants 10% off, checking with Aris', 'Negotiating payment milestones'],
  won: ['Signed! Deposit invoice sent', 'Closed — kickoff next week'],
  not_interested: ['Already hired someone', 'Budget too low', 'Project on hold'],
  wrong_person: ['Not the decision maker, no referral', 'Wrong number for this lead'],
  invalid_number: ['Number disconnected', 'Not in service', 'Fax tone'],
  do_not_call: ['Asked not to be called again', 'DNC requested'],
  duplicate: ['Same person as another lead'],
};

// ----------------------------------------------------------------------- run it
async function wipe() {
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) await db.auth.admin.deleteUser(u.id);
  await sql.query(`truncate public.lead_attempts, public.meetings, public.deals, public.leads, public.lead_imports,
                            public.notifications, public.audit_log, public.login_events, public.attendance_alerts,
                            public.attendance_breaks, public.attendance_sessions, public.attendance_days,
                            public.payroll_releases, public.holidays, public.agent_unlocks, public.projects
                   restart identity cascade`);
}

async function main() {
  console.log(`Seeding ${URL_} …`);
  await sql.connect();
  await wipe();
  // The demo has six weeks of history, so attendance has been tracked since before it.
  await sql.query(`update public.settings set attendance_starts_on = (now() at time zone 'Asia/Karachi')::date - 60`);

  // People ---------------------------------------------------------------------
  const today = localDate();
  const ids = {};
  for (const p of PEOPLE) {
    const { data, error } = await db.auth.admin.createUser({
      email: p.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: p.full_name },
    });
    if (error) throw new Error(`user ${p.email}: ${error.message}`);
    ids[p.key] = data.user.id;
    must(await db.from('profiles').insert({
      id: data.user.id, email: p.email, full_name: p.full_name, role: p.role, department: p.department,
      title: p.title, avatar: p.avatar, phone: null,
    }), 'profile');
    must(await db.from('employment').insert({
      profile_id: data.user.id,
      monthly_salary_pkr: p.emp.monthly_salary_pkr ?? 0,
      tracks_attendance: p.emp.tracks_attendance ?? true,
      shift_start: p.emp.shift_start ?? '09:00',
      shift_minutes: 540,
      work_days: [1, 2, 3, 4, 5],
      daily_dial_target: 250,
      monthly_target_usd: p.emp.monthly_target_usd ?? 0,
      joined_on: addDays(today, -400),
    }), 'employment');
  }
  const reps = PEOPLE.filter((p) => p.role === 'sales');

  // Work days in the last six weeks (not counting today).
  const workDays = [];
  for (let i = 44; i >= 1; i--) {
    const d = addDays(today, -i);
    if (isoDow(d) <= 5) workDays.push(d);
  }

  // Leads ---------------------------------------------------------------------
  const { data: imp } = await db.from('lead_imports').insert({
    file_name: 'NUUKE Leads — Master Sheet.csv', imported_by: ids.admin, total_rows: 15000,
  }).select().single();

  const leadRows = [];
  for (let i = 0; i < 15000; i++) {
    // Re-dated to just before its first call below; whatever is never dialled stays recent.
    const leadDate = addDays(today, -int(0, 9));
    leadRows.push({ ...makeLead(leadDate), import_id: imp.id });
  }
  // Dedupe phones the way the importer does.
  const seen = new Set();
  const unique = leadRows.filter((l) => {
    const k = l.phone ? l.phone.replace(/\D/g, '').slice(-10) : null;
    if (!k) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // 2,600 per rep, the rest left unassigned for the admin to hand out.
  unique.forEach((l, i) => {
    const r = Math.floor(i / 2600);
    if (r < reps.length) {
      l.assigned_to = ids[reps[r].key];
      l.assigned_at = new Date(Date.now() - 50 * DAY).toISOString();
    }
  });
  const leads = await chunked('leads', unique, 1000, true);
  await db.from('lead_imports').update({ inserted: leads.length, duplicates: 15000 - leads.length }).eq('id', imp.id);
  console.log(`  leads         ${leads.length}`);

  // Simulate the dialling --------------------------------------------------------
  const attempts = [];
  const deals = []; // { tmpId, ...row }
  const meetings = [];
  const state = new Map(leads.map((l) => [l.id, { ...l, attempts: 0, next: null, stage: 'queue', status: 'new', deal: null, connected: false }]));
  let tmpDeal = 0;

  const attendance = []; // { profile, date, ... }

  for (const rep of reps) {
    const repId = ids[rep.key];
    const mine = leads.filter((l) => l.assigned_to === repId);
    // Keep a fresh stack for today's demo.
    const freshLimit = mine.length - 160;
    let freshIdx = 0;

    for (const d of workDays) {
      // Attendance for this shift (18:00 → 03:00).
      let late = rnd() < 0.82 ? int(-10, 9) : weighted([[int(16, 44), 6], [int(46, 89), 2], [int(95, 140), 0.4]]);
      if (rep.lateProne && rnd() < 0.25) late = int(18, 70);
      const absent = rnd() < (rep.lateProne ? 0.06 : 0.025);
      if (absent) continue;
      attendance.push({ profile: repId, date: d, start: '18:00', late, breakMin: int(40, rep.lateProne ? 85 : 62) });

      const shiftStart = at(d, '18:00', Math.max(late, 0));
      const target = Math.round(int(150, 265) * rep.skill);
      const dials = Math.min(target, 290);
      const due = [...state.values()].filter((s) => s.assigned_to === repId && s.next && s.next <= d && (s.stage === 'queue' || s.stage === 'pipeline'));
      const queue = [...due];
      for (let n = 0; n < dials; n++) {
        let s = queue.shift();
        if (!s) {
          if (freshIdx >= freshLimit) break;
          s = state.get(mine[freshIdx++].id);
          s.lead_date = addDays(d, -int(0, 3));
        }
        const when = new Date(shiftStart.getTime() + (n / dials) * 8 * 3600_000 + int(0, 90) * 1000);
        let outcome = weighted(OUTCOMES.map(([k, w]) => [k, ['won', 'meeting_booked', 'negotiation', 'proposal_sent'].includes(k) ? w * rep.closer : w]));
        if (s.attempts >= 1 && (outcome === 'invalid_number' || outcome === 'duplicate')) outcome = 'contact_not_established';
        const attemptNo = s.attempts + 1;
        const effect = EFFECT[outcome];
        let next = null;
        let stage = 'queue';
        let closed = null;
        if (effect === 'retry') {
          if (attemptNo >= 4) { stage = 'closed'; closed = 'exhausted'; }
          else {
            let nd = addDays(d, 1);
            while (isoDow(nd) > 5) nd = addDays(nd, 1);
            next = nd;
          }
        } else if (effect === 'callback') {
          let nd = addDays(d, int(0, 2));
          while (isoDow(nd) > 5) nd = addDays(nd, 1);
          next = nd;
        } else if (effect === 'pipeline') {
          stage = 'pipeline';
        } else {
          stage = 'closed';
          closed = outcome;
        }
        if (PIPE_STAGE[outcome]) {
          const amount = outcome === 'won' ? int(15, 120) * 100 : int(20, 180) * 100;
          if (!s.deal) {
            s.deal = ++tmpDeal;
            deals.push({
              tmp: s.deal, owner_id: repId, lead_tmp: s.id, title: `${s.name || 'New prospect'} — ${s.service}`,
              contact_name: s.name, email: s.personal_email ?? s.work_email, phone: s.phone, service: s.service,
              amount_usd: amount, stage: PIPE_STAGE[outcome], created_at: when.toISOString(),
              expected_close: addDays(d, int(10, 120)), won_on: outcome === 'won' ? d : null,
            });
          } else {
            const deal = deals.find((x) => x.tmp === s.deal);
            if (RANK[PIPE_STAGE[outcome]] > RANK[deal.stage]) deal.stage = PIPE_STAGE[outcome];
            if (outcome === 'won') { deal.won_on = d; deal.amount_usd = amount; }
          }
          if (outcome === 'meeting_booked') {
            const mDay = addDays(d, int(1, 6));
            meetings.push({
              owner_id: repId, deal_tmp: s.deal, lead_tmp: s.id, title: `Meeting with ${s.name || 'prospect'}`,
              starts_at: at(mDay, `${pick(['19', '20', '21', '22', '23'])}:${pick(['00', '30'])}`).toISOString(),
              duration_minutes: pick([30, 30, 45, 60]),
              location: 'Zoom', created_at: when.toISOString(),
            });
          }
        }
        s.attempts = attemptNo;
        s.status = outcome;
        s.stage = stage;
        s.closed_reason = closed;
        s.next = next;
        s.connected = s.connected || CONNECTED.has(outcome);
        s.last_attempt_at = when.toISOString();
        const comment = rnd() < 0.55 ? pick(COMMENTS[outcome]) : null;
        if (comment) s.last_comment = comment;
        attempts.push({
          lead_id: s.id, rep_id: repId, action: 'call', outcome, comment, attempt_no: attemptNo,
          followup_at: next ? at(next, '14:00').toISOString() : null, work_date: d, created_at: when.toISOString(),
        });
        if (rnd() < 0.03) {
          attempts.push({ lead_id: s.id, rep_id: repId, action: 'skip', comment: null, work_date: d,
            created_at: new Date(when.getTime() + 20_000).toISOString() });
        }
      }
    }
  }

  // Make the current pay period interesting: Zoya beats her target, Bilal is under 30 %.
  const periodStart = (() => {
    const [y, m, dd] = today.split('-').map(Number);
    const start = dd >= 20 ? new Date(Date.UTC(y, m - 1, 20)) : new Date(Date.UTC(y, m - 2, 20));
    return start.toISOString().slice(0, 10);
  })();
  const inPeriod = (dd) => dd && dd >= periodStart;
  const wonBy = (k) => deals.filter((x) => x.owner_id === ids[k] && x.stage === 'won' && inPeriod(x.won_on));
  const ensureWon = (k, usd) => {
    let total = wonBy(k).reduce((s, x) => s + x.amount_usd, 0);
    const open = deals.filter((x) => x.owner_id === ids[k] && x.stage !== 'won' && x.stage !== 'lost');
    for (const deal of open) {
      if (total >= usd) break;
      deal.stage = 'won';
      deal.won_on = workDays.filter((x) => x >= periodStart).at(-1) ?? addDays(today, -1);
      deal.amount_usd = Math.min(int(25, 70) * 100, Math.max(1500, usd - total));
      total += deal.amount_usd;
    }
  };
  ensureWon('zoya', 13500);
  ensureWon('hamza', 6200);
  ensureWon('sana', 5400);
  ensureWon('mehak', 3900);
  for (const deal of wonBy('bilal').slice(1)) { deal.stage = 'negotiation'; deal.won_on = null; }
  if (wonBy('bilal').reduce((s, x) => s + x.amount_usd, 0) > 2400) {
    for (const deal of wonBy('bilal')) deal.amount_usd = 2000;
  }

  // Prospects nobody moved in three weeks mostly went cold.
  for (const deal of deals) {
    if (deal.stage === 'prospect' && deal.created_at < at(addDays(today, -21), '00:00').toISOString() && rnd() < 0.35) {
      deal.stage = 'lost';
      deal.lost_reason = pick(['Went with another agency', 'Budget fell through', 'Stopped responding', 'Project postponed']);
    }
  }

  // Insert deals, then point leads and meetings at them.
  const dealRows = deals.map(({ tmp, lead_tmp, ...row }) => ({
    ...row, lead_id: lead_tmp, probability: PROB[row.stage], next_step: row.stage === 'won' ? null : pick(['Send revised quote', 'Follow up on proposal', 'Book discovery call', 'Share case studies', 'Check budget sign-off']),
    next_step_at: row.stage === 'won' ? null : at(addDays(today, int(0, 7)), '19:00').toISOString(),
  }));
  const insertedDeals = await chunked('deals', dealRows, 500, true);
  const dealIdByLead = new Map(insertedDeals.map((d) => [d.lead_id, d.id]));
  // Past meetings are mostly held; future ones scheduled.
  const now = Date.now();
  const meetingRows = meetings.map(({ deal_tmp, lead_tmp, ...m }) => ({
    ...m, lead_id: lead_tmp, deal_id: dealIdByLead.get(lead_tmp) ?? null,
    status: Date.parse(m.starts_at) < now ? weighted([['completed', 78], ['no_show', 14], ['cancelled', 8]]) : 'scheduled',
  }));
  // A couple of meetings later today for whoever signs in first.
  for (const [k, hh] of [['zoya', '20:30'], ['hamza', '21:00'], ['sana', '22:30']]) {
    meetingRows.push({ owner_id: ids[k], title: `Discovery call — ${pick(FIRST)} ${pick(LAST)}`, starts_at: at(today, hh).toISOString(),
      duration_minutes: 30, location: 'Zoom', status: 'scheduled', created_at: new Date(now - 2 * DAY).toISOString() });
  }
  await chunked('meetings', meetingRows, 500);
  console.log(`  deals         ${insertedDeals.length}`);
  console.log(`  meetings      ${meetingRows.length}`);

  // Lead state ------------------------------------------------------------------
  const touched = [...state.values()].filter((s) => s.attempts > 0);
  const updates = touched.map((s) => ({
    id: s.id, status: s.status, stage: s.stage, closed_reason: s.closed_reason ?? null, attempts: s.attempts,
    connected: s.connected, next_action_at: s.next ? at(s.next, '14:00').toISOString() : null,
    last_attempt_at: s.last_attempt_at, last_comment: s.last_comment ?? null, deal_id: dealIdByLead.get(s.id) ?? null,
    lead_date: s.lead_date,
  }));
  await sql.query(
    `update public.leads l
        set status = x.status, stage = x.stage, closed_reason = x.closed_reason, attempts = x.attempts,
            connected = x.connected, next_action_at = x.next_action_at, last_attempt_at = x.last_attempt_at,
            last_comment = x.last_comment, deal_id = x.deal_id, lead_date = x.lead_date
       from jsonb_to_recordset($1::jsonb) as x (id bigint, status text, stage text, closed_reason text, attempts int,
            connected boolean, next_action_at timestamptz, last_attempt_at timestamptz, last_comment text, deal_id bigint,
            lead_date date)
      where l.id = x.id`,
    [JSON.stringify(updates)],
  );
  await chunked('lead_attempts', attempts, 2000);
  console.log(`  call attempts ${attempts.length}`);

  // Attendance ------------------------------------------------------------------
  for (const p of PEOPLE.filter((x) => x.role === 'production')) {
    for (const d of workDays) {
      if (rnd() < 0.03) continue;
      attendance.push({ profile: ids[p.key], date: d, start: '10:00', late: rnd() < 0.88 ? int(-15, 10) : int(16, 50), breakMin: int(35, 60) });
    }
  }
  await sql.query(
    `with x as (
       select r.*, ((r.work_date + r.start::time)::timestamp at time zone 'Asia/Karachi') as sched
         from jsonb_to_recordset($1::jsonb) as r (profile_id uuid, work_date date, start text, late int, break_min int)
     ), days as (
       insert into public.attendance_days (profile_id, work_date, scheduled_start, scheduled_end, first_in, last_out,
                                           late_minutes, arrival)
       select profile_id, work_date, sched, sched + interval '9 hours', sched + make_interval(mins => late),
              sched + interval '9 hours' + make_interval(mins => (abs(hashtext(profile_id::text || work_date)) % 25)),
              greatest(late, 0), public.classify_arrival(greatest(late, 0))
         from x
       returning id, profile_id, work_date, first_in, last_out
     ), sess as (
       insert into public.attendance_sessions (day_id, profile_id, started_at, ended_at, end_reason)
       select id, profile_id, first_in, last_out, 'signout' from days
       returning id, day_id, profile_id, started_at
     )
     insert into public.attendance_breaks (session_id, day_id, profile_id, started_at, ended_at)
     select s.id, s.day_id, s.profile_id, s.started_at + interval '4 hours',
            s.started_at + interval '4 hours' + make_interval(mins => x.break_min)
       from sess s
       join days d on d.id = s.day_id
       join x on x.profile_id = d.profile_id and x.work_date = d.work_date`,
    [JSON.stringify(attendance.map((a) => ({ profile_id: a.profile, work_date: a.date, start: a.start, late: a.late, break_min: a.breakMin })))],
  );
  // One forgotten sign-out, for the admin to spot.
  await sql.query(
    `update public.attendance_days set auto_signed_out = true, last_out = scheduled_end + interval '2 hours'
      where id = (select id from public.attendance_days where profile_id = $1 order by work_date desc offset 2 limit 1)`,
    [ids.hamza],
  );
  console.log(`  shifts        ${attendance.length}`);

  // Meetings: clients across US (and a few UK) time zones, technical managers, prep -----
  await sql.query(`update public.profiles set is_technical_manager = true where id = any($1)`, [[ids.faisal, ids.ayesha]]);
  await sql.query(`
    update public.meetings m set
      timezone = (array['America/New_York','America/New_York','America/New_York','America/Chicago','America/Chicago',
                        'America/Denver','America/Los_Angeles','America/Los_Angeles','America/Phoenix','Europe/London'])[1 + (m.id % 10)],
      location = case when m.location is null or m.location = 'Zoom' then 'https://zoom.us/j/55' || lpad((m.id * 7919 % 1000000)::text, 7, '0') else m.location end`);
  await sql.query(`
    update public.meetings set technical_manager_id = case when id % 2 = 0 then $1::uuid else $2::uuid end
     where starts_at > now() - interval '21 days' and id % 7 <> 0`, [ids.faisal, ids.ayesha]);
  await sql.query(`
    update public.meetings m set
      client_website = 'https://www.' || coalesce(nullif(lower(regexp_replace(split_part(l.name, ' ', 2), '[^a-zA-Z0-9]', '', 'g')), ''), 'client') || 'studio.com',
      client_links = 'instagram.com/' || lower(regexp_replace(l.name, '[^a-zA-Z0-9]', '', 'g')) || E'\nlinkedin.com/in/' || lower(regexp_replace(l.name, '[^a-zA-Z0-9]', '-', 'g')),
      prep_notes = (array[
        'Budget roughly $8–12k. Wants iOS first, Android later. Decision maker is her business partner — invite him.',
        'Has a Shopify store doing ~$20k/month; cart abandonment is the pain. Asked for examples of stores we have rebuilt.',
        'Burned by a freelancer before — needs a clear timeline and weekly updates. Very price-sensitive.',
        'Wants to launch before the holidays. Asked about maintenance after launch and who owns the code.'])[1 + (m.id % 4)],
      transcript = 'Rep: Hi ' || split_part(coalesce(nullif(l.name, ''), 'there'), ' ', 1) || ', it''s about the ' || lower(coalesce(l.service, 'project')) || E' you posted. Do you have two minutes?\n'
        || E'Client: Sure, I''ve had a lot of calls about it, honestly.\n'
        || E'Rep: I bet — I''ll be quick. What made you post it now?\n'
        || E'Client: We''re losing customers to a competitor who already has one, and our current setup is all manual.\n'
        || E'Rep: Makes sense. Is there a date you need it by?\n'
        || E'Client: Ideally in about three months. Budget depends on what''s included.\n'
        || E'Rep: Totally fair. Would it help to walk through options with our technical lead, so you get a realistic range?\n'
        || E'Client: Yes, that would be great.'
      from public.leads l
     where l.id = m.lead_id and m.starts_at > now() - interval '7 days'`);

  // Some leads came in with two or three numbers in one cell.
  await sql.query(`
    update public.leads set phone = phone || ' / +1 (' || (array['212','312','415','713','305','602','206','617'])[1 + (id % 8)]
                                  || ') 555-' || lpad((id % 10000)::text, 4, '0')
                                  || case when id % 4 = 0 then ', ' || (array['646','773','510','832'])[1 + (id % 4)] || '-555-' || lpad(((id * 7) % 10000)::text, 4, '0') else '' end
     where phone is not null and id % 9 = 0`);

  // When each closed lead actually closed: its last call (the bulk update above stamps "now").
  await sql.query(`update public.leads set closed_at = coalesce(last_attempt_at, updated_at) where stage = 'closed'`);
  // Closed leads older than the recycle window come back for a new round (as the 5-minute job does).
  const { rows: [{ recycled }] } = await sql.query('select public.lead_recycle_sweep() as recycled');
  console.log(`  recycled      ${recycled} closed leads back in queues`);

  // Real-style Bark enquiries, written in the client's own words, at the front of the reps' queues.
  const bark = (who, daysAgo, name, phone, country, service, message, extra = '') => ({
    assigned_to: ids[who], assigned_at: new Date(now - DAY).toISOString(), stage: 'queue', status: 'new',
    lead_date: addDays(today, -daysAgo), platform: 'Bark', country, name, phone, service,
    personal_email: `${name.split(' ')[0].toLowerCase()}.${(name.split(' ')[1] ?? 'x').toLowerCase()}@gmail.com`,
    query: `${extra}When the work should be done\nAs recommended by the pro\nMessage\n${message}`,
    next_action_at: new Date(Date.parse(addDays(today, -daysAgo) + 'T04:00:00Z')).toISOString(),
  });
  await db.from('leads').insert([
    bark('zoya', 160, 'Elizabeth Castillo', '(615) 555-0142', 'United States', 'Graphic Design',
      'Looking for graphic design help for social platforms. My brand is launching soon - Healing Heart Co. (www.healingheartco.com) as well as my book- Dear Healing Heart (available may 5) . I have the content but need help with graphics and actioning it.'),
    bark('zoya', 21, 'Marcus Bell', '(512) 555-0199', 'United States', 'Mobile App Development',
      'I run a dog grooming business called Pawfect Cuts and need a booking app so clients can book and pay for appointments. We have 3 locations in Austin.',
      'What type of app do you need?\nBooking app\nWhich platforms?\niOS and Android\n'),
    bark('zoya', 6, 'Nina Patel', '+44 7700 900123', 'United Kingdom', 'Logo Design',
      'Need a logo for my new podcast "The Quiet Hour" launching in November. Calm, minimal, works small on Spotify.'),
    bark('hamza', 9, 'Dana Brooks', '(303) 555-0117', 'United States', 'E-commerce Store',
      'Need a Shopify store for my candle brand, Ember & Oak (emberandoak.com). We have about 40 products and sell at markets right now.'),
    bark('hamza', 3, 'Rob Hughes', '(713) 555-0164', 'United States', 'Web Design',
      'Looking for someone to redesign our website www.smithplumbingtx.com, it is outdated and not mobile friendly. We get most work from Google.'),
  ]);

  // Zoya's own quick messages.
  await sql.query(`insert into public.quick_messages (user_id, title, body, position, uses) values
      ($1, 'Intro after a missed call', 'Hi {first name}, it''s {my name} from {company}. Just tried you about your {service} request. Is now a bad time, or is later today better?', 0, 14),
      ($1, 'Sending portfolio', 'Hi {first name}, as promised here''s our portfolio: nuuke.com/work. Happy to walk you through anything similar to what you need. {my name}', 1, 6),
      ($1, 'Busy, call back', 'No problem {first name}, I''ll give you a call back later. Reply with a time that suits and I''ll call then. {my name}, {company}', 2, 3)`,
    [ids.zoya]);

  // Break-time games: a finished one, one in progress, and an invite waiting for Zoya.
  const blank = Array(64).fill('');
  const chessStart = 'rnbqkbnrpppppppp'.split('').concat(blank.slice(0, 32), 'PPPPPPPPRNBQKBNR'.split(''));
  chessStart[36] = 'P'; chessStart[52] = '';
  const chessState = { board: chessStart, turn: 'b', castle: 'KQkq', ep: 44, half: 0, full: 1, last: [52, 36], seen: [] };
  const ckBoard = blank.map((_, i) => ((Math.floor(i / 8) + (i % 8)) % 2 === 0 ? '' : Math.floor(i / 8) <= 2 ? 'b' : Math.floor(i / 8) >= 5 ? 'a' : ''));
  const game = async (kind, host, guest, status, state, extra = {}) => {
    const { rows: [g] } = await sql.query(
      `insert into public.games (kind, host_id, status, state, turn_user, version, winner_id, result, started_at, finished_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) returning id`,
      [kind, ids[host], status, JSON.stringify(state), extra.turn ? ids[extra.turn] : null, extra.version ?? 1,
        extra.winner ? ids[extra.winner] : null, extra.result ?? null, status === 'waiting' ? null : new Date(now - 3 * 3600_000).toISOString(),
        status === 'finished' ? new Date(now - 2 * 3600_000).toISOString() : null, new Date(now - (extra.minsAgo ?? 180) * 60_000).toISOString()]);
    await sql.query(`insert into public.game_players (game_id, user_id, seat, status, responded_at) values ($1, $2, 0, 'joined', now()), ($1, $3, 1, $4, $5)`,
      [g.id, ids[host], ids[guest], status === 'waiting' ? 'invited' : 'joined', status === 'waiting' ? null : new Date().toISOString()]);
    return g.id;
  };
  await game('tictactoe', 'zoya', 'hamza', 'finished', { board: [0, 1, null, 1, 0, null, null, null, 0] }, { winner: 'zoya', result: 'win', version: 6 });
  await game('chess', 'sana', 'zoya', 'active', chessState, { turn: 'zoya', version: 2, minsAgo: 40 });
  await game('checkers', 'hamza', 'zoya', 'waiting', { board: ckBoard, turn: 0, chain: null, last: null, quiet: 0 }, { minsAgo: 20 });
  console.log('  games         3 (one invite waiting for Zoya)');

  // A public holiday last month, to show it on calendars.
  await db.from('holidays').insert({ day: workDays[3], name: 'Company holiday' });

  // Notifications: start clean, then a handful that tell the story.
  await db.from('notifications').delete().not('id', 'is', null);
  await db.from('audit_log').delete().not('id', 'is', null);
  const note = (user, kind, title, body, link, tone, minsAgo) => ({
    user_id: ids[user], kind, title, body, link, tone, created_at: new Date(now - minsAgo * 60_000).toISOString(),
  });
  await db.from('notifications').insert([
    note('zoya', 'deal.won', 'Deal closed!', 'You are past your monthly target — commission unlocked.', '/sales/pipeline', 'celebrate', 600),
    note('zoya', 'leads.assigned', '120 new leads are waiting for you', 'Press Start on the dialer to work through them.', '/sales', 'info', 90),
    note('zoya', 'game.invite', 'Hamza wants to play Checkers', 'Games open on your break. Join from Mini Games when you take one.', '/games', 'info', 20),
    note('hamza', 'meeting.soon', 'Meeting tonight at 9:00 PM', 'Discovery call on Zoom.', '/sales/meetings', 'info', 30),
    note('bilal', 'attendance.late', 'Short day — one day will be deducted', 'You signed in 31 minutes after your shift started.', '/me/pay', 'warning', 1500),
    note('admin', 'deal.won', 'Zoya Malik closed $4,800', 'Mobile App Development', '/admin/sales', 'celebrate', 600),
    note('admin', 'attendance.late', 'Bilal Anwar arrived 31 min late', 'Short day — one day will be deducted', '/admin/attendance', 'warning', 1500),
    note('admin', 'attendance.auto_signout', 'Hamza Qureshi did not sign out', 'They were signed out automatically an hour after the reminder.', '/admin/attendance', 'danger', 2900),
  ]);

  // Projects, the production workspace and the client portal.
  const clients = await seedProjects({ db, sql, ids, today, password: PASSWORD });

  console.log('\nSign in with (password: ' + PASSWORD + '):');
  for (const p of PEOPLE) console.log(`  ${p.role.padEnd(10)} ${p.email.padEnd(22)} ${p.full_name}`);
  for (const c of clients) console.log(`  ${'client'.padEnd(10)} ${c.email.padEnd(22)} ${c.full_name} (${c.title})`);
}

main()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error('\nSeed failed:', err.message);
    await sql.end().catch(() => {});
    process.exit(1);
  });
