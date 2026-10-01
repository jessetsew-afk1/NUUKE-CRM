import { useQuery } from '@tanstack/react-query';
import { must, supabase } from '@/lib/supabase';
import type { Profile, Settings } from '@/lib/types';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    staleTime: 5 * 60_000,
    queryFn: async () => must(await supabase.from('settings').select('*').single()) as Settings,
  });
}

export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: async () => must(await supabase.from('profiles').select('*').order('full_name')) as Profile[],
  });
}
