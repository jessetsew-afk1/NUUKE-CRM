/**
 * Talking to PayPal from the server. The secret never leaves Netlify.
 *
 * PAYPAL_MODE picks the account the CRM takes payments with: "sandbox" (test
 * money) until launch, then "live". Each mode has its own PAYPAL_<MODE>_CLIENT_ID,
 * PAYPAL_<MODE>_SECRET and PAYPAL_<MODE>_WEBHOOK_ID.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Mode = 'sandbox' | 'live';

const clean = (v?: string) => v?.trim().replace(/^['"]+|['"]+$/g, '').trim() || undefined;

export const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export function serviceClient(): SupabaseClient {
  const url = clean(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)
    ?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/i, '').replace(/\/+$/, '');
  const key = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set in the Netlify environment');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const currentMode = (): Mode => (clean(process.env.PAYPAL_MODE)?.toLowerCase() === 'live' ? 'live' : 'sandbox');

export function creds(mode: Mode = currentMode()) {
  const M = mode.toUpperCase();
  return {
    mode,
    clientId: clean(process.env[`PAYPAL_${M}_CLIENT_ID`]),
    secret: clean(process.env[`PAYPAL_${M}_SECRET`]),
    webhookId: clean(process.env[`PAYPAL_${M}_WEBHOOK_ID`]),
    base: mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
  };
}

export class PayPalError extends Error {
  constructor(message: string, public status: number, public issue?: string, public body?: unknown) {
    super(message);
  }
}

const tokens = new Map<Mode, { token: string; until: number }>();

async function token(mode: Mode) {
  const c = creds(mode);
  if (!c.clientId || !c.secret) throw new PayPalError(`PayPal ${mode} keys aren't set in Netlify yet`, 503, 'NOT_CONFIGURED');
  const hit = tokens.get(mode);
  if (hit && hit.until > Date.now()) return hit.token;
  const res = await fetch(`${c.base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${c.clientId}:${c.secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new PayPalError(`PayPal turned down the ${mode} keys: ${body.error_description ?? res.status}`, 502, 'AUTH');
  }
  tokens.set(mode, { token: body.access_token, until: Date.now() + Math.max(60, (body.expires_in ?? 300) - 120) * 1000 });
  return body.access_token;
}

export async function paypal<T = any>(mode: Mode, path: string, init: { method?: string; body?: unknown; requestId?: string } = {}): Promise<T> {
  const c = creds(mode);
  const res = await fetch(`${c.base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${await token(mode)}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.requestId ? { 'paypal-request-id': init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const issue = body?.details?.[0]?.issue ?? body?.name;
    throw new PayPalError(body?.details?.[0]?.description ?? body?.message ?? `PayPal error ${res.status}`, res.status, issue, body);
  }
  return body as T;
}

/** The bits of a capture the database keeps. */
export function captureFacts(capture: any) {
  const b = capture?.seller_receivable_breakdown;
  return {
    id: String(capture?.id ?? ''),
    status: String(capture?.status ?? ''),
    amount: Number(capture?.amount?.value ?? 0),
    currency: String(capture?.amount?.currency_code ?? ''),
    fee: b?.paypal_fee?.value != null ? Number(b.paypal_fee.value) : null,
    net: b?.net_amount?.value != null ? Number(b.net_amount.value) : null,
    at: capture?.create_time ?? capture?.update_time ?? null,
    linkId: capture?.custom_id ? Number(capture.custom_id) : null,
    invoice: capture?.invoice_id ?? null,
    orderId: capture?.supplementary_data?.related_ids?.order_id ?? null,
    reason: capture?.status_details?.reason ?? null,
  };
}

/** Is this webhook really from PayPal? Tries the current mode first, then the other one. */
export async function verifyWebhook(headers: Headers, event: unknown): Promise<Mode | null> {
  const order: Mode[] = currentMode() === 'live' ? ['live', 'sandbox'] : ['sandbox', 'live'];
  for (const mode of order) {
    const c = creds(mode);
    if (!c.clientId || !c.secret || !c.webhookId) continue;
    try {
      const out = await paypal<{ verification_status: string }>(mode, '/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        body: {
          auth_algo: headers.get('paypal-auth-algo'),
          cert_url: headers.get('paypal-cert-url'),
          transmission_id: headers.get('paypal-transmission-id'),
          transmission_sig: headers.get('paypal-transmission-sig'),
          transmission_time: headers.get('paypal-transmission-time'),
          webhook_id: c.webhookId,
          webhook_event: event,
        },
      });
      if (out.verification_status === 'SUCCESS') return mode;
    } catch {
      /* try the other mode */
    }
  }
  return null;
}
