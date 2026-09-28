/**
 * Seeds a working studio: 21 people across 8 squads, 9 accounts, 9 projects,
 * 13 sprints, ~79 tickets, defects, releases, support requests and billing —
 * plus one login per person and one portal login per active account.
 *
 * Every date is relative to the day you run this, so sprints are genuinely
 * mid-flight and SLA timers are live no matter when you seed.
 *
 *   npm run db:seed
 *
 * Re-running wipes the data and starts again; it does not touch the schema.
 */
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../src/db.js';
import { env } from '../src/env.js';

const DAY = 86_400_000;
const TODAY = new Date();
TODAY.setUTCHours(0, 0, 0, 0);

/** A calendar day `n` days from today, as YYYY-MM-DD. */
const day = (n) => (n === null || n === undefined ? null : new Date(TODAY.getTime() + n * DAY).toISOString().slice(0, 10));
/** A timestamp `h` hours from now. */
const hours = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

// =====================================================================
//  DATA
// =====================================================================

// slug, name, title, department, seniority, capacity, location, joinedDaysAgo, status, loginRole
const PEOPLE = [
  ['aris',     'Aris Kamal',        'Head of Delivery',            'Product', 'Head',   40, 'Karachi',   -980, 'Active',   'ADMIN'],
  ['maryam',   'Maryam Javed',      'Delivery Manager',            'Product', 'Mid',    40, 'Karachi',   -610, 'Active',   'MANAGER'],
  ['omar',     'Omar Sheikh',       'Business Development Lead',   'Product', 'Lead',   40, 'Karachi',  -1240, 'Active',   'MANAGER'],
  ['faisal',   'Faisal Rehman',     'Engineering Manager',         'Backend', 'Lead',   36, 'Karachi',  -1420, 'Active',   'MANAGER'],
  ['umar',     'Umar Siddiqui',     'Senior Backend Engineer',     'Backend', 'Senior', 40, 'Karachi',   -870, 'Active',   'MEMBER'],
  ['hina',     'Hina Qureshi',      'Backend Engineer',            'Backend', 'Mid',    40, 'Lahore',    -420, 'Active',   'MEMBER'],
  ['kabir',    'Kabir Anand',       'Backend Engineer',            'Backend', 'Junior', 40, 'Karachi',   -160, 'Active',   'MEMBER'],
  ['zoya',     'Zoya Malik',        'Senior iOS Engineer',         'iOS',     'Senior', 40, 'Karachi',  -1100, 'Active',   'MEMBER'],
  ['mubeen',   'Mubeen Ahmed',      'iOS Engineer',                'iOS',     'Mid',    40, 'Karachi',   -530, 'Active',   'MEMBER'],
  ['danish',   'Danish Iqbal',      'Senior Android Engineer',     'Android', 'Senior', 40, 'Islamabad', -960, 'Active',   'MEMBER'],
  ['shahwaiz', 'Shahwaiz Khan',     'Android Engineer',            'Android', 'Junior', 40, 'Karachi',   -240, 'Active',   'MEMBER'],
  ['sana',     'Sana Bhatti',       'Design Lead',                 'Design',  'Lead',   36, 'Karachi',  -1310, 'Active',   'MANAGER'],
  ['ayesha',   'Ayesha Noor',       'Product Designer',            'Design',  'Senior', 40, 'Karachi',   -700, 'Active',   'MEMBER'],
  ['yahya',    'Muhammad Yahya',    'UI Designer',                 'Design',  'Junior', 40, 'Karachi',   -190, 'Active',   'MEMBER'],
  ['rabia',    'Rabia Farooq',      'Senior Frontend Engineer',    'Web',     'Senior', 40, 'Karachi',   -820, 'Active',   'MEMBER'],
  ['aliayaz',  'Ali Ayaz',          'Frontend Engineer',           'Web',     'Mid',    40, 'Karachi',   -360, 'Active',   'MEMBER'],
  ['nida',     'Nida Salman',       'QA Lead',                     'QA',      'Lead',   40, 'Karachi',  -1050, 'Active',   'MANAGER'],
  ['tariq',    'Tariq Mehmood',     'QA Engineer',                 'QA',      'Mid',    40, 'Lahore',    -470, 'On leave', 'MEMBER'],
  ['areeba',   'Areeba Hassan',     'QA Intern',                   'QA',      'Intern', 24, 'Karachi',    -70, 'Active',   'MEMBER'],
  ['bilal',    'Bilal Anwar',       'DevOps Engineer',             'DevOps',  'Senior', 40, 'Karachi',   -640, 'Active',   'MEMBER'],
  ['imran',    'Imran Zaidi',       'Platform / SRE Engineer',     'DevOps',  'Mid',    40, 'Karachi',   -300, 'Contract', 'MEMBER'],
];

// slug, name, industry, status, health, accountManager, arr, sinceDaysAgo, region, nps, portalEmail
const CLIENTS = [
  ['halcyon',    'Halcyon Health',     'Health',      'Active',     'Healthy',  'maryam', 186000,  -540, 'United Kingdom',        9, 'portal@halcyonhealth.co.uk'],
  ['meridian',   'Meridian Freight',   'Logistics',   'Active',     'Watch',    'aris',   240000,  -820, 'Netherlands',           7, 'portal@meridianfreight.nl'],
  ['kanso',      'Kanso Retail Group', 'Retail',      'Active',     'Healthy',  'maryam', 310000, -1180, 'Singapore',             9, 'portal@kansoretail.sg'],
  ['northlight', 'Northlight Media',   'Media',       'Active',     'At risk',  'omar',   124000,  -260, 'United States',         6, 'portal@northlightmedia.com'],
  ['brightline', 'Brightline Pay',     'Fintech',     'Active',     'Critical', 'aris',   295000,  -390, 'United Arab Emirates',  5, 'portal@brightlinepay.ae'],
  ['atlas',      'Atlas Property',     'Real estate', 'Active',     'Healthy',  'omar',    98000,  -150, 'United Kingdom',        8, 'portal@atlasproperty.co.uk'],
  ['verdant',    'Verdant Finance',    'Fintech',     'Onboarding', 'Healthy',  'omar',   170000,   -24, 'Singapore',          null, 'portal@verdantfinance.sg'],
  ['studyloop',  'Studyloop',          'Education',   'Paused',     'Watch',    'maryam',  56000,  -700, 'Australia',             7, null],
  ['orbitrail',  'Orbit Rail',         'Logistics',   'Churned',    'Watch',    'omar',        0, -1460, 'Germany',               4, null],
];

// name, client, title, email, phone, decisionMaker, lastTouchDaysAgo, owner
const CONTACTS = [
  ['Dr. Elena Whitfield', 'halcyon',   'Chief Medical Officer', 'elena.whitfield@halcyonhealth.co.uk', '+44 20 7946 0812', true,   -3, 'maryam'],
  ['Roni Feldman',        'halcyon',   'Head of Digital',       'roni.feldman@halcyonhealth.co.uk',    '+44 20 7946 0844', false,  -9, 'maryam'],
  ['Joost van Dijk',      'meridian',  'VP Operations',         'j.vandijk@meridianfreight.nl',        '+31 20 555 0119',  true,   -1, 'aris'],
  ['Denga Mokoena',       'meridian',  'Fleet Systems Lead',    'd.mokoena@meridianfreight.nl',        '+31 20 555 0177',  false,  -6, 'aris'],
  ['Wei Ling Tan',        'kanso',     'Group CTO',             'weiling.tan@kansoretail.sg',          '+65 6789 2200',    true,   -2, 'maryam'],
  ['Marcus Ong',          'kanso',     'Head of Ecommerce',     'marcus.ong@kansoretail.sg',           '+65 6789 2241',    false, -11, 'maryam'],
  ['Amara Diallo',        'kanso',     'Retail Ops Manager',    'amara.diallo@kansoretail.sg',         '+65 6789 2290',    false, -16, 'maryam'],
  ['Priya Raghavan',      'northlight','Product Director',      'priya@northlightmedia.com',           '+1 310 555 0142',  true,  -14, 'omar'],
  ['Cole Bennett',        'northlight','Engineering Manager',   'cole@northlightmedia.com',            '+1 310 555 0188',  false, -21, 'omar'],
  ['Yousef Al-Amiri',     'brightline','Chief Product Officer', 'yousef@brightlinepay.ae',             '+971 4 555 0133',  true,   -1, 'aris'],
  ['Layla Haddad',        'brightline','Head of Compliance',    'layla@brightlinepay.ae',              '+971 4 555 0166',  false,  -4, 'aris'],
  ['James Corrigan',      'atlas',     'Managing Director',     'j.corrigan@atlasproperty.co.uk',      '+44 161 555 0121', true,   -5, 'omar'],
  ['Grace Wu',            'verdant',   'Head of Platform',      'grace.wu@verdantfinance.sg',          '+65 6222 0910',    true,   -2, 'omar'],
  ['Nathan Boyd',         'verdant',   'Procurement',           'n.boyd@verdantfinance.sg',            '+65 6222 0944',    false,  -8, 'omar'],
  ['Harriet Lowe',        'studyloop', 'Founder',               'harriet@studyloop.com.au',            '+61 2 8555 0107',  true,  -46, 'maryam'],
  ['Stefan Brandt',       'orbitrail', 'Head of IT',            's.brandt@orbitrail.de',               '+49 30 5555 0190', true, -210, 'omar'],
];

// name, company, stage, source, service, owner, value, receivedDaysAgo, nextStep
const LEADS = [
  ['Ingrid Lars',   'Nordvik Marine',     'Qualified',    'Referral', 'iOS app',     'omar',   120000,  -5, 'Scoping call booked for Thursday'],
  ['Tom Whittaker', 'Cadence Fitness',    'Contacted',    'Inbound',  'iOS app',     'omar',    85000,  -3, 'Sent case studies, awaiting reply'],
  ['Sofia Reyes',   'Pluma Books',        'New',          'Clutch',   'Web app',     'omar',    45000,  -1, 'Needs qualifying — budget unclear'],
  ['Hassan Raza',   'Zamil Logistics',    'Qualified',    'Outbound', 'Android app', 'aris',   160000,  -9, 'Technical discovery scheduled'],
  ['Jenna Okafor',  'Loop Grocery',       'Nurture',      'Inbound',  'Web app',     'omar',    60000, -24, 'Revisiting budget next quarter'],
  ['David Chen',    'Arbor Wealth',       'Contacted',    'Event',    'Web app',     'omar',   210000,  -7, 'Met at Fintech Connect, intro deck sent'],
  ['Nadia Kovac',   'Slate HR',           'New',          'Inbound',  'UI/UX',       'omar',    28000,   0, 'Design-only engagement enquiry'],
  ['Peter Malone',  'Fieldstone Farms',   'Disqualified', 'Clutch',   'Web app',     'omar',    15000, -18, 'Budget well below floor'],
  ['Aiko Tanaka',   'Mirai Clinic',       'Qualified',    'Referral', 'iOS app',     'maryam', 140000, -11, 'Halcyon referral — very warm'],
  ['Lucas Brandt',  'Voltway EV',         'Contacted',    'Outbound', 'Backend',     'aris',    95000,  -6, 'Wants API-only scope, sending SOW draft'],
  ['Emily Shaw',    'Harborlight Hotels', 'Nurture',      'Inbound',  'Maintenance', 'omar',    36000, -31, 'Takeover of an existing app, awaiting code access'],
  ['Raj Patel',     'Mesh Analytics',     'New',          'Upwork',   'AI feature',  'omar',    52000,  -2, 'Wants AI summarisation inside an existing app'],
  ['Clara Dubois',  'Atelier Sens',       'Contacted',    'Clutch',   'UI/UX',       'omar',    24000,  -4, 'Brand-led redesign, timeline is tight'],
];

// name, client, stage, service, value, probability, owner, closeDaysFromNow, source
const DEALS = [
  ['Halcyon Clinician Console — phase 1',  'halcyon',    'Proposal sent', 'Web app',     210000,  60, 'maryam',  21, 'Referral'],
  ['Meridian full fleet rollout',          'meridian',   'Negotiation',   'Android app', 180000,  75, 'aris',    12, 'Referral'],
  ['Kanso regional expansion (MY, TH)',    'kanso',      'Scoping',       'Web app',     265000,  45, 'maryam',  48, 'Referral'],
  ['Brightline phase 2 — merchant app',    'brightline', 'Discovery',     'iOS app',     320000,  25, 'aris',    75, 'Inbound'],
  ['Atlas Property build phase',           'atlas',      'Proposal sent', 'Web app',     140000,  65, 'omar',    18, 'Outbound'],
  ['Verdant Treasury build',               'verdant',    'Negotiation',   'Web app',     195000,  70, 'omar',    26, 'Event'],
  ['Nordvik Marine crew app',              'halcyon',    'Discovery',     'iOS app',     120000,  20, 'omar',    60, 'Referral'],
  ['Zamil Logistics driver app',           'meridian',   'Scoping',       'Android app', 160000,  35, 'aris',    54, 'Outbound'],
  ['Mirai Clinic patient app',             'halcyon',    'Discovery',     'iOS app',     140000,  20, 'maryam',  68, 'Referral'],
  ['Kanso maintenance retainer 2027',      'kanso',      'Won',           'Maintenance',  96000, 100, 'maryam', -12, 'Referral'],
  ['Halcyon offline mode change request',  'halcyon',    'Won',           'iOS app',      48000, 100, 'maryam', -26, 'Referral'],
  ['Northlight phase 2 — TV apps',         'northlight', 'Lost',          'iOS app',     230000,   0, 'omar',    -8, 'Inbound'],
  ['Studyloop replatform',                 'studyloop',  'Lost',          'Web app',     110000,   0, 'maryam', -40, 'Inbound'],
  ['Brightline compliance retainer',       'brightline', 'Won',           'Maintenance',  72000, 100, 'aris',    -4, 'Inbound'],
];

// name, client, status, amount, owner, sentDaysAgo, validUntilDays, version
const PROPOSALS = [
  ['Clinician Console — scope, team and price',        'halcyon',    'In review', 210000, 'maryam',   -6,   24, 'v2'],
  ['Fleet rollout — migration plan and support model', 'meridian',   'Sent',      180000, 'aris',     -3,   27, 'v1'],
  ['Regional expansion — phased storefront rollout',   'kanso',      'Draft',     265000, 'maryam', null, null, 'v1'],
  ['Atlas Property — design to build',                 'atlas',      'Sent',      140000, 'omar',     -9,   21, 'v3'],
  ['Verdant Treasury — discovery to MVP',              'verdant',    'In review', 195000, 'omar',     -4,   26, 'v2'],
  ['Kanso 2027 maintenance retainer',                  'kanso',      'Signed',     96000, 'maryam',  -20,   -6, 'v2'],
  ['Brightline compliance retainer',                   'brightline', 'Signed',     72000, 'aris',    -12,   -2, 'v1'],
  ['Northlight TV apps — phase 2',                     'northlight', 'Declined',  230000, 'omar',    -30,  -10, 'v2'],
  ['Zamil Logistics — driver app estimate',            'meridian',   'Draft',     160000, 'aris',   null, null, 'v1'],
];

// slug, name, client, status, health, lead, team, startDays, endDays, platforms, budget, burned
const PROJECTS = [
  ['halcyon-app',    'Halcyon Patient App',        'halcyon',    'In development', 'Healthy',  'maryam', ['zoya','mubeen','umar','ayesha','tariq'],          -168,  42, ['iOS','Android','Backend'], 186000, 131000],
  ['meridian-app',   'Meridian Driver & Dispatch', 'meridian',   'QA',             'Watch',    'aris',   ['danish','shahwaiz','faisal','hina','nida'],       -224,  21, ['Android','Backend','Web'], 240000, 214000],
  ['kanso-commerce', 'Kanso Commerce Replatform',  'kanso',      'In development', 'Healthy',  'maryam', ['rabia','aliayaz','umar','sana','tariq'],          -112,  84, ['Web','Backend'],           310000, 142000],
  ['northlight-app', 'Northlight Streaming App',   'northlight', 'UAT',            'At risk',  'omar',   ['mubeen','shahwaiz','kabir','yahya'],              -196,   7, ['iOS','Android'],           124000, 128500],
  ['brightline-kyc', 'Brightline Onboarding & KYC','brightline', 'In development', 'Critical', 'aris',   ['umar','hina','zoya','ayesha','nida','bilal'],      -98,  63, ['iOS','Backend'],           295000, 188000],
  ['atlas-portal',   'Atlas Property Portal',      'atlas',      'Design',         'Healthy',  'omar',   ['sana','yahya','rabia'],                            -42,  98, ['Web'],                      98000,  21000],
  ['verdant-dash',   'Verdant Treasury Dashboard', 'verdant',    'Discovery',      'Healthy',  'omar',   ['aris','sana','faisal'],                            -14, 140, ['Web','Backend'],           170000,   9000],
  ['studyloop-web',  'Studyloop Tutor Marketplace','studyloop',  'On hold',        'Watch',    'maryam', ['aliayaz','kabir'],                                -330, -40, ['Web'],                      56000,  54000],
  ['halcyon-console','Halcyon Clinician Console',  'halcyon',    'Discovery',      'Healthy',  'maryam', ['faisal','ayesha'],                                  -7, 175, ['Web','Backend'],                0,   3200],
];

// slug, name, project, status, startDays, endDays, committed, completed, scopeAdded, master, goal
const SPRINTS = [
  ['hal12', 'Halcyon Sprint 12',  'halcyon-app',    'Completed', -42, -31, 34, 34,  2, 'maryam', 'Appointment booking flow end to end'],
  ['hal13', 'Halcyon Sprint 13',  'halcyon-app',    'Completed', -28, -17, 38, 31,  8, 'maryam', 'Secure messaging between patient and clinic'],
  ['hal14', 'Halcyon Sprint 14',  'halcyon-app',    'Completed', -14,  -3, 36, 36,  3, 'maryam', 'Prescription refills and pharmacy handoff'],
  ['hal15', 'Halcyon Sprint 15',  'halcyon-app',    'Active',     -1,  12, 40,  0,  0, 'maryam', 'Offline record caching and biometric unlock'],
  ['mer07', 'Meridian Sprint 7',  'meridian-app',   'Completed', -28, -17, 42, 38,  5, 'aris',   'Route optimisation service and driver handover'],
  ['mer08', 'Meridian Sprint 8',  'meridian-app',   'Active',     -1,  12, 36,  0,  0, 'aris',   'Proof-of-delivery capture and dispatch console fixes'],
  ['kan21', 'Kanso Sprint 21',    'kanso-commerce', 'Completed', -14,  -3, 45, 41,  6, 'maryam', 'Checkout rebuild and payment provider swap'],
  ['kan22', 'Kanso Sprint 22',    'kanso-commerce', 'Active',     -1,  12, 44,  0,  0, 'maryam', 'Multi-warehouse stock and store pickup'],
  ['nor09', 'Northlight Sprint 9','northlight-app', 'In review',  -15, -2, 30, 24, 11, 'omar',   'UAT fixes and playback stability on older devices'],
  ['bri03', 'Brightline Sprint 3','brightline-kyc', 'Completed', -15,  -4, 39, 27, 14, 'aris',   'Document capture and liveness check'],
  ['bri04', 'Brightline Sprint 4','brightline-kyc', 'Active',     -1,  12, 38,  0,  0, 'aris',   'Sanctions screening and risk scoring rework'],
  ['atl03', 'Atlas Sprint 3',     'atlas-portal',   'Planned',    13,  26, 28,  0,  0, 'omar',   'Design system handoff and listing pages'],
  ['ver01', 'Verdant Sprint 1',   'verdant-dash',   'Planned',    20,  33, 24,  0,  0, 'aris',   'Architecture spike and data contract with treasury API'],
];

// title, project, sprint, dept, status, assignee, priority, type, points, startDays, dueDays, estimate, logged, blocks
const TASKS = [
  ['Cache patient records for offline read',           'halcyon-app','hal15','iOS',    'In progress','zoya',    'High',    'Feature', 8, -1,  6, 26, 11, ''],
  ['Face ID / biometric unlock on app resume',         'halcyon-app','hal15','iOS',    'In progress','mubeen',  'High',    'Feature', 5, -1,  4, 16,  7, ''],
  ['Encrypted local store migration for existing users','halcyon-app','hal15','Backend','To do',      'umar',    'Critical','Feature', 8,  2,  9, 24,  0, ''],
  ['Offline queue for appointment changes',            'halcyon-app','hal15','Backend','In progress','hina',    'High',    'Feature', 5, -1,  7, 18,  6, ''],
  ['Empty and error states for offline mode',          'halcyon-app','hal15','Design', 'In review',  'ayesha',  'Medium',  'Design',  3, -3,  1, 10, 10, ''],
  ['Regression pass on booking after cache change',    'halcyon-app','hal15','QA',     'Backlog',    'nida',    'Medium',  'Chore',   5,  6, 11, 14,  0, ''],
  ['Spike: background refresh limits on iOS 19',       'halcyon-app','hal15','iOS',    'Blocked',    'zoya',    'Medium',  'Spike',   3, -1,  3,  8,  4, 'Cache patient records'],
  ['Android parity for biometric unlock',              'halcyon-app','hal15','Android','To do',      'danish',  'High',    'Feature', 5,  3, 10, 16,  0, ''],
  ['Prescription refill request flow',                 'halcyon-app','hal14','iOS',    'Done',       'zoya',    'High',    'Feature', 8,-14, -5, 26, 27, ''],
  ['Pharmacy handoff webhook',                         'halcyon-app','hal14','Backend','Done',       'umar',    'High',    'Feature', 8,-14, -6, 24, 22, ''],
  ['Refill confirmation email template',               'halcyon-app','hal14','Design', 'Done',       'yahya',   'Low',     'Design',  2,-12, -9,  6,  5, ''],
  ['Secure messaging thread UI',                       'halcyon-app','hal13','iOS',    'Done',       'mubeen',  'High',    'Feature', 8,-28,-20, 26, 29, ''],
  ['Message retention policy job',                     'halcyon-app','hal13','Backend','Done',       'hina',    'Medium',  'Chore',   5,-26,-19, 16, 15, ''],
  ['Proof-of-delivery photo capture',                  'meridian-app','mer08','Android','In progress','danish', 'Critical','Feature', 8, -1,  5, 26, 12, ''],
  ['Signature pad offline sync',                       'meridian-app','mer08','Android','In progress','shahwaiz','High',   'Feature', 5, -1,  6, 18,  8, ''],
  ['Dispatch console: stale assignment bug',           'meridian-app','mer08','Web',    'In review',  'rabia',   'High',    'Bug',     3, -4,  0, 10, 11, ''],
  ['Route service: handle depot timezone drift',       'meridian-app','mer08','Backend','Blocked',    'faisal',  'Critical','Bug',     5, -2,  3, 16,  6, 'Proof-of-delivery capture'],
  ['Driver app crash on low storage',                  'meridian-app','mer08','Android','To do',      'shahwaiz','High',    'Bug',     3,  2,  7, 10,  0, ''],
  ['UAT script for proof-of-delivery',                 'meridian-app','mer08','QA',     'To do',      'nida',    'Medium',  'Chore',   3,  4,  9, 10,  0, ''],
  ['Route optimisation service v2',                    'meridian-app','mer07','Backend','Done',       'faisal',  'Critical','Feature',13,-28,-19, 40, 44, ''],
  ['Driver handover screen',                           'meridian-app','mer07','Android','Done',       'danish',  'High',    'Feature', 8,-27,-20, 26, 24, ''],
  ['Dispatch map clustering',                          'meridian-app','mer07','Web',    'Done',       'rabia',   'Medium',  'Feature', 5,-26,-18, 16, 17, ''],
  ['Multi-warehouse stock resolver',                   'kanso-commerce','kan22','Backend','In progress','umar',  'Critical','Feature',13, -1,  9, 40, 15, ''],
  ['Store pickup option at checkout',                  'kanso-commerce','kan22','Web',    'In progress','rabia', 'High',    'Feature', 8, -1,  7, 26, 10, ''],
  ['Pickup slot picker component',                     'kanso-commerce','kan22','Web',    'To do',      'aliayaz','Medium', 'Feature', 5,  3, 10, 16,  0, ''],
  ['Stock badge states across PDP and PLP',            'kanso-commerce','kan22','Design', 'In review',  'sana',   'Medium', 'Design',  3, -3,  1, 10,  9, ''],
  ['Inventory sync job idempotency',                   'kanso-commerce','kan22','Backend','To do',      'kabir',  'High',   'Chore',   5,  4, 11, 16,  0, ''],
  ['Checkout regression suite refresh',                'kanso-commerce','kan22','QA',     'In progress','tariq',  'Medium', 'Chore',   5, -1,  8, 16,  5, ''],
  ['Checkout rebuild — address step',                  'kanso-commerce','kan21','Web',    'Done',       'rabia',  'Critical','Feature',13,-14, -5, 40, 38, ''],
  ['Payment provider swap to Adyen',                   'kanso-commerce','kan21','Backend','Done',       'umar',   'Critical','Feature',13,-14, -4, 40, 43, ''],
  ['Legacy cart migration script',                     'kanso-commerce','kan21','Backend','Done',       'hina',   'High',   'Chore',   8,-12, -6, 26, 24, ''],
  ['Playback stalls on Android 11 devices',            'northlight-app','nor09','Android','In progress','shahwaiz','Critical','Bug',   8, -9,  1, 26, 21, ''],
  ['Subtitle sync drift over 40 minutes',              'northlight-app','nor09','iOS',    'In review',  'mubeen', 'High',   'Bug',     5, -8, -1, 16, 17, ''],
  ['Download manager retry logic',                     'northlight-app','nor09','Backend','Blocked',    'kabir',  'High',   'Bug',     5, -7,  2, 16,  9, 'UAT sign-off'],
  ['Continue-watching row ordering',                   'northlight-app','nor09','iOS',    'Done',       'mubeen', 'Medium', 'Bug',     3,-14, -6, 10, 11, ''],
  ['UAT defect triage session',                        'northlight-app','nor09','Product','In progress','aris',   'High',   'Chore',   2, -2,  2,  6,  3, ''],
  ['Player controls contrast pass',                    'northlight-app','nor09','Design', 'Done',       'yahya',  'Low',    'Design',  2,-12, -8,  6,  6, ''],
  ['Sanctions screening provider integration',         'brightline-kyc','bri04','Backend','In progress','umar',   'Critical','Feature',13,-1, 10, 40, 14, ''],
  ['Risk scoring rules engine rewrite',                'brightline-kyc','bri04','Backend','To do',      'hina',   'Critical','Feature',13, 4, 12, 40,  0, ''],
  ['KYC step-up flow on iOS',                          'brightline-kyc','bri04','iOS',    'In progress','zoya',   'High',   'Feature', 8, -1,  8, 26,  9, ''],
  ['Rejection reason copy and screens',                'brightline-kyc','bri04','Design', 'In review',  'ayesha', 'High',   'Design',  3, -3,  1, 10, 11, ''],
  ['Audit log for every screening decision',           'brightline-kyc','bri04','Backend','Blocked',    'faisal', 'Critical','Feature', 8,-1,  9, 26,  4, 'Compliance sign-off'],
  ['Load test screening endpoint to 200 rps',          'brightline-kyc','bri04','DevOps', 'To do',      'bilal',  'High',   'Chore',   5,  5, 12, 16,  0, ''],
  ['Document capture with liveness check',             'brightline-kyc','bri03','iOS',    'Done',       'zoya',   'Critical','Feature',13,-15, -5, 40, 47, ''],
  ['Document OCR pipeline',                            'brightline-kyc','bri03','Backend','Done',       'umar',   'Critical','Feature',13,-15, -6, 40, 44, ''],
  ['Liveness check false-reject tuning',               'brightline-kyc','bri03','QA',     'Done',       'nida',   'High',   'Chore',   5,-11, -5, 16, 19, ''],
  ['Design system tokens for Atlas brand',             'atlas-portal','atl03','Design', 'Backlog','sana',   'Medium','Design', 8, 13, 20, 26, 0, ''],
  ['Listing page templates',                           'atlas-portal','atl03','Design', 'Backlog','yahya',  'Medium','Design', 5, 15, 22, 16, 0, ''],
  ['Search and filter component spec',                 'atlas-portal','atl03','Web',    'Backlog','rabia',  'Medium','Feature',8, 18, 26, 26, 0, ''],
  ['Treasury API data contract spike',                 'verdant-dash','ver01','Backend','Backlog','faisal', 'High',  'Spike',  8, 20, 27, 26, 0, ''],
  ['Dashboard information architecture',               'verdant-dash','ver01','Design', 'Backlog','sana',   'Medium','Design', 5, 21, 29, 16, 0, ''],
  ['Discovery workshop synthesis',                     'verdant-dash',null,   'Product','In progress','aris','High',  'Chore',  3, -3,  2, 10, 6, ''],
  ['Clinician console technical discovery',            'halcyon-console',null,'Backend','In progress','faisal','Medium','Spike', 5, -6,  4, 16, 8, ''],
  ['Clinician console concept screens',                'halcyon-console',null,'Design', 'To do',   'ayesha','Medium','Design', 5,  2,  9, 16, 0, ''],
  ['Accessibility audit across patient app',           'halcyon-app',null,'QA',     'Backlog','areeba', 'Medium','Chore',  5, null, null, 16, 0, ''],
  ['Replace deprecated push library',                  'halcyon-app',null,'iOS',    'Backlog','mubeen', 'Low',   'Chore',  3, null, null, 10, 0, ''],
  ['Driver app dark mode',                             'meridian-app',null,'Android','Backlog','shahwaiz','Low',  'Feature',8, null, null, 26, 0, ''],
  ['Warehouse admin bulk edit',                        'kanso-commerce',null,'Web',  'Backlog','aliayaz','Medium','Feature',8, null, null, 26, 0, ''],
  ['Cost-per-build reporting in CI',                   'kanso-commerce',null,'DevOps','Backlog','imran', 'Low',   'Chore',  3, null, null, 10, 0, ''],
  ['Migrate CI runners to ARM',                        'brightline-kyc',null,'DevOps','In progress','bilal','Medium','Chore',5, -4,  4, 16, 7, ''],
  ['Terraform module for staging refresh',             'brightline-kyc',null,'DevOps','To do',  'imran',  'Medium','Chore',  5,  1,  8, 16, 0, ''],
  ['Deep link handling rewrite',                       'northlight-app',null,'Android','Backlog','danish','Low',   'Chore',  5, null, null, 16, 0, ''],
  ['Analytics event taxonomy v2',                      'kanso-commerce',null,'Product','To do',  'maryam','Medium','Chore',  3,  2,  9, 10, 0, ''],
  ['Quarterly capacity model refresh',                 'verdant-dash',null,'Product','To do',    'aris',  'Low',   'Chore',  2,  5, 12,  6, 0, ''],
  ['Onboarding checklist for new interns',             'halcyon-app',null,'QA',     'Done',      'nida',  'Low',   'Chore',  2,-20,-14,  6, 7, ''],
  ['Vendor security questionnaire — Brightline',       'brightline-kyc',null,'Product','In review','maryam','High', 'Chore',  3, -5,  0, 10, 8, ''],
  ['Pen test remediation items',                       'brightline-kyc',null,'Backend','To do',  'umar',  'Critical','Chore', 8,  3, 11, 26, 0, ''],
  ['Studyloop maintenance window plan',                'studyloop-web',null,'DevOps','Backlog',  'imran', 'Low',   'Chore',  2, null, null, 6, 0, ''],
  ['Component library upgrade to v4',                  'kanso-commerce',null,'Web',  'In progress','aliayaz','Medium','Chore',5, -2,  5, 16, 6, ''],
  ['Push notification copy review',                    'halcyon-app',null,'Design', 'Done',      'yahya', 'Low',   'Design', 1, -9, -6,  3, 3, ''],
  ['Crash-free rate dashboard',                        'meridian-app',null,'DevOps','Done',      'bilal', 'Medium','Chore',  3,-16,-10, 10, 9, ''],
  ['Split payment support research',                   'kanso-commerce',null,'Product','Backlog','maryam','Low',   'Spike',  3, null, null, 10, 0, ''],
  ['Refactor auth middleware',                         'halcyon-app',null,'Backend','To do',     'kabir', 'Medium','Chore',  5,  4, 12, 16, 0, ''],
  ['Tablet layout for dispatch console',               'meridian-app',null,'Web',   'Backlog',   'rabia', 'Low',   'Feature',8, null, null, 26, 0, ''],
  ['Automated screenshot tests',                       'northlight-app',null,'QA',  'To do',     'tariq', 'Medium','Chore',  5,  6, 14, 16, 0, ''],
  ['Data retention policy implementation',             'brightline-kyc',null,'Backend','Backlog','hina',  'High',  'Feature',8, null, null, 26, 0, ''],
  ['Onboarding funnel analytics review',               'brightline-kyc',null,'Product','Done',   'aris',  'Medium','Chore',  2,-12, -8,  6, 6, ''],
  ['Design QA on KYC screens',                         'brightline-kyc',null,'Design','To do',   'sana',  'Medium','Chore',  3,  1,  7, 10, 0, ''],
  ['Release runbook for store submissions',            'northlight-app',null,'DevOps','In review','bilal','High',  'Chore',  3, -3,  2, 10, 8, ''],
];

// name, project, status, dueDays, owner, clientVisible, note
const MILESTONES = [
  ['Patient app public beta',          'halcyon-app',    'Delivered', -24, 'maryam', true,  'Beta available to 500 invited patients on both stores'],
  ['Offline mode complete',            'halcyon-app',    'Upcoming',   16, 'maryam', true,  'Records readable with no connection, biometric unlock live'],
  ['Halcyon v2.0 App Store release',   'halcyon-app',    'Upcoming',   38, 'maryam', true,  'Public release on iOS and Google Play'],
  ['Driver app pilot — 20 vehicles',   'meridian-app',   'Delivered', -48, 'aris',   true,  'Pilot fleet running the new driver app daily'],
  ['Proof of delivery signed off',     'meridian-app',   'At risk',    11, 'aris',   true,  'POD capture accepted by Meridian operations'],
  ['Full fleet rollout',               'meridian-app',   'Upcoming',   25, 'aris',   true,  'All 340 vehicles migrated off the legacy handheld'],
  ['Checkout replatform live',         'kanso-commerce', 'Delivered',  -6, 'maryam', true,  'New checkout serving 100% of traffic in Singapore'],
  ['Multi-warehouse stock live',       'kanso-commerce', 'Upcoming',   19, 'maryam', true,  'Stock resolved across all four warehouses at PDP'],
  ['Kanso regional rollout (MY, TH)',  'kanso-commerce', 'Upcoming',   62, 'maryam', true,  'Malaysia and Thailand storefronts on the new platform'],
  ['Northlight UAT sign-off',          'northlight-app', 'Slipped',    -2, 'omar',   true,  'Client accepts the build for store submission'],
  ['Northlight store submission',      'northlight-app', 'At risk',     9, 'omar',   true,  'Binaries submitted to Apple and Google review'],
  ['KYC flow feature complete',        'brightline-kyc', 'At risk',    14, 'aris',   true,  'Document capture, liveness, screening and scoring all in'],
  ['Brightline regulatory audit',      'brightline-kyc', 'Upcoming',   44, 'aris',   true,  'External audit of the onboarding decision trail'],
  ['Atlas design system handoff',      'atlas-portal',   'Upcoming',   27, 'omar',   true,  'Tokens, components and specs delivered to build'],
  ['Verdant discovery report',         'verdant-dash',   'Upcoming',   12, 'omar',   true,  'Architecture, scope and estimate delivered'],
  ['Clinician console proposal',       'halcyon-console','Upcoming',   21, 'maryam', false, 'Internal go/no-go on scope and pricing'],
];

// title, project, severity, status, platform, assignee, reporter, foundIn, reportedDays, department
const BUGS = [
  ['App crashes when opening a record while offline', 'halcyon-app',   'Blocker', 'In progress',  'iOS',     'zoya',    'tariq',  '2.4.1 (812)', -2, 'iOS'],
  ['Appointment times shown in UTC for UK users',     'halcyon-app',   'Critical','Triaged',      'iOS',     'mubeen',  'nida',   '2.4.1 (812)', -4, 'iOS'],
  ['Duplicate refill requests on double tap',         'halcyon-app',   'Major',   'Ready for QA', 'Backend', 'umar',    'tariq',  '2.4.0 (804)', -9, 'Backend'],
  ['Message timestamps off by one day',               'halcyon-app',   'Minor',   'New',          'iOS',     'mubeen',  'areeba', '2.4.1 (812)', -1, 'iOS'],
  ['Attachment preview blank on iPad',                'halcyon-app',   'Minor',   'Triaged',      'iOS',     'zoya',    'areeba', '2.4.1 (812)', -3, 'iOS'],
  ['Driver app loses signature on background',        'meridian-app',  'Blocker', 'In progress',  'Android', 'danish',  'nida',   '5.1.0 (221)', -3, 'Android'],
  ['Route ETA negative after depot change',           'meridian-app',  'Critical','In progress',  'Backend', 'faisal',  'nida',   '5.1.0 (221)', -2, 'Backend'],
  ['Dispatch console shows stale assignments',        'meridian-app',  'Major',   'Ready for QA', 'Web',     'rabia',   'tariq',  '5.1.0 (221)', -5, 'Web'],
  ['Photo upload fails over 4 MB',                    'meridian-app',  'Major',   'Triaged',      'Android', 'shahwaiz','nida',   '5.1.0 (221)', -1, 'Android'],
  ['Map markers overlap at high zoom',                'meridian-app',  'Trivial', 'New',          'Web',     'rabia',   'areeba', '5.1.0 (221)', -1, 'Web'],
  ['Stock shows available at wrong warehouse',        'kanso-commerce','Critical','In progress',  'Backend', 'umar',    'tariq',  '3.9.2',       -2, 'Backend'],
  ['Pickup slot picker unusable on Safari 17',        'kanso-commerce','Major',   'Triaged',      'Web',     'aliayaz', 'tariq',  '3.9.2',       -4, 'Web'],
  ['Cart totals flicker during price refresh',        'kanso-commerce','Minor',   'Verified',     'Web',     'rabia',   'tariq',  '3.9.1',      -11, 'Web'],
  ['Adyen 3DS redirect loops on retry',               'kanso-commerce','Blocker', 'Closed',       'Backend', 'umar',    'nida',   '3.9.0',      -16, 'Backend'],
  ['Playback stalls every 4–6 minutes on Android 11', 'northlight-app','Blocker', 'In progress',  'Android', 'shahwaiz','nida',   '1.2.0 (98)',  -9, 'Android'],
  ['Subtitles drift after 40 minutes',                'northlight-app','Critical','Ready for QA', 'iOS',     'mubeen',  'tariq',  '1.2.0 (98)',  -8, 'iOS'],
  ['Downloads never resume after airplane mode',      'northlight-app','Critical','Triaged',      'Backend', 'kabir',   'nida',   '1.2.0 (98)',  -7, 'Backend'],
  ['Continue-watching row shows finished titles',     'northlight-app','Minor',   'Verified',     'iOS',     'mubeen',  'areeba', '1.1.9 (94)', -14, 'iOS'],
  ['Liveness check rejects valid users in low light', 'brightline-kyc','Blocker', 'In progress',  'iOS',     'zoya',    'nida',   '0.9.4',       -3, 'iOS'],
  ['OCR misreads Arabic name fields',                 'brightline-kyc','Critical','Triaged',      'Backend', 'umar',    'nida',   '0.9.4',       -5, 'Backend'],
  ['Screening endpoint times out above 80 rps',       'brightline-kyc','Critical','New',          'Backend', 'bilal',   'bilal',  '0.9.4',       -1, 'DevOps'],
  ['Rejection screen shows raw error code',           'brightline-kyc','Major',   'Ready for QA', 'iOS',     'zoya',    'areeba', '0.9.4',       -6, 'iOS'],
  ['Session expires mid-upload with no warning',      'brightline-kyc','Major',   'Triaged',      'Backend', 'hina',    'tariq',  '0.9.3',      -10, 'Backend'],
  ['Tutor search returns archived profiles',          'studyloop-web', 'Minor',   "Won't fix",    'Web',     'aliayaz', 'tariq',  '2.0.1',      -64, 'Web'],
];

// name, project, status, platform, owner, cases, passed, failed, coverage, runDays
const TEST_RUNS = [
  ['Halcyon 2.4.1 regression — iOS',      'halcyon-app',    'Running',     'iOS',            'tariq',  412, 338,  9, 82, -1],
  ['Halcyon 2.4.1 regression — Android',  'halcyon-app',    'Not started', 'Android',        'areeba', 380,   0,  0,  0,  1],
  ['Meridian 5.1.0 release candidate',    'meridian-app',   'Failed',      'Android',        'nida',   288, 251, 14, 88, -2],
  ['Meridian dispatch console smoke',     'meridian-app',   'Passed',      'Web',            'tariq',   96,  96,  0, 94, -3],
  ['Kanso checkout regression',           'kanso-commerce', 'Passed',      'Web',            'tariq',  324, 324,  0, 91, -4],
  ['Kanso multi-warehouse exploratory',   'kanso-commerce', 'Running',     'Web',            'areeba',  60,  34,  3, 45,  0],
  ['Northlight UAT cycle 3',              'northlight-app', 'Failed',      'Cross-platform', 'nida',   210, 171, 21, 79, -6],
  ['Northlight playback stress suite',    'northlight-app', 'Blocked',     'Android',        'tariq',   88,  22,  7, 30, -5],
  ['Brightline KYC happy path',           'brightline-kyc', 'Passed',      'iOS',            'nida',   134, 134,  0, 86, -8],
  ['Brightline screening load profile',   'brightline-kyc', 'Failed',      'Backend',        'bilal',   40,  28, 12, 70, -1],
];

// name, project, status, platform, build, owner, freezeDays, targetDays, notes
const RELEASES = [
  ['Halcyon 2.4.1 — hotfix',            'halcyon-app',    'In QA',     'iOS',            '812',    'bilal',  -2,   4, 'Offline crash fix and timezone correction'],
  ['Halcyon 2.5.0 — offline mode',      'halcyon-app',    'Planning',  'Cross-platform', '830',    'bilal',  12,  24, 'Offline records, biometric unlock, Android parity'],
  ['Meridian 5.1.0 — proof of delivery','meridian-app',   'Building',  'Android',        '221',    'imran',   5,  13, 'POD capture, signature sync, dispatch fixes'],
  ['Meridian dispatch 5.1.0 web',       'meridian-app',   'In QA',     'Web',            'w-141',  'imran',   2,   9, 'Console fixes shipped alongside the driver app'],
  ['Kanso 3.10.0 — multi-warehouse',    'kanso-commerce', 'Planning',  'Web',            '3.10.0', 'bilal',  10,  19, 'Stock resolution and store pickup'],
  ['Northlight 1.2.0 — stability',      'northlight-app', 'Submitted', 'iOS',            '98',     'bilal',  -3,   6, 'Playback and subtitle fixes, submitted to Apple review'],
  ['Northlight 1.2.0 — Android',        'northlight-app', 'In review', 'Android',        '98',     'bilal',  -3,   7, 'In Google Play review, staged rollout at 10%'],
  ['Brightline 0.9.4 — screening',      'brightline-kyc', 'Building',  'iOS',            '0.9.4',  'imran',   7,  16, 'Sanctions screening and risk scoring behind a flag'],
  ['Brightline 0.9.3 — document capture','brightline-kyc','Live',      'iOS',            '0.9.3',  'bilal', -18, -12, 'Liveness and OCR shipped to the pilot cohort'],
  ['Kanso 3.9.2 — checkout patch',      'kanso-commerce', 'Live',      'Web',            '3.9.2',  'bilal',  -9,  -6, 'Payment retry fix and cart total stability'],
];

// subject, client, status, priority, assignee, channel, openedDays, slaHours, firstReply, csat
const TICKETS = [
  ['Clinicians cannot see messages sent after 6pm',    'halcyon',    'Escalated',      'Critical','umar',    'Portal', -1,   4, '11m',    null],
  ['Request: export patient appointment history to CSV','halcyon',   'Open',           'Medium',  'hina',    'Email',  -4,  26, '2h 10m', null],
  ['Two patients report failed biometric setup',       'halcyon',    'Pending client', 'High',    'zoya',    'Portal', -2,  14, '38m',    null],
  ['Driver tablets logging out overnight',             'meridian',   'Escalated',      'Critical','faisal',  'Phone',  -1,  -3, '6m',     null],
  ['Add a depot to the dispatch console',              'meridian',   'Open',           'Low',     'rabia',   'Email',  -6,  50, '4h 02m', null],
  ['Proof-of-delivery photos not reaching the portal', 'meridian',   'Open',           'High',    'danish',  'Slack',  -1,   9, '22m',    null],
  ['Checkout errors for customers paying by PayNow',   'kanso',      'Open',           'High',    'umar',    'Slack',   0,   7, '14m',    null],
  ['Stock counts differ between web and store tills',  'kanso',      'Pending client', 'Medium',  'kabir',   'Email',  -3,  30, '1h 47m', null],
  ['Bulk price update failed for 1,200 SKUs',          'kanso',      'Resolved',       'High',    'aliayaz', 'Portal', -9,  -6, '26m',       5],
  ['UAT testers cannot install the latest build',      'northlight', 'Escalated',      'High',    'bilal',   'Slack',  -2,  -6, '41m',    null],
  ['Subtitle file rejected for the Spanish dub',       'northlight', 'Open',           'Medium',  'mubeen',  'Email',  -5,  20, '3h 18m', null],
  ['Screening queue backing up in staging',            'brightline', 'Open',           'Critical','bilal',   'Slack',   0,   3, '9m',     null],
  ['Compliance need the decision audit export',        'brightline', 'Pending client', 'High',    'maryam',  'Email',  -4,  22, '1h 05m', null],
  ['Sandbox credentials expired',                      'brightline', 'Resolved',       'Medium',  'imran',   'Portal',-11,  -9, '18m',       4],
  ['Question about the Atlas design handoff format',   'atlas',      'New',            'Low',     'sana',    'Email',   0,  45, '',       null],
  ['Reactivate the Studyloop staging environment',     'studyloop',  'Closed',         'Low',     'imran',   'Email', -38, -36, '5h 40m',    3],
];

// name, project, status, owner, sentDays, dueDays, note
const APPROVALS = [
  ['Offline mode screens — final designs',    'halcyon-app',    'Awaiting client',   'ayesha',  -3,  4, 'Sign off the empty and error states so we can build against them'],
  ['Patient app v2.5 release notes',          'halcyon-app',    'Approved',          'maryam',  -9, -2, 'Copy for the store listing and the in-app what’s new'],
  ['Proof-of-delivery acceptance criteria',   'meridian-app',   'Changes requested', 'aris',    -6,  1, 'Meridian want signature retention extended to 90 days'],
  ['Dispatch console tablet layout',          'meridian-app',   'Awaiting client',   'rabia',   -2,  8, 'Confirm the breakpoint to target for the depot tablets'],
  ['Store pickup copy and legal text',        'kanso-commerce', 'Awaiting client',   'sana',    -4,  3, 'Legal wording for pickup windows and no-show handling'],
  ['Checkout replatform acceptance',          'kanso-commerce', 'Approved',          'maryam', -14, -7, 'Signed off after the regression pass'],
  ['Northlight UAT defect list — cycle 3',    'northlight-app', 'Changes requested', 'omar',    -5, -1, 'Priya wants three more issues added before sign-off'],
  ['KYC rejection copy — compliance review',  'brightline-kyc', 'Awaiting client',   'ayesha',  -2,  2, 'Layla to confirm the wording meets regulator guidance'],
  ['Atlas brand token set',                   'atlas-portal',   'Awaiting client',   'sana',    -1,  9, 'Approve the palette and type scale before component build'],
];

// number, client, project, status, amount, issuedDays, dueDays
const INVOICES = [
  ['NUK-2026-081', 'halcyon',    'halcyon-app',    'Paid',    31000, -38,  -8],
  ['NUK-2026-092', 'halcyon',    'halcyon-app',    'Sent',    31000,  -8,  22],
  ['NUK-2026-083', 'meridian',   'meridian-app',   'Overdue', 42000, -46, -16],
  ['NUK-2026-094', 'meridian',   'meridian-app',   'Sent',    42000,  -7,  23],
  ['NUK-2026-085', 'kanso',      'kanso-commerce', 'Paid',    56000, -40, -10],
  ['NUK-2026-096', 'kanso',      'kanso-commerce', 'Sent',    56000,  -6,  24],
  ['NUK-2026-087', 'northlight', 'northlight-app', 'Overdue', 24000, -50, -20],
  ['NUK-2026-098', 'northlight', 'northlight-app', 'Draft',   24000, null, null],
  ['NUK-2026-089', 'brightline', 'brightline-kyc', 'Paid',    61000, -36,  -6],
  ['NUK-2026-100', 'brightline', 'brightline-kyc', 'Sent',    61000,  -5,  25],
  ['NUK-2026-101', 'atlas',      'atlas-portal',   'Sent',    18000,  -3,  27],
  ['NUK-2026-078', 'studyloop',  'studyloop-web',  'Paid',    14000, -72, -42],
];

// title, person, type, status, startDays, endDays, days, cover
const LEAVE = [
  ['Tariq — annual leave',          'tariq',  'Annual',         'Approved',  -2,  5, 6, 'areeba'],
  ['Zoya — family event',           'zoya',   'Annual',         'Approved',  16, 20, 5, 'mubeen'],
  ['Danish — sick leave',           'danish', 'Sick',           'Approved',  -6, -5, 2, 'shahwaiz'],
  ['Public holiday — Karachi office','aris',  'Public holiday', 'Approved',  24, 24, 1, null],
  ['Rabia — annual leave',          'rabia',  'Annual',         'Requested', 30, 39, 8, 'aliayaz'],
  ['Hina — annual leave',           'hina',   'Annual',         'Approved',   9, 13, 5, 'kabir'],
  ['Bilal — conference',            'bilal',  'Unpaid',         'Requested', 38, 41, 4, 'imran'],
  ['Ayesha — annual leave',         'ayesha', 'Annual',         'Approved',  44, 53, 8, 'yahya'],
  ['Areeba — university exams',     'areeba', 'Unpaid',         'Approved',  51, 58, 6, 'tariq'],
];

// person, project, department, daysAgo, hours, billable, note
const TIME_LOGS = [
  ['zoya','halcyon-app','iOS',-1,6.5,true,'Offline cache schema and store wiring'],
  ['zoya','halcyon-app','iOS',-2,7,true,'Offline cache spike'],
  ['mubeen','halcyon-app','iOS',-1,5.5,true,'Biometric unlock on resume'],
  ['mubeen','northlight-app','iOS',-2,4,true,'Subtitle drift investigation'],
  ['umar','brightline-kyc','Backend',-1,7.5,true,'Sanctions provider integration'],
  ['umar','kanso-commerce','Backend',-2,6,true,'Warehouse stock resolver'],
  ['hina','halcyon-app','Backend',-1,6,true,'Offline mutation queue'],
  ['hina','halcyon-app','Backend',-3,5.5,true,'Queue conflict handling'],
  ['kabir','northlight-app','Backend',-1,5,true,'Download retry logic'],
  ['kabir','kanso-commerce','Backend',-4,4.5,true,'Inventory sync idempotency'],
  ['faisal','meridian-app','Backend',-1,4,true,'Timezone drift on depot records'],
  ['faisal','halcyon-console','Backend',-2,3.5,false,'Clinician console discovery'],
  ['danish','meridian-app','Android',-1,7,true,'POD photo capture'],
  ['danish','meridian-app','Android',-2,6.5,true,'Camera permissions and compression'],
  ['shahwaiz','northlight-app','Android',-1,6,true,'Playback stall profiling'],
  ['shahwaiz','meridian-app','Android',-3,5,true,'Signature pad sync'],
  ['ayesha','brightline-kyc','Design',-1,5.5,true,'Rejection reason screens'],
  ['ayesha','halcyon-app','Design',-2,4,true,'Offline empty states'],
  ['sana','kanso-commerce','Design',-1,4.5,true,'Stock badge states'],
  ['sana','atlas-portal','Design',-2,5,true,'Atlas token exploration'],
  ['yahya','atlas-portal','Design',-1,6,true,'Listing page templates'],
  ['rabia','kanso-commerce','Web',-1,7,true,'Store pickup at checkout'],
  ['rabia','meridian-app','Web',-2,3.5,true,'Stale assignment fix'],
  ['aliayaz','kanso-commerce','Web',-1,5.5,true,'Component library upgrade'],
  ['nida','meridian-app','QA',-1,6,true,'Release candidate regression'],
  ['nida','brightline-kyc','QA',-2,5,true,'KYC happy path suite'],
  ['tariq','halcyon-app','QA',-3,7,true,'2.4.1 regression pass'],
  ['areeba','kanso-commerce','QA',-1,4,true,'Exploratory on multi-warehouse'],
  ['bilal','brightline-kyc','DevOps',-1,5,false,'ARM runner migration'],
  ['bilal','northlight-app','DevOps',-2,3,true,'Store submission runbook'],
  ['imran','brightline-kyc','DevOps',-1,4.5,false,'Terraform staging refresh'],
  ['aris','verdant-dash','Product',-1,3,false,'Discovery workshop synthesis'],
  ['maryam','kanso-commerce','Product',-1,2.5,false,'Analytics taxonomy review'],
  ['omar','atlas-portal','Product',-2,2,false,'Proposal revision v3'],
];

// actor, text, hoursAgo
const ACTIVITY = [
  ['aris',   'moved “Route service: handle depot timezone drift” to Blocked', 5],
  ['zoya',   'posted an update on “Cache patient records for offline read”', 9],
  ['nida',   'moved “Meridian 5.1.0 release candidate” to Failed', 14],
  ['maryam', 'added “Multi-warehouse stock live” to Milestones', 20],
  ['umar',   'moved “Payment provider swap to Adyen” to Done', 26],
  ['omar',   'moved “Verdant Treasury build” to Negotiation', 31],
  ['bilal',  'moved “Northlight 1.2.0 — stability” to Submitted', 38],
  ['ayesha', 'moved “Rejection reason copy and screens” to In review', 44],
  ['aris',   'assigned “Audit log for every screening decision” to Faisal Rehman', 52],
  ['maryam', 'moved “Checkout replatform live” to Delivered', 61],
];

// taskTitle, author, body, hoursAgo
const UPDATES = [
  ['Cache patient records for offline read', 'zoya',   'Schema is in. The migration for existing users is the risky part — pairing with Umar tomorrow morning.', 52],
  ['Cache patient records for offline read', 'aris',   'Good. Keep the migration behind a flag so we can ship the rest of the sprint if it slips.', 47],
  ['Route service: handle depot timezone drift', 'faisal', 'Blocked on Meridian confirming which depots changed timezone. Chased Denga twice.', 20],
  ['Audit log for every screening decision', 'aris',   'Compliance want the audit log signed off before we merge. Layla is reviewing the spec today.', 9],
];

// taskTitle, [ [text, done], ... ]
const SUBTASKS = [
  ['Cache patient records for offline read', [['Define cache schema', true], ['Write migration', false], ['Invalidate on logout', false], ['Measure cold-start impact', false]]],
  ['Audit log for every screening decision', [['Spec agreed with compliance', true], ['Immutable write path', false], ['Retention 7 years', false]]],
];

// =====================================================================
//  INSERT
// =====================================================================

const personId = new Map();
const clientId = new Map();
const projectId = new Map();
const sprintId = new Map();
const taskId = new Map();

/** Look up a slug, tolerating null. Throws on a typo so bad data never reaches the db. */
function ref(map, slug, what) {
  if (slug === null || slug === undefined) return null;
  const id = map.get(slug);
  if (!id) throw new Error(`Seed data refers to an unknown ${what}: "${slug}"`);
  return id;
}

async function seed(db) {
  console.log('Clearing existing data…');
  await db.query(`TRUNCATE activity, time_logs, leave_requests, approvals, tickets, releases,
    test_runs, bugs, milestones, updates, subtasks, tasks, sprints, project_members, projects,
    invoices, proposals, deals, leads, contacts, users, clients, people RESTART IDENTITY CASCADE`);

  // ---- people
  for (const [slug, name, title, dept, seniority, capacity, location, joined, status] of PEOPLE) {
    const { rows } = await db.query(
      `INSERT INTO people (name, role_title, department, seniority, status, capacity_hours, location, email, started_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [name, title, dept, seniority, status, capacity, location, `${slug}@nuuke.studio`, day(joined)]
    );
    personId.set(slug, rows[0].id);
  }

  // ---- clients
  for (const [slug, name, industry, status, health, am, arr, since, region, nps] of CLIENTS) {
    const { rows } = await db.query(
      `INSERT INTO clients (name, industry, status, health, account_manager_id, arr, since, region, nps)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [name, industry, status, health, ref(personId, am, 'person'), arr, day(since), region, nps]
    );
    clientId.set(slug, rows[0].id);
  }

  // ---- logins: one per person, plus one portal login per account that has an address
  const passwordHash = await bcrypt.hash(env.SEED_PASSWORD, 12);
  for (const [slug, , , , , , , , , loginRole] of PEOPLE) {
    await db.query(
      `INSERT INTO users (email, password_hash, role, person_id) VALUES ($1,$2,$3,$4)`,
      [`${slug}@nuuke.studio`, passwordHash, loginRole, personId.get(slug)]
    );
  }
  let portalLogins = 0;
  for (const [slug, , , , , , , , , , portalEmail] of CLIENTS) {
    if (!portalEmail) continue;
    await db.query(
      `INSERT INTO users (email, password_hash, role, client_id) VALUES ($1,$2,'CLIENT',$3)`,
      [portalEmail, passwordHash, clientId.get(slug)]
    );
    portalLogins += 1;
  }

  // ---- contacts
  for (const [name, client, title, email, phone, dm, touch, owner] of CONTACTS) {
    await db.query(
      `INSERT INTO contacts (name, client_id, title, email, phone, is_decision_maker, last_touch, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [name, ref(clientId, client, 'client'), title, email, phone, dm, day(touch), ref(personId, owner, 'person')]
    );
  }

  // ---- leads
  for (const [name, company, stage, source, service, owner, value, received, next] of LEADS) {
    await db.query(
      `INSERT INTO leads (name, company, stage, source, service, owner_id, value, received_on, next_step)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [name, company, stage, source, service, ref(personId, owner, 'person'), value, day(received), next]
    );
  }

  // ---- deals
  for (const [name, client, stage, service, value, probability, owner, close, source] of DEALS) {
    await db.query(
      `INSERT INTO deals (name, client_id, stage, service, value, probability, owner_id, close_date, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [name, ref(clientId, client, 'client'), stage, service, value, probability,
       ref(personId, owner, 'person'), day(close), source]
    );
  }

  // ---- proposals
  for (const [name, client, status, amount, owner, sent, valid, version] of PROPOSALS) {
    await db.query(
      `INSERT INTO proposals (name, client_id, status, amount, owner_id, sent_on, valid_until, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [name, ref(clientId, client, 'client'), status, amount, ref(personId, owner, 'person'),
       day(sent), day(valid), version]
    );
  }

  // ---- projects + squads
  for (const [slug, name, client, status, health, lead, team, start, end, platforms, budget, burned] of PROJECTS) {
    const { rows } = await db.query(
      `INSERT INTO projects (name, client_id, status, health, lead_id, start_on, end_on, platforms, budget, burned)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [name, ref(clientId, client, 'client'), status, health, ref(personId, lead, 'person'),
       day(start), day(end), platforms, budget, burned]
    );
    projectId.set(slug, rows[0].id);
    for (const member of team) {
      await db.query(`INSERT INTO project_members (project_id, person_id) VALUES ($1,$2)`,
        [rows[0].id, ref(personId, member, 'person')]);
    }
  }

  // ---- sprints
  for (const [slug, name, project, status, start, end, committed, completed, scope, master, goal] of SPRINTS) {
    const { rows } = await db.query(
      `INSERT INTO sprints (name, project_id, status, goal, start_on, end_on,
         committed_points, completed_points, scope_added_points, scrum_master_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [name, ref(projectId, project, 'project'), status, goal, day(start), day(end),
       committed, completed, scope, ref(personId, master, 'person')]
    );
    sprintId.set(slug, rows[0].id);
  }

  // ---- tasks
  let n = 1040;
  for (const [title, project, sprint, dept, status, assignee, priority, type, points,
               start, due, estimate, logged, blocks] of TASKS) {
    const { rows } = await db.query(
      `INSERT INTO tasks (key, title, project_id, sprint_id, department, status, assignee_id,
         priority, type, points, start_on, due_on, estimate_hours, logged_hours, blocks, done_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [`NUK-${n++}`, title, ref(projectId, project, 'project'), ref(sprintId, sprint, 'sprint'),
       dept, status, ref(personId, assignee, 'person'), priority, type, points,
       day(start), day(due), estimate, logged, blocks,
       status === 'Done' ? day(due ?? -8) : null]
    );
    taskId.set(title, rows[0].id);
  }

  for (const [title, items] of SUBTASKS) {
    for (let i = 0; i < items.length; i += 1) {
      await db.query(`INSERT INTO subtasks (task_id, text, done, position) VALUES ($1,$2,$3,$4)`,
        [ref(taskId, title, 'task'), items[i][0], items[i][1], i]);
    }
  }

  for (const [title, author, body, ago] of UPDATES) {
    await db.query(
      `INSERT INTO updates (entity_type, entity_id, author_id, body, created_at)
       VALUES ('tasks',$1,$2,$3,$4)`,
      [ref(taskId, title, 'task'), ref(personId, author, 'person'), body, hours(-ago)]
    );
  }

  // ---- milestones
  for (const [name, project, status, due, owner, visible, note] of MILESTONES) {
    await db.query(
      `INSERT INTO milestones (name, project_id, status, due_on, owner_id, client_visible, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [name, ref(projectId, project, 'project'), status, day(due), ref(personId, owner, 'person'), visible, note]
    );
  }

  // ---- bugs
  let b = 410;
  for (const [title, project, severity, status, platform, assignee, reporter, foundIn, reported, dept] of BUGS) {
    await db.query(
      `INSERT INTO bugs (key, title, project_id, severity, status, platform, department,
         assignee_id, reporter_id, found_in, reported_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [`BUG-${b++}`, title, ref(projectId, project, 'project'), severity, status, platform, dept,
       ref(personId, assignee, 'person'), ref(personId, reporter, 'person'), foundIn, day(reported)]
    );
  }

  // ---- test runs
  for (const [name, project, status, platform, owner, cases, passed, failed, coverage, run] of TEST_RUNS) {
    await db.query(
      `INSERT INTO test_runs (name, project_id, status, platform, owner_id, cases, passed, failed, coverage, run_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [name, ref(projectId, project, 'project'), status, platform, ref(personId, owner, 'person'),
       cases, passed, failed, coverage, day(run)]
    );
  }

  // ---- releases
  for (const [name, project, status, platform, build, owner, freeze, target, notes] of RELEASES) {
    await db.query(
      `INSERT INTO releases (name, project_id, status, platform, build, owner_id, code_freeze_on, target_on, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [name, ref(projectId, project, 'project'), status, platform, build,
       ref(personId, owner, 'person'), day(freeze), day(target), notes]
    );
  }

  // ---- support tickets
  let t = 2210;
  for (const [subject, client, status, priority, assignee, channel, opened, sla, firstReply, csat] of TICKETS) {
    await db.query(
      `INSERT INTO tickets (key, subject, client_id, status, priority, assignee_id, channel,
         opened_on, sla_due_at, first_reply, csat)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [`SUP-${t++}`, subject, ref(clientId, client, 'client'), status, priority,
       ref(personId, assignee, 'person'), channel, day(opened), hours(sla), firstReply, csat]
    );
  }

  // ---- approvals
  for (const [name, project, status, owner, sent, due, note] of APPROVALS) {
    await db.query(
      `INSERT INTO approvals (name, project_id, status, owner_id, sent_on, due_on, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [name, ref(projectId, project, 'project'), status, ref(personId, owner, 'person'), day(sent), day(due), note]
    );
  }

  // ---- invoices
  for (const [number, client, project, status, amount, issued, due] of INVOICES) {
    await db.query(
      `INSERT INTO invoices (number, client_id, project_id, status, amount, issued_on, due_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [number, ref(clientId, client, 'client'), ref(projectId, project, 'project'),
       status, amount, day(issued), day(due)]
    );
  }

  // ---- leave
  for (const [title, person, type, status, start, end, days, cover] of LEAVE) {
    await db.query(
      `INSERT INTO leave_requests (title, person_id, type, status, start_on, end_on, days, cover_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [title, ref(personId, person, 'person'), type, status, day(start), day(end), days,
       ref(personId, cover, 'person')]
    );
  }

  // ---- time logs
  for (const [person, project, dept, ago, hrs, billable, note] of TIME_LOGS) {
    await db.query(
      `INSERT INTO time_logs (note, person_id, project_id, department, logged_on, hours, billable)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [note, ref(personId, person, 'person'), ref(projectId, project, 'project'), dept, day(ago), hrs, billable]
    );
  }

  // ---- activity feed
  for (const [actor, text, ago] of ACTIVITY) {
    await db.query(`INSERT INTO activity (actor_id, text, created_at) VALUES ($1,$2,$3)`,
      [ref(personId, actor, 'person'), text, hours(-ago)]);
  }

  return { portalLogins };
}

const counts = async () => {
  const tables = ['people', 'users', 'clients', 'contacts', 'leads', 'deals', 'proposals', 'invoices',
    'projects', 'sprints', 'tasks', 'milestones', 'bugs', 'test_runs', 'releases', 'tickets',
    'approvals', 'leave_requests', 'time_logs', 'activity'];
  const parts = tables.map((t) => `(SELECT count(*) FROM ${t}) AS ${t}`);
  const { rows } = await pool.query(`SELECT ${parts.join(', ')}`);
  return rows[0];
};

try {
  const { portalLogins } = await withTransaction(seed);
  const c = await counts();
  const total = Object.values(c).reduce((sum, v) => sum + Number(v), 0);

  console.log('\nSeeded:');
  for (const [table, count] of Object.entries(c)) console.log(`  ${table.padEnd(16)} ${count}`);
  console.log(`  ${'—'.repeat(16)} ${total} rows\n`);
  console.log('Sign in with any of these — the password is whatever SEED_PASSWORD is set to:');
  console.log(`  ADMIN    aris@nuuke.studio`);
  console.log(`  MANAGER  maryam@nuuke.studio`);
  console.log(`  MEMBER   zoya@nuuke.studio`);
  console.log(`  CLIENT   portal@halcyonhealth.co.uk   (+ ${portalLogins - 1} other client portals)`);
  console.log(`\nPassword: ${env.SEED_PASSWORD}\n`);
  console.log('Change every one of these before you put this anywhere real.\n');
  await pool.end();
} catch (err) {
  console.error('\nSeeding failed:', err.message);
  if (err.detail) console.error(err.detail);
  await pool.end().catch(() => {});
  process.exit(1);
}
