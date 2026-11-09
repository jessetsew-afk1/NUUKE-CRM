import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PaymentResult, VCategory, VEntry, VInvestor, VPayment, VSettings, VStats } from '@/lib/finance';

/** The vault's own calls. They are not in the generated types on purpose: the vault is private. */
async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) {
    if (error.hint === 'vault_locked' || /vault locked/i.test(error.message)) {
      setToken(null);
      throw new Error('The vault locked itself (30 minutes idle). Unlock it again.');
    }
    throw new Error(error.message);
  }
  return data as T;
}

/* ---------------------------------------------------------- unlock token */
// Kept for this browser tab only; useless without the owner's own login.
const KEY = 'nuuke.vault';
let current: string | null = (() => { try { return sessionStorage.getItem(KEY); } catch { return null; } })();
const listeners = new Set<(t: string | null) => void>();
function setToken(t: string | null) {
  current = t;
  try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch { /* private mode */ }
  listeners.forEach((l) => l(t));
}
export function useVaultToken() {
  const [t, set] = useState(current);
  useEffect(() => { listeners.add(set); return () => { listeners.delete(set); }; }, []);
  return t;
}

/* ---------------------------------------------------------------- gate */
export interface VaultStatus { owner: boolean; has_passcode?: boolean; locked_until?: string | null }
export const useVaultStatus = (enabled = true) =>
  useQuery({ queryKey: ['vault-status'], enabled, staleTime: 30_000, queryFn: () => call<VaultStatus>('vault_status') });

export interface GateResult { ok: boolean; error?: string; token?: string; tries_left?: number; locked_until?: string }
export async function unlockVault(passcode: string) {
  const r = await call<GateResult>('vault_unlock', { p_passcode: passcode });
  if (r.ok && r.token) setToken(r.token);
  return r;
}
export const setPasscode = (next: string, old?: string) =>
  call<GateResult>('vault_set_passcode', { p_new: next, p_old: old ?? null });
export async function lockVault() {
  const t = current;
  setToken(null);
  if (t) await call('vault_lock', { p_token: t }).catch(() => undefined);
}

/* ---------------------------------------------------------------- data */
export interface VaultLog { id: number; at: string; email: string | null; event: string; ok: boolean }
export interface VaultData {
  settings: VSettings; categories: VCategory[]; investors: VInvestor[]; agents: { investor_id: number; profile_id: string }[];
  entries: VEntry[]; payments: VPayment[]; stats: VStats[]; log: VaultLog[]; passcode_set_at: string | null;
}
const num = (x: unknown) => (x == null ? x : Number(x));
export function useVault() {
  const token = useVaultToken();
  return useQuery({
    queryKey: ['vault', token],
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const d = await call<VaultData>('vault_load', { p_token: token });
      // Postgres numerics arrive as numbers or strings depending on size: make them numbers.
      d.entries = d.entries.map((e) => ({ ...e, amount: Number(e.amount), original_amount: num(e.original_amount) as number | null, fx: num(e.fx) as number | null }));
      d.investors = d.investors.map((i) => ({ ...i, share_pct: Number(i.share_pct), target_return_pct: num(i.target_return_pct) as number | null }));
      d.settings = d.settings ?? {};
      d.payments = d.payments ?? [];
      return d;
    },
  });
}

export type VaultTable = 'entry' | 'investor' | 'category' | 'stats' | 'agents';
export function useVaultMutations() {
  const qc = useQueryClient();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['vault'] }), [qc]);
  return {
    save: async <T = unknown>(table: VaultTable, row: Record<string, unknown>) => {
      const out = await call<T>('vault_save', { p_token: current, p_table: table, p: row });
      await refresh();
      return out;
    },
    savePayment: async (p: { id?: number; month: string; investor_id: number | null; client: string; details: unknown; entries: PaymentResult['entries'] }) => {
      const out = await call<VPayment>('vault_save_payment', { p_token: current, p });
      await refresh();
      return out;
    },
    remove: async (table: Exclude<VaultTable, 'agents'> | 'payment', id: number) => {
      await call('vault_delete', { p_token: current, p_table: table, p_id: id });
      await refresh();
    },
    saveSettings: async (s: VSettings) => {
      await call('vault_save_settings', { p_token: current, p_settings: s });
      await refresh();
    },
    rollRecurring: async (from: string) => {
      const n = await call<number>('vault_roll_recurring', { p_token: current, p_from: from });
      await refresh();
      return n;
    },
    crmMonth: (month: string, agents?: string[] | null) =>
      call<CrmMonth>('vault_crm_month', { p_token: current, p_month: month, p_agents: agents?.length ? agents : null }),
  };
}
export interface CrmMonth {
  deals_won: number; deals_won_usd: number; payments_count: number; payments_usd: number; paypal_fees_usd: number;
  refunds_usd: number; commission_usd: number; agents: number; salaries_pkr: number;
  people: { id: string; name: string; role: string }[];
}
