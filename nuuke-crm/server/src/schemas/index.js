import { z } from 'zod';
import {
  option, optionOrNull, text, requiredText, idOrNull, dateOrNull, timestampOrNull,
  money, percent, points, hoursField, count, flag, email, password, asUpdate,
} from './fields.js';
import { labels } from '../domain/options.js';

// ---------------------------------------------------------------- auth
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: password,
});

export const userCreateSchema = z
  .object({
    email,
    password,
    role: z.enum(['ADMIN', 'MANAGER', 'MEMBER', 'CLIENT']),
    person_id: idOrNull.default(null),
    client_id: idOrNull.default(null),
    is_active: flag.default(true),
  })
  .refine((v) => (v.role === 'CLIENT' ? v.client_id !== null : v.client_id === null), {
    message: 'A client login needs an account, and a staff login must not have one',
    path: ['client_id'],
  })
  .refine((v) => (v.role === 'CLIENT' ? v.person_id === null : true), {
    message: 'A client login cannot be linked to a team member',
    path: ['person_id'],
  });

export const userUpdateSchema = z
  .object({
    role: z.enum(['ADMIN', 'MANAGER', 'MEMBER', 'CLIENT']),
    person_id: idOrNull,
    client_id: idOrNull,
    is_active: flag,
    password,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

// ---------------------------------------------------------------- boards
const people = z.object({
  name: requiredText(120),
  role_title: text(120).default(''),
  department: option('department'),
  seniority: option('seniority').default('Mid'),
  status: option('peopleStatus').default('Active'),
  capacity_hours: z.coerce.number().min(0).max(80).default(40),
  location: text(120).default(''),
  email: z.string().trim().toLowerCase().email().nullable().default(null),
  started_on: dateOrNull.default(null),
});

const clients = z.object({
  name: requiredText(160),
  industry: optionOrNull('industry').default(null),
  status: option('clientStatus').default('Onboarding'),
  health: option('health').default('Healthy'),
  account_manager_id: idOrNull.default(null),
  arr: money.default(0),
  since: dateOrNull.default(null),
  region: text(120).default(''),
  nps: z.coerce.number().int().min(0).max(10).nullable().default(null),
});

const contacts = z.object({
  name: requiredText(120),
  client_id: z.coerce.number().int().positive(),
  title: text(120).default(''),
  email: z.string().trim().toLowerCase().email().nullable().default(null),
  phone: text(40).nullable().default(null),
  is_decision_maker: flag.default(false),
  last_touch: dateOrNull.default(null),
  owner_id: idOrNull.default(null),
});

const leads = z.object({
  name: requiredText(120),
  company: text(160).default(''),
  stage: option('leadStage').default('New'),
  source: optionOrNull('source').default(null),
  service: optionOrNull('service').default(null),
  owner_id: idOrNull.default(null),
  value: money.default(null),
  received_on: dateOrNull.default(null),
  next_step: text(400).default(''),
});

const deals = z.object({
  name: requiredText(200),
  client_id: idOrNull.default(null),
  stage: option('dealStage').default('Discovery'),
  service: optionOrNull('service').default(null),
  value: money.default(null),
  probability: percent.default(null),
  owner_id: idOrNull.default(null),
  close_date: dateOrNull.default(null),
  source: optionOrNull('source').default(null),
});

const proposals = z.object({
  name: requiredText(200),
  client_id: idOrNull.default(null),
  status: option('proposalStatus').default('Draft'),
  amount: money.default(null),
  owner_id: idOrNull.default(null),
  sent_on: dateOrNull.default(null),
  valid_until: dateOrNull.default(null),
  version: text(20).default('v1'),
});

const invoices = z.object({
  number: requiredText(60),
  client_id: z.coerce.number().int().positive(),
  project_id: idOrNull.default(null),
  status: option('invoiceStatus').default('Draft'),
  amount: z.coerce.number().min(0),
  issued_on: dateOrNull.default(null),
  due_on: dateOrNull.default(null),
});

const projects = z
  .object({
    name: requiredText(200),
    client_id: idOrNull.default(null),
    status: option('projectStatus').default('Discovery'),
    health: option('health').default('Healthy'),
    lead_id: idOrNull.default(null),
    start_on: dateOrNull.default(null),
    end_on: dateOrNull.default(null),
    platforms: z.array(z.enum(['iOS', 'Android', 'Web', 'Backend', 'Cross-platform'])).default([]),
    budget: money.default(null),
    burned: money.default(null),
  })
  .refine((v) => !v.start_on || !v.end_on || v.end_on >= v.start_on, {
    message: 'The end date cannot be before the start date',
    path: ['end_on'],
  });

const sprints = z
  .object({
    name: requiredText(160),
    project_id: z.coerce.number().int().positive(),
    status: option('sprintStatus').default('Planned'),
    goal: text(400).default(''),
    start_on: dateOrNull.default(null),
    end_on: dateOrNull.default(null),
    committed_points: z.coerce.number().int().min(0).max(999).default(0),
    completed_points: z.coerce.number().int().min(0).max(999).default(0),
    scope_added_points: z.coerce.number().int().min(0).max(999).default(0),
    scrum_master_id: idOrNull.default(null),
  })
  .refine((v) => !v.start_on || !v.end_on || v.end_on >= v.start_on, {
    message: 'The end date cannot be before the start date',
    path: ['end_on'],
  });

const tasks = z
  .object({
    title: requiredText(300),
    project_id: idOrNull.default(null),
    sprint_id: idOrNull.default(null),
    department: option('department'),
    status: option('taskStatus').default('Backlog'),
    assignee_id: idOrNull.default(null),
    priority: option('priority').default('Medium'),
    type: option('taskType').default('Feature'),
    points: points.default(null),
    start_on: dateOrNull.default(null),
    due_on: dateOrNull.default(null),
    estimate_hours: hoursField.default(null),
    logged_hours: z.coerce.number().min(0).max(10000).default(0),
    blocks: text(200).default(''),
  })
  .refine((v) => !v.start_on || !v.due_on || v.due_on >= v.start_on, {
    message: 'The due date cannot be before the start date',
    path: ['due_on'],
  });

const milestones = z.object({
  name: requiredText(200),
  project_id: z.coerce.number().int().positive(),
  status: option('milestoneStatus').default('Upcoming'),
  due_on: dateOrNull.default(null),
  owner_id: idOrNull.default(null),
  client_visible: flag.default(true),
  note: text(400).default(''),
});

const bugs = z.object({
  title: requiredText(300),
  project_id: idOrNull.default(null),
  severity: option('severity').default('Minor'),
  status: option('bugStatus').default('New'),
  platform: optionOrNull('platform').default(null),
  department: optionOrNull('department').default(null),
  assignee_id: idOrNull.default(null),
  reporter_id: idOrNull.default(null),
  found_in: text(80).default(''),
  reported_on: dateOrNull.default(null),
});

const testRuns = z
  .object({
    name: requiredText(200),
    project_id: idOrNull.default(null),
    status: option('testStatus').default('Not started'),
    platform: optionOrNull('platform').default(null),
    owner_id: idOrNull.default(null),
    cases: count.default(0),
    passed: count.default(0),
    failed: count.default(0),
    coverage: percent.default(null),
    run_on: dateOrNull.default(null),
  })
  .refine((v) => v.passed + v.failed <= v.cases, {
    message: 'Passed plus failed cannot be more than the total number of cases',
    path: ['failed'],
  });

const releases = z.object({
  name: requiredText(200),
  project_id: idOrNull.default(null),
  status: option('releaseStatus').default('Planning'),
  platform: optionOrNull('platform').default(null),
  build: text(60).default(''),
  owner_id: idOrNull.default(null),
  code_freeze_on: dateOrNull.default(null),
  target_on: dateOrNull.default(null),
  notes: text(400).default(''),
});

const tickets = z.object({
  subject: requiredText(300),
  client_id: z.coerce.number().int().positive(),
  status: option('ticketStatus').default('New'),
  priority: option('priority').default('Medium'),
  assignee_id: idOrNull.default(null),
  channel: optionOrNull('channel').default(null),
  opened_on: dateOrNull.default(null),
  sla_due_at: timestampOrNull.default(null),
  first_reply: text(40).default(''),
  csat: z.coerce.number().int().min(1).max(5).nullable().default(null),
});

const approvals = z.object({
  name: requiredText(200),
  project_id: z.coerce.number().int().positive(),
  status: option('approvalStatus').default('Awaiting client'),
  owner_id: idOrNull.default(null),
  sent_on: dateOrNull.default(null),
  due_on: dateOrNull.default(null),
  note: text(400).default(''),
});

const leaveRequests = z
  .object({
    title: requiredText(200),
    person_id: z.coerce.number().int().positive(),
    type: option('leaveType'),
    status: option('leaveStatus').default('Requested'),
    start_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z.coerce.number().int().min(0).max(365).nullable().default(null),
    cover_id: idOrNull.default(null),
  })
  .refine((v) => v.end_on >= v.start_on, {
    message: 'The last day cannot be before the first day',
    path: ['end_on'],
  });

const timeLogs = z.object({
  note: text(300).default(''),
  person_id: z.coerce.number().int().positive(),
  project_id: idOrNull.default(null),
  task_id: idOrNull.default(null),
  department: optionOrNull('department').default(null),
  logged_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.coerce.number().min(0.1, 'Log at least 6 minutes').max(24, 'There are only 24 hours in a day'),
  billable: flag.default(true),
});

export const boardSchemas = {
  people, clients, contacts, leads, deals, proposals, invoices, projects,
  sprints, tasks, milestones, bugs, test_runs: testRuns, releases, tickets,
  approvals, leave_requests: leaveRequests, time_logs: timeLogs,
};

/** create = the schema above; update = every field optional. */
export const createSchema = (name) => boardSchemas[name];
export const updateSchema = (name) => {
  const s = boardSchemas[name];
  // A refined schema (ZodEffects) has to be unwrapped before .partial().
  const base = typeof s.partial === 'function' ? s : s._def.schema;
  return asUpdate(base);
};

// ---------------------------------------------------------------- nested
export const updateBodySchema = z.object({
  body: requiredText(4000),
});

export const subtaskCreateSchema = z.object({
  text: requiredText(300),
});

export const subtaskUpdateSchema = z.object({
  text: requiredText(300).optional(),
  done: flag.optional(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(200).optional(),
});

export { labels };
