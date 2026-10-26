/**
 * Invoice and receipt emails, sent from the company's own address through Resend
 * (RESEND_API_KEY in Netlify). Without the key nothing is sent and the caller is told.
 */
import { BRANDS, CRM_ORIGIN, money, payUrl, type BrandKey, type Currency, type PayItem } from '../../src/payments/brands.ts';

export interface EmailLink {
  brand: BrandKey;
  code: string;
  number: string;
  client_name: string;
  client_email: string | null;
  purpose: string;
  items: PayItem[];
  currency: Currency;
  discount: number;
  tax_label: string;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  note: string | null;
  due_on: string | null;
  paid_at?: string | null;
  paid_amount?: number | null;
  paypal_capture_id?: string | null;
  mode?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const longDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

interface Look { bg: string; card: string; ink: string; soft: string; line: string; accent: string; button: string; buttonInk: string; logo: string; font: string; display: string }
const LOOK: Record<BrandKey, Look> = {
  nuuke: {
    bg: '#050506', card: '#121216', ink: '#f5f5f6', soft: '#9a9aa3', line: '#26262c', accent: '#ff2e88',
    button: 'linear-gradient(90deg,#ff2e88,#8b5cff)', buttonInk: '#ffffff', logo: `${CRM_ORIGIN}/brand/nuuke-white.png`,
    font: "Inter,'Helvetica Neue',Arial,sans-serif", display: "Montserrat,'Helvetica Neue',Arial,sans-serif",
  },
  marketing: {
    bg: '#f3efe8', card: '#ffffff', ink: '#111111', soft: '#6b6b6b', line: '#e7e2d8', accent: '#d64532',
    button: '#111111', buttonInk: '#ffffff', logo: `${CRM_ORIGIN}/brand/nuuke-black.png`,
    font: "'Inter Tight',Inter,'Helvetica Neue',Arial,sans-serif", display: "'Playfair Display',Georgia,serif",
  },
};

function shell(brand: BrandKey, preheader: string, inner: string) {
  const b = BRANDS[brand];
  const L = LOOK[brand];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${brand === 'nuuke' ? 'dark' : 'light'}"></head>
<body style="margin:0;padding:0;background:${L.bg};font-family:${L.font};color:${L.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${L.bg};padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 8px 22px"><img src="${L.logo}" alt="${esc(b.name)}" height="28" style="height:28px;width:auto;display:block;border:0">${
    brand === 'marketing' ? `<div style="font-size:11px;letter-spacing:.24em;color:${L.soft};margin-top:6px">MARKETING</div>` : ''}</td></tr>
<tr><td style="background:${L.card};border:1px solid ${L.line};border-radius:20px;padding:32px 28px">${inner}</td></tr>
<tr><td style="padding:22px 8px;font-size:12px;line-height:1.6;color:${L.soft}">${esc(b.name)} · ${b.address.map(esc).join(', ')}<br>
Questions? Just reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
}

function itemsTable(l: EmailLink) {
  const L = LOOK[l.brand];
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:${strong ? L.ink : L.soft};font-size:14px;${strong ? 'font-weight:700;' : ''}">${label}</td><td align="right" style="padding:6px 0;font-size:14px;${strong ? 'font-weight:700;' : ''}color:${L.ink}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${L.line};margin-top:22px;padding-top:10px">
${l.items.map((i) => row(`${esc(i.description)}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`, money(l.currency, i.quantity * i.unit_price))).join('')}
${Number(l.discount) > 0 ? row('Discount', `−${money(l.currency, l.discount)}`) : ''}
${Number(l.tax_amount) > 0 ? row(`${esc(l.tax_label)} (${Number(l.tax_rate)}%)`, money(l.currency, l.tax_amount)) : ''}
<tr><td colspan="2" style="border-top:1px solid ${L.line};padding-top:6px"></td></tr>
${row('Total', money(l.currency, l.total), true)}
</table>`;
}

function button(brand: BrandKey, href: string, label: string) {
  const L = LOOK[brand];
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr><td style="border-radius:999px;background:${L.button.startsWith('linear') ? L.accent : L.button};background-image:${L.button.startsWith('linear') ? L.button : 'none'}">
<a href="${href}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:${L.buttonInk};text-decoration:none;border-radius:999px">${label}</a></td></tr></table>`;
}

export function invoiceEmail(l: EmailLink) {
  const b = BRANDS[l.brand];
  const L = LOOK[l.brand];
  const url = payUrl(l.brand, l.code);
  const inner = `<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:${L.soft}">Invoice ${esc(l.number)}</div>
<div style="font-family:${L.display};font-size:36px;font-weight:800;margin:10px 0 4px;color:${L.ink}">${money(l.currency, l.total)}</div>
<div style="font-size:14px;color:${L.soft}">${l.due_on ? `Due ${longDate(l.due_on)}` : 'Due on receipt'}</div>
<p style="font-size:15px;line-height:1.6;margin:22px 0 0">Hi ${esc(firstName(l.client_name))}, here is your invoice from ${esc(b.name)} for <b>${esc(l.purpose)}</b>.${
    l.note ? `<br><br>${esc(l.note).replace(/\n/g, '<br>')}` : ''}</p>
${itemsTable(l)}
${button(l.brand, url, 'View &amp; pay invoice')}
<p style="font-size:12px;color:${L.soft};margin:18px 0 0">Pay securely with PayPal or a debit or credit card. No PayPal account needed.</p>`;
  return {
    subject: `Invoice ${l.number} from ${b.name} · ${money(l.currency, l.total)}`,
    html: shell(l.brand, `${money(l.currency, l.total)} for ${l.purpose}`, inner),
    text: `Hi ${firstName(l.client_name)},\n\nHere is your invoice ${l.number} from ${b.name} for ${l.purpose}: ${money(l.currency, l.total)}${
      l.due_on ? `, due ${longDate(l.due_on)}` : ''}.\n\nView and pay: ${url}\n\n${b.name} · ${b.address.join(', ')}`,
  };
}

export function receiptEmail(l: EmailLink) {
  const b = BRANDS[l.brand];
  const L = LOOK[l.brand];
  const url = payUrl(l.brand, l.code);
  const paid = l.paid_amount ?? l.total;
  const inner = `<div style="display:inline-block;padding:6px 12px;border-radius:999px;background:${l.brand === 'nuuke' ? 'rgba(52,211,153,.14)' : '#e7f4ec'};color:${l.brand === 'nuuke' ? '#34d399' : '#1f7a4a'};font-size:12px;font-weight:700;letter-spacing:.08em">✓ PAID${l.mode === 'sandbox' ? ' · TEST' : ''}</div>
<div style="font-family:${L.display};font-size:36px;font-weight:800;margin:14px 0 4px;color:${L.ink}">${money(l.currency, paid)}</div>
<div style="font-size:14px;color:${L.soft}">Receipt for ${esc(l.number)}${l.paid_at ? ` · ${longDate(l.paid_at)}` : ''}</div>
<p style="font-size:15px;line-height:1.6;margin:22px 0 0">Thank you, ${esc(firstName(l.client_name))}. We've received your payment for <b>${esc(l.purpose)}</b>.</p>
${itemsTable(l)}
${l.paypal_capture_id ? `<p style="font-size:12px;color:${L.soft};margin:16px 0 0">PayPal reference: ${esc(l.paypal_capture_id)}</p>` : ''}
${button(l.brand, url, 'View your receipt')}`;
  return {
    subject: `Receipt ${l.number} · ${money(l.currency, paid)} paid to ${b.name}`,
    html: shell(l.brand, `Thank you, payment received: ${money(l.currency, paid)}`, inner),
    text: `Thank you, ${firstName(l.client_name)}.\n\nWe've received ${money(l.currency, paid)} for ${l.purpose} (${l.number}).${
      l.paypal_capture_id ? `\nPayPal reference: ${l.paypal_capture_id}` : ''}\n\nYour receipt: ${url}\n\n${b.name} · ${b.address.join(', ')}`,
  };
}

export const emailReady = () => Boolean(process.env.RESEND_API_KEY?.trim());

export async function sendEmail(brand: BrandKey, to: string, mail: { subject: string; html: string; text: string }) {
  const key = process.env.RESEND_API_KEY?.trim().replace(/^['"]+|['"]+$/g, '');
  if (!key) return { sent: false, error: 'Email sending isn\'t set up yet (RESEND_API_KEY in Netlify).' };
  const b = BRANDS[brand];
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: b.from, to: [to], reply_to: b.replyTo, subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { sent: false, error: body.message ?? `The email service answered ${res.status}` };
  }
  return { sent: true as const };
}
