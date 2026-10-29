/** What admins and sales leads see of the team: each rep's calls and Zoom texts. */
import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/lib/supabase';
import type { Role } from '@/lib/types';

export interface TeamActivity {
  profile_id: string; full_name: string; avatar: unknown; role: Role; daily_target: number | null;
  dials: number; connected: number; meetings_booked: number; prospects: number; last_call_at: string | null;
  texts_sent: number; texts_replied: number; texts_opted_out: number; texts_left: number; texts_total: number; last_text_at: string | null;
  outcomes: { outcome: string | null; label: string; tone: string; count: number }[];
  daily: { date: string; dials: number; connected: number; texts: number }[];
}

export function useTeamActivity(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['team-activity', from, to],
    enabled,
    refetchInterval: 60_000,
    queryFn: () => rpc<TeamActivity[]>('team_activity', { p_from: from, p_to: to }),
  });
}
