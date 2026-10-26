/**
 * The team's side of payment links that needs server keys: emailing an invoice
 * to the client from the company's own address, re-sending a receipt, and
 * telling the Payments page what's switched on. Every request carries the
 * person's own session; they must be the link's maker or an admin.
 */
import { BRANDS, PAY_HOSTS_READY } from '../../src/payments/brands.ts';
import { creds, currentMode, json, serviceClient } from '../shared/paypal.ts';
import { emailReady, invoiceEmail, receiptEmail, sendEmail, type EmailLink } from '../shared/payEmail.ts';

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const db = serviceClient();
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Sign in first' });
  const { data: who } = await db.auth.getUser(token);
  if (!who?.user) return json(401, { error: 'Sign in again' });
  const { data: me } = await db.from('profiles').select('id, role, is_active').eq('id', who.user.id).maybeSingle();
  if (!me?.is_active || me.role === 'client') return json(403, { error: 'Not allowed' });

  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: number; to?: string };

  if (body.action === 'status') {
    const s = creds('sandbox');
    const l = creds('live');
    return json(200, {
      mode: currentMode(),
      sandbox: Boolean(s.clientId && s.secret),
      live: Boolean(l.clientId && l.secret),
      webhook: Boolean(creds().webhookId),
      email: emailReady(),
      hosts: PAY_HOSTS_READY,
    });
  }

  const { data: link } = await db.from('payment_links').select('*').eq('id', Number(body.id)).maybeSingle();
  if (!link || (link.created_by !== me.id && me.role !== 'admin')) return json(404, { error: 'Payment link not found' });

  if (body.action === 'email_invoice') {
    if (link.status !== 'open') return json(400, { error: 'Only an open link can be emailed' });
    const to = String(body.to ?? link.client_email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json(400, { error: 'Add the client\'s email first' });
    const out = await sendEmail(link.brand, to, invoiceEmail(link as EmailLink));
    if (!out.sent) return json(502, { error: out.error });
    await db.from('payment_links')
      .update({ emailed_at: new Date().toISOString(), ...(link.client_email ? {} : { client_email: to }) })
      .eq('id', link.id);
    return json(200, { sent: true, to, from: BRANDS[link.brand as keyof typeof BRANDS].from });
  }

  if (body.action === 'email_receipt') {
    if (link.status !== 'paid') return json(400, { error: 'This link hasn\'t been paid' });
    const to = String(body.to ?? link.client_email ?? link.payer_email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json(400, { error: 'No email address for this client' });
    const out = await sendEmail(link.brand, to, receiptEmail(link as EmailLink));
    if (!out.sent) return json(502, { error: out.error });
    await db.from('payment_links').update({ receipt_emailed_at: new Date().toISOString() }).eq('id', link.id);
    return json(200, { sent: true, to });
  }

  return json(400, { error: 'Unknown action' });
};
