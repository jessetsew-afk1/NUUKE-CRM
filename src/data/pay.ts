import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/lib/supabase';
import type { Payroll } from '@/lib/types';

export function usePayroll(profileId: string | undefined, periodStart?: string | null) {
  return useQuery({
    queryKey: ['payroll', profileId, periodStart ?? 'current'],
    enabled: !!profileId,
    queryFn: () => rpc<Payroll>('payroll_compute', { p_profile: profileId!, p_period_start: periodStart ?? undefined }),
  });
}
