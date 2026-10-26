/**
 * The invoice and the receipt as the client sees them. Plain presentation: the
 * client's page (PayApp) and the CRM's live preview both render these.
 */
import { animate, motion, useMotionValue, useTransform, type Variants } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { BRANDS, money, type PublicLink } from '@/payments/brands';
import './pay.css';

export const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@500&family=Montserrat:wght@700;800;900&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600;1,700&display=swap';

/** The brand fonts, added once wherever an invoice is shown. */
export function useBrandFonts() {
  useEffect(() => {
    if (document.getElementById('pay-fonts')) return;
    const l = document.createElement('link');
    l.id = 'pay-fonts';
    l.rel = 'stylesheet';
    l.href = FONTS_HREF;
    document.head.appendChild(l);
  }, []);
}

const EASE = [0.22, 1, 0.36, 1] as const;
export const sheetIn: Variants = {
  hidden: { opacity: 0, y: 36, scale: 0.975, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE, staggerChildren: 0.07, delayChildren: 0.15 } },
};
export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export const longDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Counts up to the amount the first time it shows. */
export function CountUp({ currency, value, delay = 0.35 }: { currency: string; value: number; delay?: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => money(currency, v));
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.25, delay, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [mv, value, delay]);
  return <motion.span>{text}</motion.span>;
}

export function Backdrop() {
  const drift = (x: number, y: number, d: number) => ({
    animate: { x: [0, x, -x * 0.6, 0], y: [0, y, y * 0.4, 0], scale: [1, 1.08, 0.96, 1] },
    transition: { duration: d, repeat: Infinity, ease: 'easeInOut' as const },
  });
  return (
    <div className="pay-backdrop" aria-hidden>
      <div className="pay-grid" />
      <motion.div className="pay-orb a" {...drift(60, 40, 22)} />
      <motion.div className="pay-orb b" {...drift(-50, -60, 26)} />
      <motion.div className="pay-orb c" {...drift(40, -30, 18)} />
      <div className="pay-grain" />
    </div>
  );
}

export function BrandLogo({ brand }: { brand: PublicLink['brand'] }) {
  const onDark = brand === 'nuuke';
  return (
    <div className="pay-logo">
      <img className="screen-only" src={onDark ? '/brand/nuuke-white.png' : '/brand/nuuke-black.png'} alt={BRANDS[brand].name} />
      <img className="print-only" src="/brand/nuuke-black.png" alt="" />
      {brand === 'marketing' && <span className="pay-logo-tag">MARKETING</span>}
    </div>
  );
}

function Lines({ link }: { link: Pick<PublicLink, 'items' | 'currency'> }) {
  return (
    <div className="pay-lines">
      {link.items.map((i, n) => (
        <motion.div key={n} className="pay-line" variants={rise}>
          <div className="pay-line-desc">{i.description || '—'}</div>
          <div className="pay-line-meta">{i.quantity} × {money(link.currency, i.unit_price)}</div>
          <div className="pay-line-total">{money(link.currency, i.quantity * i.unit_price)}</div>
        </motion.div>
      ))}
    </div>
  );
}

function Totals({ link }: { link: PublicLink }) {
  return (
    <motion.div className="pay-totals" variants={rise}>
      <div><span>Subtotal</span><span>{money(link.currency, link.subtotal)}</span></div>
      {Number(link.discount) > 0 && <div><span>Discount</span><span>−{money(link.currency, link.discount)}</span></div>}
      {Number(link.tax_rate) > 0 && (
        <div><span>{link.tax_label} ({Number(link.tax_rate)}%)</span><span>{money(link.currency, link.tax_amount)}</span></div>
      )}
      <div className="grand"><span>Total</span><span>{money(link.currency, link.total)}</span></div>
      {Number(link.refunded_amount) > 0 && (
        <div className="refund"><span>Refunded</span><span>−{money(link.currency, link.refunded_amount)}</span></div>
      )}
    </motion.div>
  );
}

function Parties({ link }: { link: PublicLink }) {
  const b = BRANDS[link.brand];
  return (
    <motion.div className="pay-parties" variants={rise}>
      <div>
        <h4>Billed to</h4>
        <p>
          <strong>{link.client_name || 'Client name'}</strong>
          {link.client_company && <><br />{link.client_company}</>}
          {link.client_email && <><br /><span className="email">{link.client_email}</span></>}
        </p>
      </div>
      <div>
        <h4>From</h4>
        <p><strong>{b.name}</strong><br />{b.address.join(', ')}</p>
      </div>
    </motion.div>
  );
}

/** The invoice. `children` is the pay box (PayPal buttons) on the client's page. */
export function InvoiceSheet({ link, children, animateIn = true }: { link: PublicLink; children?: ReactNode; animateIn?: boolean }) {
  const b = BRANDS[link.brand];
  return (
    <motion.article className="pay-sheet" variants={sheetIn} initial={animateIn ? 'hidden' : false} animate="show">
      <motion.div className="pay-head" variants={rise}>
        <BrandLogo brand={link.brand} />
        <span className="pay-chip">Invoice <b>{link.number}</b></span>
      </motion.div>

      <motion.div variants={rise}>
        <div className="pay-amount-label">Amount due</div>
        <div className="pay-amount">
          {animateIn ? <CountUp currency={link.currency} value={Number(link.total)} /> : money(link.currency, link.total)}
          <small>{link.currency}</small>
        </div>
        <div className="pay-due">
          <span>{link.due_on ? <>Due <b>{longDate(link.due_on)}</b></> : <b>Due on receipt</b>}</span>
          <span>Issued {longDate(link.created_at)}</span>
        </div>
      </motion.div>

      <Parties link={link} />
      <motion.div className="pay-purpose" variants={rise}>{link.purpose || 'What the payment is for'}</motion.div>
      <Lines link={link} />
      <Totals link={link} />
      {link.note && <motion.div className="pay-note" variants={rise}>{link.note}</motion.div>}

      {children && <motion.div className="pay-box" variants={rise}>{children}</motion.div>}

      <motion.div className="pay-foot" variants={rise}>
        <span>{link.prepared_by ? `Prepared by ${link.prepared_by}` : b.name}</span>
        <span>Questions? <a href={`mailto:${b.replyTo}`}>{b.replyTo}</a></span>
      </motion.div>
    </motion.article>
  );
}

function CheckBadge({ delay = 0.35 }: { delay?: number }) {
  return (
    <div className="pay-check">
      <motion.div
        className="pay-check-ring"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 1.5], opacity: [0.7, 0] }}
        transition={{ duration: 1.4, delay: delay + 0.55, ease: 'easeOut', repeat: 2, repeatDelay: 0.6 }}
      />
      <svg viewBox="0 0 76 76" fill="none">
        <motion.circle
          cx="38" cy="38" r="35" stroke="var(--good)" strokeWidth="3" strokeLinecap="round"
          initial={{ pathLength: 0, rotate: -90 }} animate={{ pathLength: 1 }} style={{ originX: '50%', originY: '50%' }}
          transition={{ duration: 0.7, delay, ease: [0.65, 0, 0.35, 1] }}
        />
        <motion.circle
          cx="38" cy="38" r="31" fill="var(--good)" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 0.16 }}
          transition={{ delay: delay + 0.45, type: 'spring', stiffness: 260, damping: 18 }}
        />
        <motion.path
          d="M24 39.5 L34 49 L53 28" stroke="var(--good)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: delay + 0.55, ease: 'easeOut' }}
        />
      </svg>
    </div>
  );
}

/** The receipt, once paid (or refunded). */
export function ReceiptSheet({ link, celebrate, actions }: { link: PublicLink; celebrate?: boolean; actions?: ReactNode }) {
  const b = BRANDS[link.brand];
  const refunded = link.status === 'refunded';
  const paid = Number(link.paid_amount ?? link.total);
  const [copied, setCopied] = useState(false);
  const base = celebrate ? 0.25 : 0.15;
  return (
    <motion.article
      className="pay-sheet pay-receipt"
      variants={sheetIn}
      initial="hidden"
      animate="show"
    >
      <motion.div
        className={`pay-stamp${refunded ? ' refunded' : ''}`}
        initial={{ opacity: 0, scale: 2.6, rotate: -28 }}
        animate={{ opacity: 0.92, scale: 1, rotate: -12 }}
        transition={{ delay: base + 1.15, type: 'spring', stiffness: 520, damping: 22, mass: 1.1 }}
      >
        {refunded ? 'Refunded' : 'Paid'}
        <small>{link.paid_at ? longDate(link.paid_at) : ''}</small>
      </motion.div>

      <motion.div className="pay-head" variants={rise}>
        <BrandLogo brand={link.brand} />
      </motion.div>

      <motion.div variants={rise}>
        <CheckBadge delay={base} />
        <div className="pay-received">{refunded ? 'Payment refunded' : 'Payment received'}</div>
        <div className="pay-amount" style={{ marginTop: 10 }}>
          <CountUp currency={link.currency} value={paid} delay={base + 0.4} />
          <small>{link.currency}</small>
        </div>
        <div className="pay-due">
          {link.paid_at && <span>Paid <b>{longDate(link.paid_at)}</b> at {timeOf(link.paid_at)}</span>}
          {link.mode === 'sandbox' && <span><b>Test payment</b> · no real money moved</span>}
        </div>
      </motion.div>

      <motion.div className="pay-facts" variants={rise}>
        <div><h4>Receipt for</h4><p>Invoice {link.number}</p></div>
        <div><h4>Paid by</h4><p>{link.payer_name || link.client_name}</p></div>
        <div><h4>Paid to</h4><p>{b.name}</p></div>
        <div>
          <h4>PayPal reference</h4>
          <p className="mono">
            {link.reference ?? '—'}
            {link.reference && (
              <button
                className="pay-copy"
                onClick={() => { void navigator.clipboard?.writeText(link.reference!); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
              >
                {copied ? 'copied' : 'copy'}
              </button>
            )}
          </p>
        </div>
      </motion.div>

      <motion.div className="pay-purpose" variants={rise}>{link.purpose}</motion.div>
      <Lines link={link} />
      <Totals link={link} />

      {actions && <motion.div className="pay-actions" variants={rise}>{actions}</motion.div>}

      <motion.div className="pay-foot" variants={rise}>
        <span>Thank you, {link.client_name.split(/\s+/)[0]}.</span>
        <span>{b.name} · {b.address.join(', ')}</span>
      </motion.div>
    </motion.article>
  );
}
