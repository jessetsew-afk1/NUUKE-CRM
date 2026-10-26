/**
 * The two companies an invoice can come from. Shared by the CRM, the client's
 * payment page and the Netlify functions (emails, PayPal), so keep it free of
 * browser- or React-only code.
 */
export type BrandKey = 'nuuke' | 'marketing';
export type Currency = 'USD' | 'GBP';

export interface Brand {
  key: BrandKey;
  name: string;
  /** Short name PayPal prints on the client's card statement after the account's own name (max 22 characters). */
  statement: string;
  site: string;
  payHost: string;
  /** Where invoices and receipts are sent from; replies go to replyTo. */
  sender: string;
  from: string;
  replyTo: string;
  address: string[];
}

export const BRANDS: Record<BrandKey, Brand> = {
  nuuke: {
    key: 'nuuke',
    name: 'NUUKE',
    statement: 'NUUKE',
    site: 'nuuke.us',
    payHost: 'pay.nuuke.us',
    sender: 'billing@nuuke.us',
    from: 'NUUKE <billing@nuuke.us>',
    replyTo: 'billing@nuuke.us',
    address: ['100 N Center St', 'Casper, WY 82601', 'United States'],
  },
  marketing: {
    key: 'marketing',
    name: 'NUUKE.MARKETING',
    statement: 'NUUKE MKTG',
    site: 'nuuke.marketing',
    payHost: 'pay.nuuke.marketing',
    sender: 'billing@nuuke.marketing',
    from: 'NUUKE.MARKETING <billing@nuuke.marketing>',
    replyTo: 'billing@nuuke.us',
    address: ['100 N Center St', 'Casper, WY 82601', 'United States'],
  },
};

/**
 * Switch on once pay.nuuke.us and pay.nuuke.marketing point at this site (see the
 * setup guide). Until then links use the CRM's own address; both keep working after.
 */
export const PAY_HOSTS_READY = false;
export const CRM_ORIGIN = 'https://nuuke.space';

export function payUrl(brand: BrandKey, code: string) {
  return PAY_HOSTS_READY ? `https://${BRANDS[brand].payHost}/${code}` : `${CRM_ORIGIN}/pay/${code}`;
}

export const CURRENCY_SYMBOL: Record<Currency, string> = { USD: '$', GBP: '£' };

export function money(currency: Currency | string, amount: number | string | null | undefined) {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat(currency === 'GBP' ? 'en-GB' : 'en-US', {
    style: 'currency', currency: currency === 'GBP' ? 'GBP' : 'USD', minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export interface PayItem { description: string; quantity: number; unit_price: number }

/** The same sums the database does, for the live preview while typing. */
export function totals(items: PayItem[], discount: number, taxRate: number) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const subtotal = r2(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0));
  const disc = r2(Math.min(Math.max(Number(discount) || 0, 0), subtotal));
  const tax = r2(((subtotal - disc) * (Number(taxRate) || 0)) / 100);
  return { subtotal, discount: disc, tax, total: r2(subtotal - disc + tax) };
}

/** What the client's page gets back for a link (see payment_link_public). */
export interface PublicLink {
  code: string;
  brand: BrandKey;
  number: string;
  status: 'open' | 'pending' | 'paid' | 'refunded' | 'closed';
  mode: 'sandbox' | 'live' | null;
  client_name: string;
  client_company: string | null;
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
  created_at: string;
  paid_at: string | null;
  paid_amount: number | null;
  payer_name: string | null;
  reference: string | null;
  refunded_amount: number;
  prepared_by: string | null;
}
