import { useQuery } from '@tanstack/react-query';
import { must, rpc, supabase } from '@/lib/supabase';
import type { ColdDetails, FillField, Lead, LeadSheet, MySheet } from '@/lib/types';
import { useAuth } from '@/app/auth';

/** The cold call sheets I'm on, with how many cards are ready for me on each. */
export function useMySheets() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-sheets', profile?.id],
    enabled: profile?.role === 'sales',
    staleTime: 30_000,
    queryFn: () => rpc<MySheet[]>('my_lead_sheets'),
  });
}

/** One sheet's settings (its fill-in fields), for the card. */
export function useLeadSheet(id: number | null | undefined) {
  return useQuery({
    queryKey: ['lead-sheet', id],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async () => must(await supabase.from('lead_sheets').select('*').eq('id', id!).maybeSingle()) as LeadSheet | null,
  });
}

export type SheetWithMembers = LeadSheet & { lead_sheet_members: { user_id: string }[] };

/** Every cold call sheet, with who is on it (admin). */
export function useLeadSheets(enabled = true) {
  return useQuery({
    queryKey: ['lead-sheets'],
    enabled,
    queryFn: async () => must(await supabase.from('lead_sheets').select('*, lead_sheet_members(user_id)')
      .order('created_at', { ascending: false })) as unknown as SheetWithMembers[],
  });
}

export const fillFieldsOf = (s: Pick<LeadSheet, 'fill_fields'> | null | undefined) => ((s?.fill_fields ?? []) as unknown as FillField[]);

/** A cold-sheet business's own details, or null for an ordinary lead. */
export function coldOf(lead: Pick<Lead, 'sheet_id' | 'details'>): ColdDetails | null {
  if (!lead.sheet_id && !lead.details) return null;
  return (lead.details ?? {}) as ColdDetails;
}

export const saveLeadAnswers = (leadId: number, answers: Record<string, string>) =>
  rpc<Record<string, string>>('save_lead_answers', { p_lead_id: leadId, p_answers: answers as never });

/** Cards I was handed from a sheet's pile but never called go back for the others. */
export const releaseSheetLeads = (sheetId: number, ids: number[]) => rpc<number>('release_sheet_leads', { p_sheet: sheetId, p_ids: ids });
