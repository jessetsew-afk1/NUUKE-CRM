/**
 * Who can do what, per board.
 *
 * The four parties:
 *
 *   ADMIN    Aris and anyone he trusts with the whole company. Everything, plus
 *            user management, billing and deletion.
 *   MANAGER  Delivery and sales leads. Everything operational and commercial —
 *            projects, sprints, pipeline, people, support — but cannot manage
 *            logins, cannot issue invoices, and cannot delete accounts.
 *   MEMBER   Engineers, designers, QA. Reads the delivery boards, writes only the
 *            rows they own (their tickets, their defects, their time, their
 *            leave). Never sees leads, deals, proposals or invoices — the
 *            commercial wall.
 *   CLIENT   Portal only. Cannot reach any route in this file; served entirely by
 *            /api/portal, which is scoped to their own account in SQL.
 *
 * `memberOwn` names the column that has to match the member's own person row
 * before they may change it. `memberCreate` says whether they may add rows at all.
 */

const ALL_STAFF = ['ADMIN', 'MANAGER', 'MEMBER'];
const LEADS = ['ADMIN', 'MANAGER'];
const ADMIN_ONLY = ['ADMIN'];

export const RESOURCES = {
  people: {
    table: 'people',
    order: 'department, name',
    read: ALL_STAFF, write: LEADS, remove: ADMIN_ONLY,
    memberOwn: 'id', memberCreate: false,
  },
  clients: {
    table: 'clients',
    order: 'name',
    read: ALL_STAFF, write: LEADS, remove: ADMIN_ONLY,
    memberOwn: null, memberCreate: false,
  },
  contacts: {
    table: 'contacts',
    order: 'client_id, name',
    read: LEADS, write: LEADS, remove: LEADS,
    memberOwn: null, memberCreate: false,
  },
  leads: {
    table: 'leads',
    order: 'received_on DESC NULLS LAST, id DESC',
    read: LEADS, write: LEADS, remove: LEADS,
    memberOwn: null, memberCreate: false,
  },
  deals: {
    table: 'deals',
    order: 'close_date NULLS LAST, id',
    read: LEADS, write: LEADS, remove: ADMIN_ONLY,
    memberOwn: null, memberCreate: false,
  },
  proposals: {
    table: 'proposals',
    order: 'sent_on DESC NULLS LAST, id DESC',
    read: LEADS, write: LEADS, remove: ADMIN_ONLY,
    memberOwn: null, memberCreate: false,
  },
  invoices: {
    table: 'invoices',
    order: 'issued_on DESC NULLS LAST, id DESC',
    read: LEADS, write: ADMIN_ONLY, remove: ADMIN_ONLY,
    memberOwn: null, memberCreate: false,
  },
  projects: {
    table: 'projects',
    order: 'start_on NULLS LAST, id',
    read: ALL_STAFF, write: LEADS, remove: ADMIN_ONLY,
    memberOwn: null, memberCreate: false,
  },
  sprints: {
    table: 'sprints',
    order: 'project_id, start_on NULLS LAST, id',
    read: ALL_STAFF, write: LEADS, remove: LEADS,
    memberOwn: null, memberCreate: false,
  },
  tasks: {
    table: 'tasks',
    order: 'id',
    read: ALL_STAFF, write: ALL_STAFF, remove: LEADS,
    memberOwn: 'assignee_id', memberCreate: true,
    keyPrefix: 'NUK', comments: true, subtasks: true,
  },
  milestones: {
    table: 'milestones',
    order: 'due_on NULLS LAST, id',
    read: ALL_STAFF, write: LEADS, remove: LEADS,
    memberOwn: null, memberCreate: false, comments: true,
  },
  bugs: {
    table: 'bugs',
    order: 'id',
    read: ALL_STAFF, write: ALL_STAFF, remove: LEADS,
    memberOwn: 'assignee_id', memberCreate: true,
    keyPrefix: 'BUG', comments: true,
  },
  test_runs: {
    table: 'test_runs',
    order: 'run_on DESC NULLS LAST, id DESC',
    read: ALL_STAFF, write: ALL_STAFF, remove: LEADS,
    memberOwn: 'owner_id', memberCreate: true,
  },
  releases: {
    table: 'releases',
    order: 'target_on NULLS LAST, id',
    read: ALL_STAFF, write: ALL_STAFF, remove: LEADS,
    memberOwn: 'owner_id', memberCreate: true, comments: true,
  },
  tickets: {
    table: 'tickets',
    order: 'sla_due_at NULLS LAST, id',
    read: ALL_STAFF, write: ALL_STAFF, remove: LEADS,
    memberOwn: 'assignee_id', memberCreate: true,
    keyPrefix: 'SUP', comments: true,
  },
  approvals: {
    table: 'approvals',
    order: 'due_on NULLS LAST, id',
    read: ALL_STAFF, write: LEADS, remove: LEADS,
    memberOwn: null, memberCreate: false, comments: true,
  },
  leave_requests: {
    table: 'leave_requests',
    order: 'start_on, id',
    read: ALL_STAFF, write: ALL_STAFF, remove: LEADS,
    memberOwn: 'person_id', memberCreate: true, forcePerson: 'person_id',
  },
  time_logs: {
    table: 'time_logs',
    order: 'logged_on DESC, id DESC',
    read: ALL_STAFF, write: ALL_STAFF, remove: ALL_STAFF,
    memberOwn: 'person_id', memberCreate: true, forcePerson: 'person_id',
  },
};

/** Boards a member is not allowed to read at all — the commercial wall. */
export const MEMBER_BLOCKED = Object.entries(RESOURCES)
  .filter(([, cfg]) => !cfg.read.includes('MEMBER'))
  .map(([name]) => name);

export const resourceNames = Object.keys(RESOURCES);
