import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { rpc, supabase } from '@/lib/supabase';
import type { Employment, Profile } from '@/lib/types';
import { normaliseAgent, type AgentConfig } from '@/agent/catalog';

interface AuthValue {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  employment: Employment | null;
  agent: AgentConfig;
  isStaff: boolean;
  tracksAttendance: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  patchProfile: (p: Partial<Profile>) => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employment, setEmployment] = useState<Employment | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setProfile(null);
      setEmployment(null);
      setLoading(false);
      return;
    }
    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('employment').select('*').eq('profile_id', s.user.id).maybeSingle(),
    ]);
    setProfile(p ?? null);
    setEmployment(e ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let first = true;
    supabase.auth.getSession().then(({ data }) => {
      void load(data.session);
      if (data.session) void rpc('record_login', { p_kind: 'resume', p_user_agent: navigator.userAgent }).catch(() => {});
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (first && event === 'INITIAL_SESSION') { first = false; return; }
      if (event === 'TOKEN_REFRESHED') { setSession(s); return; }
      void load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      throw new Error(/invalid/i.test(error.message) ? 'That email and password do not match' : /banned/i.test(error.message) ? 'This login has been switched off — talk to your admin' : error.message);
    }
    void rpc('record_login', { p_kind: 'login', p_user_agent: navigator.userAgent }).catch(() => {});
    // Signing in starts the shift clock for anyone whose attendance is tracked.
    const { data: emp } = await supabase.from('employment').select('tracks_attendance').eq('profile_id', data.user.id).maybeSingle();
    if (emp?.tracks_attendance) await rpc('clock_in').catch(() => {});
    await load(data.session);
    await qc.invalidateQueries();
  }, [load, qc]);

  const signOut = useCallback(async () => {
    if (employment?.tracks_attendance) await rpc('clock_out').catch(() => {});
    await rpc('record_login', { p_kind: 'logout', p_user_agent: navigator.userAgent }).catch(() => {});
    await supabase.auth.signOut();
    qc.clear();
  }, [employment, qc]);

  const value = useMemo<AuthValue>(() => ({
    loading,
    session,
    profile,
    employment,
    agent: normaliseAgent(profile?.avatar, profile?.id ?? ''),
    isStaff: !!profile && profile.role !== 'client',
    tracksAttendance: !!employment?.tracks_attendance && !!profile && profile.role !== 'client',
    refresh: () => load(session),
    signIn,
    signOut,
    patchProfile: (p) => setProfile((cur) => (cur ? { ...cur, ...p } : cur)),
  }), [loading, session, profile, employment, load, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
