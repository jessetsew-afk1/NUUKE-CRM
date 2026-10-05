import type { Database } from './database.types';

type T = Database['public']['Tables'];
export type Role = Database['public']['Enums']['app_role'];
export type Profile = T['profiles']['Row'];
export type Employment = T['employment']['Row'];
export type Settings = T['settings']['Row'];
export type Lead = T['leads']['Row'];
export type LeadAttempt = T['lead_attempts']['Row'];
export type LeadOutcome = T['lead_outcomes']['Row'];
export type Deal = T['deals']['Row'];
export type Meeting = T['meetings']['Row'];
export type Notification = T['notifications']['Row'];
export type AuditEntry = T['audit_log']['Row'];
export type LeadImport = T['lead_imports']['Row'];
export type Holiday = T['holidays']['Row'];
export type Project = T['projects']['Row'];
export type ProjectMember = T['project_members']['Row'];
export type Sprint = T['sprints']['Row'];
export type Task = T['tasks']['Row'];
export type TaskComment = T['task_comments']['Row'];
export type ProjectFile = T['project_files']['Row'];
export type FileComment = T['file_comments']['Row'];
export type ContentPost = T['content_posts']['Row'];
export type ProjectEvent = T['project_events']['Row'];
export type ProjectMessage = T['project_messages']['Row'];
export type ProjectActivity = T['project_activity']['Row'];
export type QuickMessage = T['quick_messages']['Row'];
export type Game = T['games']['Row'];
export type GamePlayer = T['game_players']['Row'];

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ReviewStatus = 'none' | 'pending' | 'approved' | 'changes_requested';

export type DealStage = 'prospect' | 'meeting' | 'proposal' | 'negotiation' | 'won' | 'lost';

export interface AttendanceState {
  tracks_attendance: boolean;
  clocked_in: boolean;
  session_started_at: string | null;
  on_break: boolean;
  break_started_at: string | null;
  break_allowance_seconds: number;
  work_date: string;
  first_in: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  late_minutes: number;
  arrival: 'on_time' | 'short' | 'half' | 'late_absent' | 'off_schedule' | null;
  worked_seconds: number;
  break_seconds: number;
  server_now: string;
}

export interface TodayStats {
  work_date: string;
  dials: number;
  connected: number;
  skips: number;
  prospects: number;
  target: number;
}

export interface QueueSummary {
  due_followups: number;
  fresh: number;
  skipped: number;
  scheduled_later: number;
  in_pipeline: number;
  closed: number;
  total: number;
}

export interface SalesStats {
  totals: {
    dials: number; connected: number; skips: number; prospects: number; meetings_booked: number; meetings_held: number;
    won_count: number; won_usd: number; open_pipeline_usd: number; weighted_pipeline_usd: number; work_days: number;
  };
  daily: { date: string; dials: number; connected: number; prospects: number }[];
  outcomes: { outcome: string; count: number }[];
  stages: { stage: DealStage; count: number; amount: number }[];
  forecast: { month: string; amount: number; weighted: number }[];
}

export interface LeaderRow {
  profile_id: string;
  full_name: string;
  avatar: unknown;
  dials: number;
  connected: number;
  prospects: number;
  meetings: number;
  won_usd: number;
  won_count: number;
}

export interface PayrollDay {
  date: string;
  status: 'present' | 'short' | 'half' | 'absent' | 'late_absent' | 'paid_leave' | 'unpaid_leave' | 'holiday' | 'off' | 'extra' | 'pending' | 'untracked';
  deduction_days: number;
  note: string | null;
  late_minutes: number;
  first_in: string | null;
  last_out: string | null;
  auto_signed_out: boolean;
}

export interface Payroll {
  profile_id: string;
  full_name: string;
  role: Role;
  avatar: unknown;
  period_start: string;
  period_end: string;
  pay_day: string;
  is_current: boolean;
  monthly_salary_pkr: number;
  scheduled_days: number;
  daily_rate_pkr: number;
  deduction_days: number;
  deduction_pkr: number;
  after_attendance_pkr: number;
  counts: Partial<Record<PayrollDay['status'], number>>;
  days?: PayrollDay[];
  sales: null | {
    target_usd: number; closed_usd: number; ratio: number | null; tier: 'none' | 'below' | 'base' | 'commission';
    salary_factor: number; low_threshold_usd: number; commission_rate: number; commission_usd: number;
    commission_pkr: number; usd_to_pkr: number;
  };
  net_pkr: number;
  released_at: string | null;
}

export interface BoardRow {
  profile_id: string; full_name: string; role: Role; department: string | null; title: string | null; avatar: unknown;
  work_date: string; scheduled_start: string; scheduled_end: string; first_in: string | null; last_out: string | null;
  late_minutes: number; arrival: string | null; override_status: string | null;
  state: 'online' | 'break' | 'signed_out' | 'absent' | 'not_started' | 'day_off' | string;
  worked_seconds: number; break_seconds: number; auto_signed_out: boolean;
}
