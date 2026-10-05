import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { liveChannel, must, rpc, supabase } from '@/lib/supabase';
import type { Notification } from '@/lib/types';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { useAuth } from './auth';

interface Value {
  items: Notification[];
  unread: number;
  markAllRead: () => Promise<void>;
  markRead: (ids: number[]) => Promise<void>;
}
const Ctx = createContext<Value>({ items: [], unread: 0, markAllRead: async () => {}, markRead: async () => {} });
export const useNotifications = () => useContext(Ctx);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const toast = useToast();
  const seen = useRef<Set<number> | null>(null);

  const query = useQuery({
    queryKey: ['notifications', uid],
    enabled: !!uid,
    refetchInterval: 30_000,
    queryFn: async () =>
      must(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60)),
  });

  // Banner anything that arrived after the app opened.
  useEffect(() => {
    if (!query.data) return;
    if (!seen.current) {
      seen.current = new Set(query.data.map((n) => n.id));
      return;
    }
    const fresh = query.data.filter((n) => !seen.current!.has(n.id)).reverse();
    for (const n of fresh) {
      seen.current.add(n.id);
      toast({ title: n.title, body: n.body, tone: n.tone as never });
      if (n.tone === 'celebrate') celebrate('big');
    }
  }, [query.data, toast]);

  // Live updates where the project has Realtime switched on; polling covers the rest.
  useEffect(() => {
    if (!uid) return;
    const channel = liveChannel(`notifications:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        () => qc.invalidateQueries({ queryKey: ['notifications', uid] }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [uid, qc]);

  const markRead = useCallback(async (ids: number[]) => {
    await rpc('mark_notifications_read', { p_ids: ids });
    await qc.invalidateQueries({ queryKey: ['notifications', uid] });
  }, [qc, uid]);
  const markAllRead = useCallback(async () => {
    await rpc('mark_notifications_read', {});
    await qc.invalidateQueries({ queryKey: ['notifications', uid] });
  }, [qc, uid]);

  const value = useMemo<Value>(() => {
    const items = query.data ?? [];
    return { items, unread: items.filter((n) => !n.read_at).length, markRead, markAllRead };
  }, [query.data, markRead, markAllRead]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
