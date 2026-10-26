import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { liveChannel, must, rpc, supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import type { Tone } from '@/ui/kit';

export type PaymentLink = Database['public']['Tables']['payment_links']['Row'];
export interface PaymentLinkRow extends PaymentLink {
  maker: { full_name: string } | null;
  owner: { full_name: string } | null;
}

export const PAY_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'Waiting', tone: 'info' },
  pending: { label: 'Clearing', tone: 'warn' },
  paid: { label: 'Paid', tone: 'good' },
  refunded: { label: 'Refunded', tone: 'bad' },
  closed: { label: 'Closed', tone: 'neutral' },
};

/** The maker has been asked "keep it or close it?" and hasn't answered yet. */
export const needsDecision = (l: PaymentLink) =>
  l.status === 'open' && !!l.asked_at && (!l.kept_at || l.asked_at > l.kept_at);

export function usePaymentLinks(enabled = true) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['payment-links', uid],
    enabled: enabled && !!uid,
    queryFn: async () =>
      must(await supabase
        .from('payment_links')
        .select('*, maker:profiles!payment_links_created_by_fkey(full_name), owner:profiles!payment_links_commission_owner_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(1000)) as unknown as PaymentLinkRow[],
  });
  useEffect(() => {
    if (!enabled || !uid) return;
    const channel = liveChannel(`payment-links:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_links' }, () => qc.invalidateQueries({ queryKey: ['payment-links'] }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, uid, qc]);
  return q;
}

/** Admins, salespeople, and production staff who lead a project. */
export function useCanTakePayments() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['can-take-payments', profile?.id],
    enabled: !!profile && profile.role !== 'client',
    staleTime: 5 * 60_000,
    queryFn: () => rpc<boolean>('can_take_payments'),
  });
}

export interface PaymentSetup { mode: 'sandbox' | 'live'; sandbox: boolean; live: boolean; webhook: boolean; email: boolean; hosts: boolean }

/** Server-side payment actions (emailing from the company address, what's switched on). */
export async function paymentsFn<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/payments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export function usePaymentSetup(enabled = true) {
  return useQuery({
    queryKey: ['payment-setup'],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: () => paymentsFn<PaymentSetup>({ action: 'status' }),
  });
}

/** The menu badge: my links waiting on "keep or close?". */
export function useDecideCount(enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['payment-links', 'decide', profile?.id],
    enabled: enabled && !!profile,
    refetchInterval: 5 * 60_000,
    queryFn: () => rpc<number>('payment_links_to_decide'),
  });
}
