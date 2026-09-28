/**
 * Single source of truth for every enumerated value in the product.
 *
 * The API validates writes against these lists (Zod), the database mirrors them as
 * CHECK constraints, and the React app fetches them from GET /api/meta so the two
 * can never drift. Adding a value means: add it here, update db/schema.sql, migrate.
 *
 * Each entry is [label, colour]. Colours are the status fills used across the UI.
 */

export const ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'CLIENT'];

export const DEPARTMENTS = [
  ['Backend', '#0073B1'],
  ['iOS', '#009D5D'],
  ['Design', '#8E4EC6'],
  ['Android', '#C97A0A'],
  ['Web', '#12A89B'],
  ['Product', '#D33A50'],
  ['DevOps', '#4B4FD0'],
  ['QA', '#E04E1B'],
];

export const OPTIONS = {
  taskStatus: [
    ['Backlog', '#C3C6D4'],
    ['To do', '#579BFC'],
    ['In progress', '#FDAB3D'],
    ['In review', '#A25DDC'],
    ['Blocked', '#E2445C'],
    ['Done', '#00C875'],
  ],
  priority: [
    ['Critical', '#BB3354'],
    ['High', '#FF642E'],
    ['Medium', '#579BFC'],
    ['Low', '#C3C6D4'],
  ],
  taskType: [
    ['Feature', '#0086C0'],
    ['Bug', '#E2445C'],
    ['Chore', '#808192'],
    ['Spike', '#A25DDC'],
    ['Design', '#FF5AC4'],
  ],
  projectStatus: [
    ['Discovery', '#579BFC'],
    ['Design', '#FF5AC4'],
    ['In development', '#FDAB3D'],
    ['QA', '#A25DDC'],
    ['UAT', '#0086C0'],
    ['Launched', '#00C875'],
    ['On hold', '#808192'],
  ],
  health: [
    ['Healthy', '#00C875'],
    ['Watch', '#FDAB3D'],
    ['At risk', '#FF642E'],
    ['Critical', '#E2445C'],
  ],
  sprintStatus: [
    ['Planned', '#C3C6D4'],
    ['Active', '#FDAB3D'],
    ['In review', '#A25DDC'],
    ['Completed', '#00C875'],
  ],
  dealStage: [
    ['Discovery', '#579BFC'],
    ['Scoping', '#0086C0'],
    ['Proposal sent', '#A25DDC'],
    ['Negotiation', '#FDAB3D'],
    ['Won', '#00C875'],
    ['Lost', '#E2445C'],
  ],
  leadStage: [
    ['New', '#C3C6D4'],
    ['Contacted', '#579BFC'],
    ['Qualified', '#00C875'],
    ['Nurture', '#FDAB3D'],
    ['Disqualified', '#808192'],
  ],
  source: [
    ['Referral', '#00C875'],
    ['Inbound', '#0086C0'],
    ['Outbound', '#A25DDC'],
    ['Clutch', '#FDAB3D'],
    ['Upwork', '#2BCBBA'],
    ['Event', '#FF5AC4'],
  ],
  clientStatus: [
    ['Onboarding', '#579BFC'],
    ['Active', '#00C875'],
    ['Paused', '#FDAB3D'],
    ['Churned', '#808192'],
  ],
  proposalStatus: [
    ['Draft', '#C3C6D4'],
    ['Sent', '#579BFC'],
    ['In review', '#A25DDC'],
    ['Signed', '#00C875'],
    ['Declined', '#E2445C'],
  ],
  invoiceStatus: [
    ['Draft', '#C3C6D4'],
    ['Sent', '#579BFC'],
    ['Paid', '#00C875'],
    ['Overdue', '#E2445C'],
  ],
  bugStatus: [
    ['New', '#C3C6D4'],
    ['Triaged', '#579BFC'],
    ['In progress', '#FDAB3D'],
    ['Ready for QA', '#A25DDC'],
    ['Verified', '#2BCBBA'],
    ['Closed', '#00C875'],
    ["Won't fix", '#808192'],
  ],
  severity: [
    ['Blocker', '#BB3354'],
    ['Critical', '#E2445C'],
    ['Major', '#FF642E'],
    ['Minor', '#579BFC'],
    ['Trivial', '#C3C6D4'],
  ],
  platform: [
    ['iOS', '#808192'],
    ['Android', '#037F4C'],
    ['Web', '#0086C0'],
    ['Backend', '#784BD1'],
    ['Cross-platform', '#2BCBBA'],
  ],
  releaseStatus: [
    ['Planning', '#C3C6D4'],
    ['Building', '#579BFC'],
    ['In QA', '#FDAB3D'],
    ['Submitted', '#A25DDC'],
    ['In review', '#784BD1'],
    ['Live', '#00C875'],
    ['Rejected', '#E2445C'],
  ],
  testStatus: [
    ['Not started', '#C3C6D4'],
    ['Running', '#FDAB3D'],
    ['Passed', '#00C875'],
    ['Failed', '#E2445C'],
    ['Blocked', '#808192'],
  ],
  ticketStatus: [
    ['New', '#579BFC'],
    ['Open', '#FDAB3D'],
    ['Pending client', '#A25DDC'],
    ['Escalated', '#E2445C'],
    ['Resolved', '#00C875'],
    ['Closed', '#808192'],
  ],
  channel: [
    ['Portal', '#0086C0'],
    ['Email', '#579BFC'],
    ['Slack', '#A25DDC'],
    ['Phone', '#FDAB3D'],
  ],
  milestoneStatus: [
    ['Upcoming', '#579BFC'],
    ['At risk', '#FDAB3D'],
    ['Slipped', '#E2445C'],
    ['Delivered', '#00C875'],
  ],
  approvalStatus: [
    ['Awaiting client', '#FDAB3D'],
    ['Changes requested', '#FF642E'],
    ['Approved', '#00C875'],
  ],
  leaveType: [
    ['Annual', '#0086C0'],
    ['Sick', '#FF642E'],
    ['Public holiday', '#2BCBBA'],
    ['Unpaid', '#808192'],
  ],
  leaveStatus: [
    ['Requested', '#FDAB3D'],
    ['Approved', '#00C875'],
    ['Declined', '#E2445C'],
  ],
  peopleStatus: [
    ['Active', '#00C875'],
    ['On leave', '#FDAB3D'],
    ['Contract', '#579BFC'],
    ['Notice', '#FF642E'],
  ],
  seniority: [
    ['Intern', '#C3C6D4'],
    ['Junior', '#579BFC'],
    ['Mid', '#0086C0'],
    ['Senior', '#A25DDC'],
    ['Lead', '#784BD1'],
    ['Head', '#BB3354'],
  ],
  industry: [
    ['Fintech', '#00C875'],
    ['Health', '#2BCBBA'],
    ['Retail', '#FF5AC4'],
    ['Logistics', '#FDAB3D'],
    ['Media', '#A25DDC'],
    ['Education', '#0086C0'],
    ['Real estate', '#A4795A'],
  ],
  service: [
    ['iOS app', '#808192'],
    ['Android app', '#037F4C'],
    ['Web app', '#0086C0'],
    ['UI/UX', '#FF5AC4'],
    ['Backend', '#784BD1'],
    ['Maintenance', '#2BCBBA'],
    ['AI feature', '#BB3354'],
  ],
  department: DEPARTMENTS,
};

/** Just the labels, for Zod enums and SQL CHECK constraints. */
export const labels = (key) => OPTIONS[key].map(([label]) => label);

/** Statuses a client is allowed to see on the portal — backlog work stays internal. */
export const CLIENT_VISIBLE_TASK_STATUS = ['In progress', 'In review', 'Done'];

/** Statuses that count as "finished" when a board shows a completion percentage. */
export const DONE_LIKE = new Set([
  'Done', 'Closed', 'Completed', 'Won', 'Live', 'Paid', 'Approved', 'Delivered', 'Verified', 'Signed', 'Launched',
]);
