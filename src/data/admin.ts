import { useQuery } from '@tanstack/react-query';
import { must, rpc, supabase } from '@/lib/supabase';
import type { AuditEntry, BoardRow, Employment, LeadImport, Payroll, Profile } from '@/lib/types';

export interface TeamRow {
  profile_id: string; full_name: string; avatar: unknown; dials: number; connected: number; prospects: number;
  meetings: number; won_usd: number; won_count: number; open_pipeline_usd: number; leads_total: number;
  leads_open: number; target_usd: number; daily_target: number;
}

export function useTeamOverview(from: string, to: string) {
  return useQuery({
    queryKey: ['team-overview', from, to],
    queryFn: () => rpc<TeamRow[]>('sales_team_overview', { p_from: from, p_to: to }),
    refetchInterval: 60_000,
  });
}

export function useAttendanceBoard(date?: string | null) {
  return useQuery({
    queryKey: ['attendance-board', date ?? 'now'],
    queryFn: () => rpc<BoardRow[]>('attendance_board', { p_date: date ?? undefined }),
    refetchInterval: 60_000,
  });
}

export function usePayrollOverview(periodStart: string) {
  return useQuery({
    queryKey: ['payroll-overview', periodStart],
    queryFn: () => rpc<Payroll[]>('payroll_overview', { p_period_start: periodStart }),
  });
}

export type Person = Profile & { employment: Employment | null; last_login: string | null };

export function usePeopleAdmin() {
  return useQuery({
    queryKey: ['people-admin'],
    queryFn: async () => {
      const [profiles, emp, logins] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('employment').select('*'),
        supabase.from('login_events').select('user_id, created_at').order('created_at', { ascending: false }).limit(1000),
      ]);
      const e = new Map((must(emp) as Employment[]).map((x) => [x.profile_id, x]));
      const last = new Map<string, string>();
      for (const l of must(logins) as { user_id: string; created_at: string }[]) if (!last.has(l.user_id)) last.set(l.user_id, l.created_at);
      return (must(profiles) as Profile[]).map((p) => ({ ...p, employment: e.get(p.id) ?? null, last_login: last.get(p.id) ?? null })) as Person[];
    },
  });
}

export function useAudit(filters: { actor?: string | null; entity?: string | null; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: async () => {
      let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(300);
      if (filters.actor) q = q.eq('actor_id', filters.actor);
      if (filters.entity) q = q.eq('entity', filters.entity);
      if (filters.from) q = q.gte('created_at', `${filters.from}T00:00:00+05:00`);
      if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59+05:00`);
      return must(await q) as AuditEntry[];
    },
  });
}

export function useImports() {
  return useQuery({
    queryKey: ['lead-imports'],
    queryFn: async () => must(await supabase.from('lead_imports').select('*').order('created_at', { ascending: false }).limit(20)) as LeadImport[],
  });
}

/** What each salesperson is holding: leads, open deals and booked meetings. */
export interface PersonWork { id: string; leads: number; open_leads: number; deals: number; meetings: number }
export function usePeopleWork() {
  return useQuery({
    queryKey: ['people-work'],
    queryFn: async () => new Map((await rpc<PersonWork[]>('people_work')).map((w) => [w.id, w])),
  });
}
export const hasWork = (w: PersonWork | undefined) => !!w && w.open_leads + w.deals + w.meetings > 0;

/** Who would get what if a salesperson's work were handed to these colleagues. */
export interface HandOverPlan {
  from: string; clients: number; leads: number; open: number; pipeline: number; already_had: number;
  deals: number; meetings: number; back_to_sheet: number; applied: boolean; merged?: number;
  people: { id: string; name: string; clients: number; already_had: number; open: number; pipeline: number; deals: number; meetings: number }[];
}
export const handOverWork = (from: string, to: string[], apply: boolean) =>
  rpc<HandOverPlan>('hand_over_work', { p_from: from, p_to: to, p_apply: apply });
