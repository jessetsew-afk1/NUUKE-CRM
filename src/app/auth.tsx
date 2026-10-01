import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /** `beforeEnter` runs after the password is accepted and before the app replaces the sign-in page. */
  signIn: (email: string, password: string, opts?: { beforeEnter?: () => Promise<void> }) => Promise<void>;
  signOut: () => Promise<void>;
  patchProfile: (p: Partial<Profile>) => void;
}

const Ctx = createContext<AuthValue | null>(null);

/** Turns Supabase's sign-in errors into something a person can act on — and only blames
 *  the password when the password really is the problem. */
function signInMessage(raw: string) {
  if (/invalid login credentials/i.test(raw)) return 'That email and password do not match';
  if (/email not confirmed/i.test(raw)) return 'This email has not been confirmed yet — ask your admin to confirm it in Supabase';
  if (/banned/i.test(raw)) return 'This login has been switched off — talk to your admin';
  if (/api key|apikey|secret/i.test(raw)) return `The app's Supabase key is not right (${raw}). Check VITE_SUPABASE_PUBLISHABLE_KEY in Netlify, then redeploy.`;
  if (/invalid path|not found|failed to fetch|network/i.test(raw)) return `The app cannot reach Supabase (${raw}). Check VITE_SUPABASE_URL in Netlify — it should look like https://xxxx.supabase.co — then redeploy.`;
  return raw;
}

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
  // While signIn() is running it loads the profile itself, so the auth listener stays out of the way.
  const signingIn = useRef(false);

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
      if (event === 'SIGNED_IN' && signingIn.current) return;
      // Supabase asks that its own calls are not made inside this callback (they can wait
      // on each other); running them a moment later avoids that entirely.
      window.setTimeout(() => { void load(s); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const signIn = useCallback(async (email: string, password: string, opts?: { beforeEnter?: () => Promise<void> }) => {
    signingIn.current = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(signInMessage(error.message));
      void rpc('record_login', { p_kind: 'login', p_user_agent: navigator.userAgent }).catch(() => {});
      // Signing in starts the shift clock for anyone whose attendance is tracked.
      const { data: emp } = await supabase.from('employment').select('tracks_attendance').eq('profile_id', data.user.id).maybeSingle();
      const clocking = emp?.tracks_attendance ? rpc('clock_in').catch(() => {}) : Promise.resolve();
      await Promise.all([clocking, opts?.beforeEnter?.() ?? Promise.resolve()]);
      await load(data.session);
      await qc.invalidateQueries();
    } finally {
      signingIn.current = false;
    }
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
