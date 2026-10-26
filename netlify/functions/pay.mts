/**
 * The client's side of a payment link (no login): starts a PayPal order for the
 * link's amount and captures it once the client approves.
 *
 * The amount always comes from the database, never from the browser, and a
 * capture is only accepted for the order made for that same link.
 */
import { BRANDS } from '../../src/payments/brands.ts';
import { creds, currentMode, json, paypal, PayPalError, serviceClient } from '../shared/paypal.ts';
import { recordCapture } from '../shared/payFlow.ts';

const money2 = (n: unknown) => Number(n).toFixed(2);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default async (req: Request) => {
  try {
    if (req.method === 'GET') {
      const c = creds();
      return json(200, { mode: c.mode, clientId: c.clientId ?? null });
    }
    if (req.method !== 'POST') return json(405, { error: 'Use POST' });

    const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string; orderID?: string };
    const code = String(body.code ?? '').trim();
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(code)) return json(400, { error: 'That payment link isn\'t valid' });

    const db = serviceClient();
    const { data: link } = await db.from('payment_links').select('*').eq('code', code).maybeSingle();
    if (!link) return json(404, { error: 'This payment link doesn\'t exist' });
    const mode = currentMode();

    if (body.action === 'create') {
      if (link.status === 'paid' || link.status === 'refunded') return json(409, { error: 'This invoice has already been paid', status: link.status });
      if (link.status === 'pending') return json(409, { error: 'A payment on this invoice is still clearing', status: link.status });
      if (link.status !== 'open') return json(410, { error: 'This payment link has been closed. Please contact us for a new one.', status: link.status });
      const brand = BRANDS[link.brand as keyof typeof BRANDS];
      const cur = link.currency as string;
      const order = await paypal<{ id: string }>(mode, '/v2/checkout/orders', {
        method: 'POST',
        body: {
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: link.code,
            custom_id: String(link.id),
            invoice_id: mode === 'live' ? link.number : `${link.number}-TEST-${Date.now().toString(36)}`,
            description: cut(`${brand.name} · ${link.purpose}`, 127),
            soft_descriptor: brand.statement,
            amount: {
              currency_code: cur,
              value: money2(link.total),
              breakdown: {
                item_total: { currency_code: cur, value: money2(link.subtotal) },
                ...(Number(link.discount) > 0 ? { discount: { currency_code: cur, value: money2(link.discount) } } : {}),
                ...(Number(link.tax_amount) > 0 ? { tax_total: { currency_code: cur, value: money2(link.tax_amount) } } : {}),
              },
            },
            items: (link.items as { description: string; quantity: number; unit_price: number }[]).map((i) => ({
              name: cut(i.description, 127),
              quantity: String(i.quantity),
              unit_amount: { currency_code: cur, value: money2(i.unit_price) },
              category: 'DIGITAL_GOODS',
            })),
          }],
          application_context: { brand_name: brand.name, shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
        },
      });
      await db.from('payment_links').update({ paypal_order_id: order.id }).eq('id', link.id);
      return json(200, { id: order.id });
    }

    if (body.action === 'capture') {
      const orderID = String(body.orderID ?? '');
      if (!/^[A-Z0-9]{6,40}$/.test(orderID)) return json(400, { error: 'Missing PayPal order' });
      if (link.status === 'paid' || link.status === 'refunded') return json(200, { status: link.status });

      let order: any;
      try {
        order = await paypal(mode, `/v2/checkout/orders/${orderID}/capture`, { method: 'POST', body: {}, requestId: `cap-${orderID}` });
      } catch (e) {
        if (e instanceof PayPalError && e.issue === 'INSTRUMENT_DECLINED') {
          return json(422, { error: 'Your card or PayPal balance was declined. Please try another way to pay.', restart: true });
        }
        if (e instanceof PayPalError && e.issue === 'ORDER_ALREADY_CAPTURED') {
          order = await paypal(mode, `/v2/checkout/orders/${orderID}`);
        } else {
          throw e;
        }
      }

      const unit = order?.purchase_units?.[0];
      if (unit?.reference_id !== link.code && unit?.custom_id !== String(link.id)) {
        return json(400, { error: 'That payment belongs to a different invoice' });
      }
      const capture = unit?.payments?.captures?.[0];
      if (!capture) return json(502, { error: 'PayPal didn\'t confirm the payment. You haven\'t been charged.' });
      if (capture.status === 'DECLINED' || capture.status === 'FAILED') {
        return json(422, { error: 'The payment was declined. Please try another way to pay.', restart: true });
      }
      const out = await recordCapture(db, link.id, mode, capture, order.payer);
      return json(200, { status: out.status });
    }

    return json(400, { error: 'Unknown action' });
  } catch (e) {
    const status = e instanceof PayPalError ? (e.issue === 'NOT_CONFIGURED' ? 503 : e.status >= 500 ? 502 : 400) : 500;
    console.error('pay function', e instanceof PayPalError ? { msg: e.message, issue: e.issue, body: e.body } : e);
    return json(status, { error: e instanceof PayPalError && e.issue === 'NOT_CONFIGURED' ? 'Online payment isn\'t switched on yet. Please try again later.' : 'Something went wrong talking to PayPal. You haven\'t been charged. Please try again.' });
  }
};
