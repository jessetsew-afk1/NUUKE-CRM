import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rpc } from '@/lib/supabase';
import type { AttendanceState } from '@/lib/types';
import { useAuth } from './auth';

export function useAttendance() {
  const { session, tracksAttendance } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['attendance', session?.user.id],
    queryFn: () => rpc<AttendanceState>('my_attendance'),
    enabled: !!session && tracksAttendance,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const set = (s: AttendanceState) => qc.setQueryData(['attendance', session?.user.id], s);
  const clockIn = useMutation({ mutationFn: () => rpc<AttendanceState>('clock_in'), onSuccess: set });
  const startBreak = useMutation({ mutationFn: () => rpc<AttendanceState>('start_break'), onSuccess: set });
  const endBreak = useMutation({ mutationFn: () => rpc<AttendanceState>('end_break'), onSuccess: set });
  return { state: query.data, loading: query.isLoading, clockIn, startBreak, endBreak, refetch: query.refetch, fetchedAt: query.dataUpdatedAt };
}

/** Seconds worked and on break, ticking every second between server refreshes. */
export function useLiveClock(state: AttendanceState | undefined, fetchedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!state) return { worked: 0, onBreak: 0, breakUsed: 0 };
  const elapsed = Math.max(0, (now - fetchedAt) / 1000);
  const ticking = state.clocked_in;
  const worked = state.worked_seconds + (ticking && !state.on_break ? elapsed : 0);
  const breakUsed = state.break_seconds + (state.on_break ? elapsed : 0);
  const onBreak = state.on_break && state.break_started_at ? (now - Date.parse(state.break_started_at)) / 1000 : 0;
  return { worked, onBreak, breakUsed };
}
