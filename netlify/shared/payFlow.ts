/**
 * What happens once PayPal says a link was paid, whichever way the news arrives
 * (the client's browser right after paying, or PayPal's webhook a moment later).
 * The database decides whether anything changed, so doing it twice is harmless.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { captureFacts, type Mode } from './paypal.ts';
import { receiptEmail, sendEmail, type EmailLink } from './payEmail.ts';

export async function recordCapture(db: SupabaseClient, linkId: number, mode: Mode, capture: any, payer?: any) {
  const f = captureFacts(capture);
  const status = f.status === 'COMPLETED' ? 'paid' : f.status === 'PENDING' ? 'pending' : null;
  if (!status) return { changed: false, status: f.status.toLowerCase() };
  const name = [payer?.name?.given_name, payer?.name?.surname].filter(Boolean).join(' ') || null;
  const { data, error } = await db.rpc('payment_link_paid', {
    p_id: linkId, p_status: status, p_mode: mode, p_order: f.orderId, p_capture: f.id,
    p_payer_name: name, p_payer_email: payer?.email_address ?? null,
    p_amount: f.amount, p_currency: f.currency, p_fee: f.fee, p_net: f.net, p_paid_at: f.at,
  });
  if (error) throw new Error(error.message);
  const out = data as { changed: boolean; status: string };
  if (out.status === 'paid') await sendReceiptOnce(db, linkId);
  return out;
}

/** Only one caller wins the right to send; a failed send gives it back for the next try. */
export async function sendReceiptOnce(db: SupabaseClient, linkId: number) {
  const { data: l } = await db
    .from('payment_links')
    .update({ receipt_emailed_at: new Date().toISOString() })
    .eq('id', linkId)
    .is('receipt_emailed_at', null)
    .eq('status', 'paid')
    .select('*')
    .maybeSingle();
  if (!l) return { sent: false, error: 'already sent' };
  const to = l.client_email ?? l.payer_email;
  if (!to) return { sent: false, error: 'no email address' };
  const out = await sendEmail(l.brand, to, receiptEmail(l as EmailLink));
  if (!out.sent) await db.from('payment_links').update({ receipt_emailed_at: null }).eq('id', linkId);
  return out;
}
