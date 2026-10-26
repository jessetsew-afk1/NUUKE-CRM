/**
 * PayPal's own updates: payments that finished clearing, declines, refunds,
 * chargebacks and disputes. Each event is checked with PayPal before anything
 * changes. Register https://nuuke.space/.netlify/functions/paypal-webhook in
 * both the sandbox and the live app.
 */
import { captureFacts, json, serviceClient, verifyWebhook } from '../shared/paypal.ts';
import { recordCapture } from '../shared/payFlow.ts';

/** A refund or reversal points back at its capture through its "up" link. */
const captureOf = (resource: any): string | null => {
  const up = (resource?.links ?? []).find((l: any) => l.rel === 'up')?.href as string | undefined;
  return up?.match(/\/captures\/([^/?]+)/)?.[1] ?? null;
};

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const raw = await req.text();
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Not JSON' });
  }
  const mode = await verifyWebhook(req.headers, event);
  if (!mode) return json(400, { error: 'Could not verify this event with PayPal' });

  const db = serviceClient();
  const r = event.resource ?? {};
  try {
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
      case 'PAYMENT.CAPTURE.PENDING': {
        const f = captureFacts(r);
        const id = await linkFor(db, f.linkId, f.id);
        if (id) await recordCapture(db, id, mode, r);
        break;
      }
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED': {
        const f = captureFacts(r);
        const id = await linkFor(db, f.linkId, f.id);
        if (id) await db.rpc('payment_link_failed', { p_id: id, p_reason: f.reason ? `PayPal: ${f.reason.toLowerCase().replace(/_/g, ' ')}` : null });
        break;
      }
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED': {
        const capture = captureOf(r);
        if (capture) {
          await db.rpc('payment_link_refunded', {
            p_capture: capture, p_refund_id: String(r.id), p_amount: Number(r.amount?.value ?? 0),
            p_reason: event.event_type === 'PAYMENT.CAPTURE.REVERSED' ? 'Chargeback / reversal' : (r.note_to_payer ?? null),
          });
        }
        break;
      }
      case 'CUSTOMER.DISPUTE.CREATED':
      case 'CUSTOMER.DISPUTE.UPDATED':
      case 'CUSTOMER.DISPUTE.RESOLVED': {
        const open = event.event_type !== 'CUSTOMER.DISPUTE.RESOLVED' && r.status !== 'RESOLVED';
        for (const t of r.disputed_transactions ?? []) {
          if (t.seller_transaction_id) {
            await db.rpc('payment_link_disputed', {
              p_capture: t.seller_transaction_id, p_open: open,
              p_reason: r.reason ? String(r.reason).toLowerCase().replace(/_/g, ' ') : null,
            });
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error('paypal-webhook', event.event_type, e);
    return json(500, { error: 'Failed; PayPal will retry' });
  }
  return json(200, { ok: true });
};

async function linkFor(db: ReturnType<typeof serviceClient>, linkId: number | null, captureId: string) {
  if (linkId) {
    const { data } = await db.from('payment_links').select('id').eq('id', linkId).maybeSingle();
    if (data) return data.id as number;
  }
  const { data } = await db.from('payment_links').select('id').eq('paypal_capture_id', captureId).maybeSingle();
  return (data?.id as number | undefined) ?? null;
}
