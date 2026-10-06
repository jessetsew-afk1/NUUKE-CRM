import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { must, rpc, supabase } from '@/lib/supabase';
import type {
  Deal, DealStage, Lead, LeadAttempt, LeadOutcome, LeaderRow, Meeting, Profile, QueueSummary, SalesStats, TodayStats,
} from '@/lib/types';
import { useAuth } from '@/app/auth';
import type { Tone } from '@/ui/kit';

/* ------------------------------------------------------------------ outcomes */
export const OUTCOME_TONE: Record<string, Tone> = { neutral: 'neutral', info: 'info', good: 'good', great: 'great', bad: 'bad' };

export function useOutcomes() {
  return useQuery({
    queryKey: ['outcomes'],
    staleTime: Infinity,
    queryFn: async () => must(await supabase.from('lead_outcomes').select('*').order('sort')) as LeadOutcome[],
  });
}

export function outcomeMap(list: LeadOutcome[] | undefined) {
  return new Map((list ?? []).map((o) => [o.key, o]));
}

/* --------------------------------------------------------------------- today */
export function useToday() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['today'],
    enabled: profile?.role === 'sales',
    queryFn: () => rpc<TodayStats>('my_today'),
    refetchInterval: 60_000,
  });
}

/* ---------------------------------------------------------------------- queue */
export interface QueueFilters {
  services: string[];
  platforms: string[];
  from: string | null;
  to: string | null;
}
export const emptyFilters: QueueFilters = { services: [], platforms: [], from: null, to: null };

const filterArgs = (f: QueueFilters) => ({
  p_services: f.services.length ? f.services : undefined,
  p_platforms: f.platforms.length ? f.platforms : undefined,
  p_from: f.from ?? undefined,
  p_to: f.to ?? undefined,
});

export function useQueueSummary(f: QueueFilters) {
  return useQuery({
    queryKey: ['queue-summary', f],
    queryFn: () => rpc<QueueSummary>('queue_summary', filterArgs(f)),
  });
}

export function fetchNextLeads(f: QueueFilters, limit = 3) {
  return rpc<Lead[]>('next_leads', { ...filterArgs(f), p_limit: limit });
}

export function useFilterOptions() {
  return useQuery({
    queryKey: ['lead-filter-options'],
    staleTime: 5 * 60_000,
    retry: 2,
    queryFn: () => rpc<{
      services: { value: string; count: number }[];
      platforms: { value: string; count: number }[];
      date_min: string | null;
      date_max: string | null;
    }>('lead_filter_options'),
  });
}

export interface LogArgs {
  leadId: number;
  action: 'call' | 'skip' | 'note';
  outcome?: string | null;
  comment?: string | null;
  followupAt?: string | null;
  meetingAt?: string | null;
  meetingMinutes?: number;
  dealAmount?: number | null;
  meeting?: MeetingExtras | null;
}

/** What a rep collects when booking a meeting, beyond the time. */
export interface MeetingExtras {
  timezone: string | null;
  technical_manager_id: string | null;
  location: string | null;
  transcript: string | null;
  client_website: string | null;
  client_links: string | null;
  prep_notes: string | null;
}

export function logLeadAction(a: LogArgs) {
  return rpc<{ lead?: Lead; today: TodayStats }>('log_lead_action', {
    p_lead_id: a.leadId,
    p_action: a.action,
    p_outcome: a.outcome ?? undefined,
    p_comment: a.comment ?? undefined,
    p_followup_at: a.followupAt ?? undefined,
    p_meeting_at: a.meetingAt ?? undefined,
    p_meeting_minutes: a.meetingMinutes ?? undefined,
    p_deal_amount: a.dealAmount ?? undefined,
    p_meeting: (a.meeting ?? undefined) as never,
  });
}

/** After any dialer action: refresh the counters everywhere. */
export function useSalesRefresh() {
  const qc = useQueryClient();
  return (today?: TodayStats) => {
    if (today) qc.setQueryData(['today'], today);
    void qc.invalidateQueries({ queryKey: ['queue-summary'] });
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['lead-history'] });
    void qc.invalidateQueries({ queryKey: ['deals'] });
    void qc.invalidateQueries({ queryKey: ['meetings'] });
    void qc.invalidateQueries({ queryKey: ['attempts'] });
  };
}

/* ---------------------------------------------------------------------- leads */
export interface LeadListFilters {
  q: string;
  stage: 'all' | 'queue' | 'due' | 'pipeline' | 'closed';
  service: string | null;
  platform: string | null;
}

const PAGE = 40;

export function useLeadList(f: LeadListFilters) {
  const { profile } = useAuth();
  return useInfiniteQuery({
    queryKey: ['leads', profile?.id, f],
    initialPageParam: 0,
    getNextPageParam: (last: { rows: Lead[]; page: number }) => (last.rows.length === PAGE ? last.page + 1 : undefined),
    queryFn: async ({ pageParam }) => {
      let q = supabase.from('leads').select('*', { count: 'exact' }).eq('assigned_to', profile!.id);
      if (f.q.trim()) {
        const t = f.q.trim().replace(/[%,()]/g, ' ');
        q = q.or(`name.ilike.%${t}%,phone.ilike.%${t}%,personal_email.ilike.%${t}%,work_email.ilike.%${t}%,service.ilike.%${t}%`);
      }
      if (f.service) q = q.eq('service', f.service);
      if (f.platform) q = q.eq('platform', f.platform);
      if (f.stage === 'queue') q = q.eq('stage', 'queue');
      if (f.stage === 'pipeline') q = q.eq('stage', 'pipeline');
      if (f.stage === 'closed') q = q.eq('stage', 'closed');
      if (f.stage === 'due') q = q.in('stage', ['queue', 'pipeline']).not('next_action_at', 'is', null).lte('next_action_at', new Date().toISOString());
      q = f.stage === 'due'
        ? q.order('next_action_at', { ascending: true })
        : q.order('last_attempt_at', { ascending: false, nullsFirst: false }).order('lead_date', { ascending: false });
      const res = await q.range(pageParam * PAGE, pageParam * PAGE + PAGE - 1);
      return { rows: must(res) as Lead[], page: pageParam, total: res.count ?? 0 };
    },
  });
}

export function useLeadHistory(leadId: number | null | undefined) {
  return useQuery({
    queryKey: ['lead-history', leadId],
    enabled: !!leadId,
    queryFn: async () =>
      must(await supabase.from('lead_attempts').select('*').eq('lead_id', leadId!).order('created_at', { ascending: false }).limit(50)) as LeadAttempt[],
  });
}

/* ------------------------------------------------------------------- attempts */
export function useAttempts(fromIso: string, toIso: string, action: 'all' | 'call' | 'skip' | 'note') {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['attempts', profile?.id, fromIso, toIso, action],
    queryFn: async () => {
      let q = supabase
        .from('lead_attempts')
        .select('*, lead:leads(id, name, phone, service, platform, status, stage)')
        .eq('rep_id', profile!.id)
        .gte('work_date', fromIso)
        .lte('work_date', toIso)
        .order('created_at', { ascending: false })
        .limit(500);
      if (action !== 'all') q = q.eq('action', action);
      return must(await q) as (LeadAttempt & { lead: Pick<Lead, 'id' | 'name' | 'phone' | 'service' | 'platform' | 'status' | 'stage'> | null })[];
    },
  });
}

/* ---------------------------------------------------------------------- deals */
export const STAGES: { key: DealStage; label: string; color: string; hint: string }[] = [
  { key: 'prospect', label: 'Prospect', color: '#5AB8FF', hint: 'Interested, needs nurturing' },
  { key: 'meeting', label: 'Meeting', color: '#7C5CFF', hint: 'A call is booked or held' },
  { key: 'proposal', label: 'Proposal', color: '#FF9A6B', hint: 'Scope and price shared' },
  { key: 'negotiation', label: 'Negotiation', color: '#FFB020', hint: 'Agreeing terms' },
  { key: 'won', label: 'Won', color: '#30C46C', hint: 'Signed' },
  { key: 'lost', label: 'Lost', color: '#8E8AA0', hint: 'Not this time' },
];
export const stageMeta = (s: string) => STAGES.find((x) => x.key === s) ?? STAGES[0];

export function useDeals() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['deals', profile?.id],
    queryFn: async () =>
      must(await supabase.from('deals').select('*').eq('owner_id', profile!.id).order('position', { ascending: false })) as Deal[],
  });
}

/* ------------------------------------------------------------------- meetings */
export function useMeetings() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['meetings', profile?.id],
    queryFn: async () =>
      must(await supabase.from('meetings').select('*').eq('owner_id', profile!.id).order('starts_at', { ascending: true })) as Meeting[],
  });
}

/** The people the admin has made technical managers (to put on a meeting). */
export function useTechManagers() {
  return useQuery({
    queryKey: ['tech-managers'],
    staleTime: 60_000,
    queryFn: async () => must(await supabase.from('profiles').select('id, full_name, avatar, title, department, role')
      .eq('is_technical_manager', true).eq('is_active', true).order('full_name')) as Pick<Profile, 'id' | 'full_name' | 'avatar' | 'title' | 'department' | 'role'>[],
  });
}

export type MeetingLead = Pick<Lead, 'id' | 'name' | 'phone' | 'personal_email' | 'work_email' | 'country' | 'service' | 'platform' | 'query' | 'post_link'>;
export type MeetingWithLead = Meeting & { leads: MeetingLead | null };

/**
 * Meetings with their lead, for calendars. `scope`: 'all' (admin), 'tm' (the ones I'm
 * the technical manager on) or 'mine' (the ones I booked).
 */
export function useMeetingsWithLeads(scope: 'all' | 'tm' | 'mine', enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['meetings', 'calendar', scope, profile?.id],
    enabled: enabled && !!profile,
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase.from('meetings')
        .select('*, leads(id, name, phone, personal_email, work_email, country, service, platform, query, post_link)')
        .gte('starts_at', new Date(Date.now() - 120 * 864e5).toISOString())
        .order('starts_at', { ascending: true })
        .limit(3000);
      if (scope === 'tm') q = q.eq('technical_manager_id', profile!.id);
      if (scope === 'mine') q = q.eq('owner_id', profile!.id);
      return must(await q) as unknown as MeetingWithLead[];
    },
  });
}

/* ---------------------------------------------------------------------- stats */
export function useSalesStats(userId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['sales-stats', userId, from, to],
    enabled: !!userId,
    queryFn: () => rpc<SalesStats>('sales_stats', { p_user: userId!, p_from: from, p_to: to }),
  });
}

export function useLeaderboard(from: string, to: string) {
  return useQuery({
    queryKey: ['leaderboard', from, to],
    queryFn: () => rpc<LeaderRow[]>('sales_leaderboard', { p_from: from, p_to: to }),
    refetchInterval: 60_000,
  });
}
