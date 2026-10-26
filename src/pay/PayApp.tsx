/**
 * The client's payment page: pay.nuuke.us/<code>, pay.nuuke.marketing/<code> or
 * nuuke.space/pay/<code>. No login. Shows the invoice with PayPal's buttons, then
 * turns into the receipt the moment the payment goes through.
 */
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BRANDS, type PublicLink } from '@/payments/brands';
import { Backdrop, InvoiceSheet, ReceiptSheet, rise, sheetIn, useBrandFonts } from './Invoice';

/** The link's code from whichever address the client opened. */
function codeFromUrl() {
  const { pathname, hostname, search } = window.location;
  const q = new URLSearchParams(search).get('code');
  if (q) return q;
  const m = pathname.match(/^\/pay\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (hostname.startsWith('pay.')) return pathname.replace(/^\/+|\/+$/g, '') || null;
  return null;
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/^['"]+|['"]+$/g, '').trim() : '') || undefined;
const SB_URL = clean(import.meta.env.VITE_SUPABASE_URL)?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/i, '');
const SB_KEY = clean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY);

async function fetchLink(code: string): Promise<PublicLink | null> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/payment_link_public`, {
    method: 'POST',
    headers: { apikey: SB_KEY ?? '', authorization: `Bearer ${SB_KEY ?? ''}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_code: code }),
  });
  if (!res.ok) throw new Error('We couldn\'t load this invoice. Please refresh the page.');
  return (await res.json()) as PublicLink | null;
}

async function payFn<T>(body?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/.netlify/functions/pay', body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? 'Something went wrong. You haven\'t been charged.'), json);
  return json as T;
}

declare global {
  interface Window { paypal?: any }
}

let sdk: Promise<any> | null = null;
function loadPayPal(clientId: string, currency: string) {
  sdk ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${currency}&intent=capture&components=buttons&enable-funding=venmo,card&commit=true`;
    s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error('PayPal didn\'t load')));
    s.onerror = () => reject(new Error('PayPal couldn\'t load. Check your connection or turn off an ad blocker, then refresh.'));
    document.head.appendChild(s);
  });
  return sdk;
}

function burst(brand: PublicLink['brand']) {
  const colors = brand === 'nuuke' ? ['#ff2e88', '#8b5cff', '#ffffff', '#34d399'] : ['#d64532', '#111111', '#efdedb', '#1f7a4a'];
  const shot = (x: number, angle: number) =>
    confetti({ particleCount: 70, spread: 70, startVelocity: 48, angle, origin: { x, y: 0.7 }, colors, ticks: 220, scalar: 0.95, disableForReducedMotion: true });
  shot(0.15, 60);
  shot(0.85, 120);
  setTimeout(() => confetti({ particleCount: 90, spread: 110, startVelocity: 32, origin: { y: 0.35 }, colors, ticks: 260, disableForReducedMotion: true }), 380);
}

type View = 'loading' | 'missing' | 'error' | 'ready';

export function PayApp() {
  const code = useRef(codeFromUrl()).current;
  const [view, setView] = useState<View>(code ? 'loading' : 'missing');
  const [link, setLink] = useState<PublicLink | null>(null);
  const [mode, setMode] = useState<'sandbox' | 'live' | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useBrandFonts();

  const reload = useCallback(async () => {
    if (!code) return null;
    const l = await fetchLink(code);
    setLink(l);
    return l;
  }, [code]);

  useEffect(() => {
    if (!code) {
      // The bare pay address: send people to the company's site.
      const host = window.location.hostname;
      const brand = Object.values(BRANDS).find((b) => b.payHost === host);
      if (brand) window.location.replace(`https://${brand.site}`);
      return;
    }
    Promise.all([reload(), payFn<{ mode: 'sandbox' | 'live' }>().catch(() => ({ mode: null }))])
      .then(([l, cfg]) => {
        setMode(cfg.mode as 'sandbox' | 'live' | null);
        setView(l ? 'ready' : 'missing');
      })
      .catch((e: Error) => { setError(e.message); setView('error'); });
  }, [code, reload]);

  // A payment still clearing: look again every few seconds.
  useEffect(() => {
    if (link?.status !== 'pending') return;
    const t = setInterval(() => { void reload(); }, 6000);
    return () => clearInterval(t);
  }, [link?.status, reload]);

  useEffect(() => {
    if (!link) return;
    const b = BRANDS[link.brand];
    document.title = link.status === 'paid' ? `Receipt ${link.number} · ${b.name}` : `Invoice ${link.number} · ${b.name}`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', link.brand === 'nuuke' ? '#050506' : '#f3efe8');
    document.body.style.background = link.brand === 'nuuke' ? '#050506' : '#f3efe8';
  }, [link]);

  const onPaid = useCallback(async () => {
    const l = await reload();
    if (l?.status === 'paid') {
      setCelebrate(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => burst(l.brand), 900);
    }
  }, [reload]);

  if (view === 'loading') return <div className="pay-boot" />;

  const brand = link?.brand ?? (window.location.hostname.includes('marketing') ? 'marketing' : 'nuuke');
  const b = BRANDS[brand];
  const showTest = (link?.status === 'paid' || link?.status === 'refunded') ? link.mode === 'sandbox' : mode === 'sandbox';

  return (
    <div className="pay" data-brand={brand}>
      <div className="pay-page">
        <Backdrop />
        {showTest && view === 'ready' && (
          <motion.div className="pay-testbar" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            Test mode: this uses PayPal's sandbox, so no real money moves.
          </motion.div>
        )}
        <main className="pay-wrap">
          <AnimatePresence mode="wait">
            {view !== 'ready' || !link ? (
              <Message key="msg" title={view === 'error' ? 'Something went wrong' : 'We can\'t find this invoice'}
                body={view === 'error' ? error ?? '' : `The link may be mistyped. Please check it, or email ${b.replyTo} and we'll send a new one.`} brand={brand} />
            ) : link.status === 'paid' || link.status === 'refunded' ? (
              <motion.div key="receipt" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ReceiptSheet
                  link={link}
                  celebrate={celebrate}
                  actions={
                    <>
                      <button className="pay-btn primary" onClick={() => window.print()}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
                        Download PDF
                      </button>
                      <button className="pay-btn" onClick={() => window.print()}>Print</button>
                    </>
                  }
                />
              </motion.div>
            ) : link.status === 'pending' ? (
              <Message key="pending" spin title="Confirming your payment" brand={brand}
                body="PayPal is still clearing your payment. This page updates on its own, and you'll get a receipt by email." />
            ) : link.status === 'closed' ? (
              <Message key="closed" title="This payment link is closed" brand={brand}
                body={`Invoice ${link.number} can no longer be paid here. Email ${b.replyTo} and we'll sort it out.`} />
            ) : (
              <motion.div key="invoice" exit={{ opacity: 0, y: -24, scale: 0.98, filter: 'blur(4px)', transition: { duration: 0.45 } }}>
                <InvoiceSheet link={link}>
                  <PayBox link={link} onPaid={onPaid} />
                </InvoiceSheet>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="pay-under">
            {b.name} · <a href={`https://${b.site}`}>{b.site}</a>
          </div>
        </main>
      </div>
    </div>
  );
}

function Message({ title, body, spin, brand }: { title: string; body: string; spin?: boolean; brand: PublicLink['brand'] }) {
  return (
    <motion.article className="pay-sheet" variants={sheetIn} initial="hidden" animate="show" exit={{ opacity: 0 }}>
      <motion.div className="pay-head" variants={rise}>
        <div className="pay-logo"><img src={brand === 'nuuke' ? '/brand/nuuke-white.png' : '/brand/nuuke-black.png'} alt={BRANDS[brand].name} /></div>
      </motion.div>
      <motion.div className="pay-state" variants={rise}>
        {spin && <div className="pay-spin" />}
        <h2>{title}</h2>
        <p>{body}</p>
      </motion.div>
    </motion.article>
  );
}

function PayBox({ link, onPaid }: { link: PublicLink; onPaid: () => Promise<void> }) {
  const holder = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'err' | 'info'; text: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let buttons: any;
    (async () => {
      try {
        const cfg = await payFn<{ clientId: string | null }>();
        if (!cfg.clientId) throw new Error('Online payment isn\'t switched on yet. Please try again a little later.');
        const paypal = await loadPayPal(cfg.clientId, link.currency);
        if (cancelled || !holder.current) return;
        buttons = paypal.Buttons({
          style: { layout: 'vertical', shape: 'pill', color: link.brand === 'nuuke' ? 'white' : 'black', height: 48, label: 'pay', tagline: false },
          createOrder: async () => {
            setMsg(null);
            const out = await payFn<{ id: string }>({ action: 'create', code: link.code });
            return out.id;
          },
          onApprove: async (data: { orderID: string }, actions: { restart: () => Promise<void> }) => {
            setBusy(true);
            try {
              const out = await payFn<{ status: string }>({ action: 'capture', code: link.code, orderID: data.orderID });
              if (out.status === 'pending') setMsg({ tone: 'info', text: 'Payment sent. PayPal is still clearing it, and this page will update on its own.' });
              await onPaid();
            } catch (e) {
              const err = e as Error & { restart?: boolean };
              if (err.restart) {
                setMsg({ tone: 'err', text: err.message });
                return actions.restart();
              }
              setMsg({ tone: 'err', text: err.message });
            } finally {
              setBusy(false);
            }
          },
          onCancel: () => setMsg({ tone: 'info', text: 'Payment cancelled. You haven\'t been charged.' }),
          onError: (err: Error) => {
            setMsg({ tone: 'err', text: err?.message && !/^\s*$/.test(err.message) && err.message.length < 160 ? err.message : 'PayPal hit a problem. You haven\'t been charged. Please try again.' });
          },
        });
        if (!buttons.isEligible || buttons.isEligible()) await buttons.render(holder.current);
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) { setMsg({ tone: 'err', text: (e as Error).message }); setFailed(true); setReady(true); }
      }
    })();
    return () => { cancelled = true; buttons?.close?.(); };
  }, [link.code, link.currency, link.brand, onPaid]);

  return (
    <>
      <div className="pay-secure">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        Pay securely with PayPal or card
      </div>
      <div className={`pay-paypal${failed ? ' off' : ''}`} aria-busy={!ready || busy}>
        {!ready && (
          <div className="pay-paypal-loading"><div className="pay-skel" /><div className="pay-skel" /><div className="pay-skel" /></div>
        )}
        <div ref={holder} style={{ opacity: busy ? 0.4 : 1, pointerEvents: busy ? 'none' : undefined, transition: 'opacity .3s' }} />
      </div>
      {busy && <div className="pay-msg info">Confirming your payment…</div>}
      {msg && <div className={`pay-msg ${msg.tone}`}>{msg.text}</div>}
      <div className="pay-fine">No PayPal account needed: pay by debit or credit card.</div>
    </>
  );
}
