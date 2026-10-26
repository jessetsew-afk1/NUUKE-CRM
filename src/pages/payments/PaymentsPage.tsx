/**
 * Payments: make a PayPal payment link for a client, share it (copy, or email it
 * from the company's own address), and follow it to paid. Admins see every link
 * and decide who each paid link counts towards for commission.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowUpRight, Check, CircleDollarSign, Copy, CopyPlus, ExternalLink, Hourglass, Link2, Mail, Plus, RotateCcw,
  Search, Send, ShieldAlert, Trash2, X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { usePeople, useSettings } from '@/data/common';
import { useProjects } from '@/data/projects';
import {
  needsDecision, PAY_STATUS, paymentsFn, usePaymentLinks, usePaymentSetup, type PaymentLink, type PaymentLinkRow,
} from '@/data/payments';
import { day, dateTime, usd } from '@/lib/format';
import { rpc } from '@/lib/supabase';
import { BRANDS, money, payUrl, totals, type BrandKey, type Currency, type PayItem, type PublicLink } from '@/payments/brands';
import { InvoiceSheet, ReceiptSheet, useBrandFonts } from '@/pay/Invoice';
import {
  Button, Chip, Empty, IconButton, Input, PageHeader, Panel, Picker, Pill, Segmented, Sheet, Skeleton, Stat, Switch, Textarea,
} from '@/ui/kit';
import { useToast } from '@/ui/toast';

type StatusFilter = 'all' | 'open' | 'paid' | 'closed';

const sumBy = (rows: PaymentLink[], pick: (l: PaymentLink) => number) => {
  const by: Record<string, number> = {};
  for (const r of rows) by[r.currency] = (by[r.currency] ?? 0) + pick(r);
  const parts = Object.entries(by).filter(([, v]) => v > 0).map(([c, v]) => money(c, v));
  return parts.length ? parts.join(' · ') : money('USD', 0);
};

/** What a paid link counts for, in USD: the amount set by an admin, or before-tax × the rate used. */
const commissionAmount = (l: PaymentLink) =>
  l.commission_usd != null ? Number(l.commission_usd) : Math.round((Number(l.subtotal) - Number(l.discount)) * Number(l.commission_fx ?? 1) * 100) / 100;

export default function PaymentsPage() {
  const { profile } = useAuth();
  const admin = profile?.role === 'admin';
  const links = usePaymentLinks();
  const setup = usePaymentSetup();
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('link')) || null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [who, setWho] = useState<'all' | 'mine'>('all');
  const [brand, setBrand] = useState<'all' | BrandKey>('all');
  const [q, setQ] = useState('');

  const rows = links.data ?? [];
  const open = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('link', String(id)); else next.delete('link');
    setParams(next, { replace: true });
  };
  const current = rows.find((r) => r.id === openId) ?? null;

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) =>
      (status === 'all' || (status === 'open' ? ['open', 'pending'].includes(r.status) : status === 'paid' ? ['paid', 'refunded'].includes(r.status) : r.status === 'closed'))
      && (who === 'all' || r.created_by === profile?.id)
      && (brand === 'all' || r.brand === brand)
      && (!term || [r.number, r.client_name, r.client_company, r.client_email, r.purpose, r.maker?.full_name].some((v) => v?.toLowerCase().includes(term))));
  }, [rows, status, who, brand, q, profile?.id]);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const live = rows.filter((r) => r.mode !== 'sandbox');
  const waiting = rows.filter((r) => r.status === 'open' || r.status === 'pending');
  const paidMonth = live.filter((r) => r.status === 'paid' && (r.paid_at ?? '') >= monthStart);
  const decide = rows.filter((r) => needsDecision(r) && (admin || r.created_by === profile?.id));

  return (
    <div>
      <PageHeader
        eyebrow="Payments"
        title="Payment links"
        sub="Make a PayPal link for a client. They pay by PayPal or card, and the same link becomes their receipt."
        right={<Button variant="primary" size="lg" icon={<Plus className="size-4" />} onClick={() => setDraft(newDraft())}>New payment link</Button>}
      />

      <SetupBanner admin={admin} setup={setup.data} failed={setup.isError} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waiting to be paid" value={waiting.length} sub={sumBy(waiting, (r) => Number(r.total))} icon={<Hourglass className="size-4" />} accent="#5AB8FF" />
        <Stat label="Paid this month" value={paidMonth.length} sub={sumBy(paidMonth, (r) => Number(r.total) - Number(r.refunded_amount))} icon={<CircleDollarSign className="size-4" />} accent="#30C46C" />
        <Stat label="Keep or close?" value={decide.length} sub={decide.length ? 'Unpaid for 10+ days' : 'Nothing to decide'} icon={<AlertTriangle className="size-4" />} accent="#FF9F0A" />
        <Stat
          label={admin ? 'Counted for commission' : 'My paid links'}
          value={admin ? usd(paidMonth.filter((r) => r.deal_id).reduce((s, r) => s + commissionAmount(r), 0)) : rows.filter((r) => r.status === 'paid' && r.mode !== 'sandbox').length}
          sub={admin ? 'Paid this month, in USD before tax' : 'All time'}
          icon={<Check className="size-4" />}
          accent="#7C5CFF"
        />
      </div>

      {decide.length > 0 && (
        <Panel className="mb-6 border border-warn/30">
          <div className="mb-3 flex items-center gap-2 text-[15px] font-bold"><AlertTriangle className="size-4 text-warn" /> Still waiting: keep these open, or close them?</div>
          <div className="grid gap-2">
            {decide.map((l) => <DecideRow key={l.id} link={l} onOpen={() => open(l.id)} />)}
          </div>
        </Panel>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<StatusFilter>
          value={status}
          onChange={setStatus}
          options={[{ value: 'all', label: 'All' }, { value: 'open', label: 'Waiting' }, { value: 'paid', label: 'Paid' }, { value: 'closed', label: 'Closed' }]}
        />
        {admin && <Segmented value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, { value: 'mine', label: 'Mine' }]} />}
        <Chip active={brand === 'nuuke'} onClick={() => setBrand(brand === 'nuuke' ? 'all' : 'nuuke')} dot="#ff2e88">NUUKE</Chip>
        <Chip active={brand === 'marketing'} onClick={() => setBrand(brand === 'marketing' ? 'all' : 'marketing')} dot="#d64532">NUUKE.MARKETING</Chip>
        <div className="ml-auto w-full sm:w-72">
          <Input placeholder="Search client, invoice, purpose…" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
        </div>
      </div>

      <Panel padded={false} className="overflow-hidden">
        {links.isLoading ? (
          <div className="grid gap-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : shown.length === 0 ? (
          <Empty
            art={<div className="grid size-16 place-items-center rounded-3xl bg-iris/15 text-iris"><Link2 className="size-7" /></div>}
            title={rows.length ? 'Nothing matches' : 'No payment links yet'}
            body={rows.length ? 'Try another filter or search.' : 'Make your first link: pick the company, type the client, what it\'s for and the amount.'}
            action={!rows.length && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft(newDraft())}>New payment link</Button>}
          />
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {shown.map((l) => <LinkRow key={l.id} link={l} admin={admin} onOpen={() => open(l.id)} />)}
          </ul>
        )}
      </Panel>

      <NewLinkSheet
        draft={draft}
        setDraft={setDraft}
        emailReady={!!setup.data?.email}
        onCreated={(id) => { setDraft(null); open(id); }}
      />
      <LinkSheet
        link={current}
        admin={admin}
        emailReady={!!setup.data?.email}
        onClose={() => open(null)}
        onDuplicate={(l) => { open(null); setDraft(draftFrom(l)); }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */
function SetupBanner({ admin, setup, failed }: { admin: boolean; setup?: { mode: string; sandbox: boolean; live: boolean; webhook: boolean; email: boolean }; failed: boolean }) {
  if (failed) {
    return <Notice tone="warn">The payment server didn't answer. Links can still be made; check again in a minute.</Notice>;
  }
  if (!setup) return null;
  const keys = setup.mode === 'live' ? setup.live : setup.sandbox;
  if (!keys) {
    return (
      <Notice tone="warn">
        <b>PayPal isn't connected yet.</b> You can make and share links now; clients will be able to pay as soon as {admin ? 'the PayPal keys are added in Netlify (see the setup guide)' : 'an admin connects PayPal'}.
      </Notice>
    );
  }
  return (
    <>
      {setup.mode !== 'live' && (
        <Notice tone="info"><b>Test mode.</b> Payments use PayPal's sandbox, so no real money moves and nothing counts for commission.</Notice>
      )}
      {admin && !setup.email && (
        <Notice tone="neutral">Emailing invoices and receipts from billing@ needs the email key in Netlify. Until then, copy the link and send it yourself.</Notice>
      )}
    </>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'info' | 'neutral'; children: ReactNode }) {
  return (
    <div className={clsx('mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-[13.5px] leading-relaxed',
      tone === 'warn' ? 'border-warn/35 bg-warn/10' : tone === 'info' ? 'border-info/30 bg-info/10' : 'hairline fill')}>
      {tone === 'warn' ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" /> : <AlertTriangle className="text-2 mt-0.5 size-4 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

function BrandTile({ brand, className }: { brand: string; className?: string }) {
  return (
    <span className={clsx('grid size-10 shrink-0 place-items-center rounded-[13px] text-[13px] font-black',
      brand === 'nuuke' ? 'bg-[#050506] text-white ring-1 ring-white/10' : 'bg-[#f3efe8] text-[#111] ring-1 ring-black/10', className)}
      style={brand === 'nuuke' ? { backgroundImage: 'radial-gradient(circle at 20% 10%, rgba(255,46,136,.55), transparent 60%), radial-gradient(circle at 90% 90%, rgba(139,92,255,.6), transparent 60%)' } : undefined}>
      {brand === 'nuuke' ? 'N' : <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>M</span>}
    </span>
  );
}

function LinkRow({ link, admin, onOpen }: { link: PaymentLinkRow; admin: boolean; onOpen: () => void }) {
  const s = PAY_STATUS[link.status];
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--fill)] sm:px-5">
        <BrandTile brand={link.brand} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-semibold">{link.client_name}</span>
            {link.client_company && <span className="text-2 truncate text-[13px]">· {link.client_company}</span>}
          </div>
          <div className="text-2 truncate text-[13px]">
            <span className="font-mono text-[12px]">{link.number}</span> · {link.purpose}
            {admin && link.maker && <> · by {link.maker.full_name}</>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular font-bold">{money(link.currency, link.total)}</div>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            {link.mode === 'sandbox' && <Pill tone="warn">Test</Pill>}
            {link.disputed && <Pill tone="bad">Dispute</Pill>}
            {needsDecision(link) && <Pill tone="warn">Keep?</Pill>}
            <Pill tone={s.tone}>{s.label}</Pill>
          </div>
        </div>
        <div className="text-3 hidden w-24 shrink-0 text-right text-[12px] md:block">
          {link.paid_at ? <>Paid<br />{day(link.paid_at)}</> : <>Made<br />{day(link.created_at)}</>}
        </div>
      </button>
    </li>
  );
}

function useLinkActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast({ title: ok, tone: 'success' });
      await qc.invalidateQueries({ queryKey: ['payment-links'] });
    } catch (e) {
      toast({ title: 'That didn\'t work', body: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

function DecideRow({ link, onOpen }: { link: PaymentLinkRow; onOpen: () => void }) {
  const { busy, run } = useLinkActions();
  const days = Math.floor((Date.now() - new Date(link.created_at).getTime()) / 864e5);
  return (
    <div className="fill flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2.5">
      <BrandTile brand={link.brand} className="size-8 rounded-[10px] text-[11px]" />
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-[14px] font-semibold">{link.client_name} · {money(link.currency, link.total)}</div>
        <div className="text-2 truncate text-[12px]">{link.number} · unpaid for {days} days</div>
      </button>
      <div className="flex gap-2">
        <Button size="sm" variant="glass" loading={busy === 'keep'} onClick={() => run('keep', () => rpc('keep_payment_link', { p_id: link.id }), 'Kept open. We\'ll ask again in 10 days.')}>Keep open</Button>
        <Button size="sm" variant="ghost" loading={busy === 'close'} onClick={() => run('close', () => rpc('close_payment_link', { p_id: link.id }), 'Link closed')}>Close it</Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- new link */
interface Draft {
  brand: BrandKey;
  currency: Currency;
  client_name: string;
  client_email: string;
  client_company: string;
  purpose: string;
  items: { description: string; quantity: string; unit_price: string }[];
  discount: string;
  tax_label: string;
  tax_rate: string;
  due_on: string;
  note: string;
  project_id: string;
}
const newDraft = (): Draft => ({
  brand: 'nuuke', currency: 'USD', client_name: '', client_email: '', client_company: '', purpose: '',
  items: [{ description: '', quantity: '1', unit_price: '' }], discount: '', tax_label: 'Tax', tax_rate: '', due_on: '', note: '', project_id: '',
});
const draftFrom = (l: PaymentLink): Draft => ({
  brand: l.brand as BrandKey, currency: l.currency as Currency, client_name: l.client_name, client_email: l.client_email ?? '',
  client_company: l.client_company ?? '', purpose: l.purpose,
  items: (l.items as unknown as PayItem[]).map((i) => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price) })),
  discount: Number(l.discount) ? String(l.discount) : '', tax_label: l.tax_label, tax_rate: Number(l.tax_rate) ? String(l.tax_rate) : '',
  due_on: '', note: l.note ?? '', project_id: l.project_id ? String(l.project_id) : '',
});
const itemsOf = (d: Draft): PayItem[] =>
  d.items.map((i) => ({ description: i.description.trim(), quantity: Math.max(0, Math.floor(Number(i.quantity) || 0)), unit_price: Math.round((Number(i.unit_price) || 0) * 100) / 100 }));

function NewLinkSheet({ draft, setDraft, emailReady, onCreated }: {
  draft: Draft | null; setDraft: (d: Draft | null) => void; emailReady: boolean; onCreated: (id: number) => void;
}) {
  const { profile } = useAuth();
  const projects = useProjects(!!draft);
  const toast = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<PaymentLink | null>(null);
  useBrandFonts();

  const d = draft ?? newDraft();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...d, [k]: v });
  const setItem = (i: number, k: keyof Draft['items'][number], v: string) => set('items', d.items.map((it, n) => (n === i ? { ...it, [k]: v } : it)));
  const t = totals(itemsOf(d), Number(d.discount) || 0, Number(d.tax_rate) || 0);
  const problem = !d.client_name.trim() ? 'Type the client\'s name'
    : !d.purpose.trim() ? 'Say what the payment is for'
      : d.items.some((i) => !i.description.trim()) ? 'Every line needs a description'
        : itemsOf(d).some((i) => i.quantity < 1) ? 'Quantities are whole numbers from 1'
          : t.total <= 0 ? 'The total must be more than zero'
            : (Number(d.discount) || 0) > t.subtotal ? 'The discount is more than the lines add up to'
              : d.client_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.client_email.trim()) ? 'Check the client\'s email' : null;

  const preview: PublicLink = {
    code: 'preview', brand: d.brand, number: `${d.brand === 'marketing' ? 'NM' : 'NK'}-${new Date().getFullYear()}-····`, status: 'open', mode: null,
    client_name: d.client_name || 'Client name', client_company: d.client_company || null, client_email: d.client_email || null,
    purpose: d.purpose || 'What the payment is for', items: itemsOf(d).map((i) => ({ ...i, description: i.description || 'Line description' })),
    currency: d.currency, discount: t.discount, tax_label: d.tax_label || 'Tax', tax_rate: Number(d.tax_rate) || 0,
    subtotal: t.subtotal, tax_amount: t.tax, total: t.total, note: d.note || null, due_on: d.due_on || null,
    created_at: new Date().toISOString(), paid_at: null, paid_amount: null, payer_name: null, reference: null, refunded_amount: 0,
    prepared_by: profile?.full_name ?? null,
  };

  const create = async () => {
    if (problem) return;
    setSaving(true);
    try {
      const row = await rpc<PaymentLink>('create_payment_link', {
        p: {
          brand: d.brand, currency: d.currency, client_name: d.client_name, client_email: d.client_email, client_company: d.client_company,
          purpose: d.purpose, items: itemsOf(d), discount: Number(d.discount) || 0, tax_label: d.tax_label, tax_rate: Number(d.tax_rate) || 0,
          due_on: d.due_on || null, note: d.note, project_id: d.project_id || null,
        } as never,
      });
      await qc.invalidateQueries({ queryKey: ['payment-links'] });
      setDone(row);
    } catch (e) {
      toast({ title: 'Couldn\'t make the link', body: (e as Error).message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };
  const close = () => { setDone(null); setDraft(null); };

  return (
    <Sheet
      open={!!draft}
      onClose={close}
      width={done ? 560 : 1180}
      title={done ? 'Your link is ready' : 'New payment link'}
      footer={!done && (
        <>
          {problem && <span className="text-3 mr-auto hidden text-[13px] sm:block">{problem}</span>}
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!!problem} onClick={create} icon={<Link2 className="size-4" />}>
            Create link · {money(d.currency, t.total)}
          </Button>
        </>
      )}
    >
      {done ? (
        <Created link={done} emailReady={emailReady} onOpen={() => { const id = done.id; setDone(null); onCreated(id); }} onAnother={() => { setDone(null); setDraft(newDraft()); }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)]">
          <div className="grid content-start gap-5">
            <div>
              <div className="label mb-2">Invoice from</div>
              <div className="grid grid-cols-2 gap-3">
                {(['nuuke', 'marketing'] as BrandKey[]).map((b) => (
                  <motion.button
                    key={b}
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => set('brand', b)}
                    className={clsx('relative flex h-[86px] flex-col justify-between overflow-hidden rounded-2xl p-3.5 text-left ring-2 transition-shadow',
                      b === 'nuuke' ? 'bg-[#050506] text-white' : 'bg-[#f3efe8] text-[#111]',
                      d.brand === b ? 'ring-iris shadow-[0_10px_30px_-12px_rgba(124,92,255,.8)]' : 'ring-transparent opacity-80 hover:opacity-100')}
                    style={b === 'nuuke' ? { backgroundImage: 'radial-gradient(circle at 0% 0%, rgba(255,46,136,.35), transparent 55%), radial-gradient(circle at 100% 100%, rgba(139,92,255,.45), transparent 55%)' } : { backgroundImage: 'radial-gradient(circle at 100% 0%, #efdedb, transparent 60%)' }}
                  >
                    <img src={b === 'nuuke' ? '/brand/nuuke-white.png' : '/brand/nuuke-black.png'} alt="" className="h-[18px] w-auto self-start" />
                    <span className="text-[12px] font-bold tracking-[0.14em]">{BRANDS[b].name}</span>
                    {d.brand === b && <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-iris text-white"><Check className="size-3.5" /></span>}
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Client name" value={d.client_name} onChange={(e) => set('client_name', e.target.value)} placeholder="Who is paying" autoFocus />
              <Input label="Client email" hint="for the invoice & receipt" type="email" value={d.client_email} onChange={(e) => set('client_email', e.target.value)} placeholder="name@company.com" />
              <Input label="Client's business" hint="optional" value={d.client_company} onChange={(e) => set('client_company', e.target.value)} />
              <div>
                <div className="label mb-2">Currency</div>
                <Segmented<Currency> value={d.currency} onChange={(v) => setDraft({ ...d, currency: v, tax_label: d.tax_label === 'Tax' && v === 'GBP' ? 'VAT' : d.tax_label === 'VAT' && v === 'USD' ? 'Tax' : d.tax_label })}
                  options={[{ value: 'USD', label: '$ USD' }, { value: 'GBP', label: '£ GBP' }]} />
              </div>
            </div>

            <Input label="What it's for" value={d.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="e.g. Website build, first half" maxLength={200} />

            <div>
              <div className="label mb-2 flex items-center justify-between"><span>Lines</span><span className="text-3 font-medium">quantity × price</span></div>
              <div className="grid gap-2">
                <AnimatePresence initial={false}>
                  {d.items.map((it, i) => (
                    <motion.div key={i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-[minmax(0,1fr)_64px_110px_36px] items-center gap-2">
                      <input className="field" placeholder="Description" value={it.description} maxLength={127} onChange={(e) => setItem(i, 'description', e.target.value)} />
                      <input className="field tabular text-center" inputMode="numeric" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value.replace(/[^\d]/g, ''))} aria-label="Quantity" />
                      <input className="field tabular" inputMode="decimal" placeholder="0.00" value={it.unit_price} onChange={(e) => setItem(i, 'unit_price', e.target.value.replace(/[^\d.]/g, ''))} aria-label="Price" />
                      <IconButton label="Remove line" disabled={d.items.length === 1} onClick={() => set('items', d.items.filter((_, n) => n !== i))} className="size-9 disabled:opacity-30">
                        <Trash2 className="size-4" />
                      </IconButton>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <Button size="sm" variant="ghost" className="mt-2" icon={<Plus className="size-4" />} disabled={d.items.length >= 30}
                onClick={() => set('items', [...d.items, { description: '', quantity: '1', unit_price: '' }])}>Add line</Button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Input label="Discount" inputMode="decimal" placeholder="0.00" value={d.discount} onChange={(e) => set('discount', e.target.value.replace(/[^\d.]/g, ''))} />
              <Input label="Tax name" value={d.tax_label} onChange={(e) => set('tax_label', e.target.value)} maxLength={30} />
              <Input label="Tax %" inputMode="decimal" placeholder="0" value={d.tax_rate} onChange={(e) => set('tax_rate', e.target.value.replace(/[^\d.]/g, ''))} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Due date" hint="optional" type="date" value={d.due_on} onChange={(e) => set('due_on', e.target.value)} />
              <Picker
                label="Project"
                value={d.project_id || 'none'}
                onChange={(v) => set('project_id', v === 'none' ? '' : v)}
                options={[{ value: 'none', label: 'Not tied to a project' }, ...(projects.data ?? []).filter((p) => !p.archived_at).map((p) => ({ value: String(p.id), label: p.name, hint: p.client_name ?? undefined }))]}
              />
            </div>
            <Textarea label="Note to the client" hint="optional" rows={3} value={d.note} onChange={(e) => set('note', e.target.value)} placeholder="Shown on the invoice" />

            <div className="fill rounded-2xl px-4 py-3 text-[13px]">
              <div className="flex justify-between"><span className="text-2">Subtotal</span><span className="tabular">{money(d.currency, t.subtotal)}</span></div>
              {t.discount > 0 && <div className="flex justify-between"><span className="text-2">Discount</span><span className="tabular">−{money(d.currency, t.discount)}</span></div>}
              {t.tax > 0 && <div className="flex justify-between"><span className="text-2">{d.tax_label || 'Tax'} ({Number(d.tax_rate)}%)</span><span className="tabular">{money(d.currency, t.tax)}</span></div>}
              <div className="mt-1 flex justify-between border-t border-[var(--hairline)] pt-1.5 text-[15px] font-bold"><span>Client pays</span><span className="tabular">{money(d.currency, t.total)}</span></div>
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="sticky top-0">
              <div className="text-3 mb-2 text-[12px] font-bold uppercase tracking-wider">What the client sees</div>
              <div className="pay pay-preview" data-brand={d.brand}>
                <div className="pay-wrap"><InvoiceSheet link={preview} animateIn={false} /></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Created({ link, emailReady, onOpen, onAnother }: { link: PaymentLink; emailReady: boolean; onOpen: () => void; onAnother: () => void }) {
  const url = payUrl(link.brand as BrandKey, link.code);
  return (
    <div className="grid gap-5 pt-2 text-center">
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="mx-auto grid size-16 place-items-center rounded-full bg-ok/15 text-ok">
        <Check className="size-8" strokeWidth={2.6} />
      </motion.div>
      <div>
        <div className="font-mono text-[13px] text-iris">{link.number}</div>
        <div className="mt-1 text-[28px] font-extrabold">{money(link.currency, link.total)}</div>
        <div className="text-2 text-sm">{link.client_name} · {link.purpose}</div>
      </div>
      <ShareBox link={link} url={url} emailReady={emailReady} />
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="ghost" onClick={onAnother} icon={<Plus className="size-4" />}>Make another</Button>
        <Button variant="glass" onClick={onOpen} iconRight={<ArrowUpRight className="size-4" />}>See the link's page</Button>
      </div>
    </div>
  );
}

function ShareBox({ link, url, emailReady }: { link: PaymentLink; url: string; emailReady: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [to, setTo] = useState(link.client_email ?? '');
  const [sending, setSending] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: 'Copy it from the box', tone: 'info' });
    }
  };
  const send = async () => {
    setSending(true);
    try {
      const out = await paymentsFn<{ to: string; from: string }>({ action: 'email_invoice', id: link.id, to });
      toast({ title: `Invoice emailed to ${out.to}`, body: `Sent from ${out.from}`, tone: 'success' });
      await qc.invalidateQueries({ queryKey: ['payment-links'] });
    } catch (e) {
      toast({ title: 'Email not sent', body: (e as Error).message, tone: 'danger' });
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="grid gap-3 text-left">
      <div className="fill flex items-center gap-2 rounded-2xl p-1.5 pl-4">
        <span className="min-w-0 flex-1 select-all truncate font-mono text-[13px]">{url}</span>
        <Button size="sm" variant={copied ? 'success' : 'primary'} onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <a href={url} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-xl hover:bg-[var(--fill-2)]" title="Open as the client sees it">
          <ExternalLink className="size-4" />
        </a>
      </div>
      {link.status === 'open' && (
        <div className="flex items-end gap-2">
          <Input className="flex-1" label={`Email it from ${BRANDS[link.brand as BrandKey].sender}`} type="email"
            value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@company.com" />
          <Button variant="glass" loading={sending} disabled={!emailReady || !to.trim()} onClick={send} icon={<Send className="size-4" />}>
            {link.emailed_at ? 'Send again' : 'Send'}
          </Button>
        </div>
      )}
      {link.status === 'open' && !emailReady && <p className="text-3 text-[12px]">Sending from our address switches on once email is set up. For now, copy the link.</p>}
      {link.emailed_at && <p className="text-3 text-[12px]">Last emailed {dateTime(link.emailed_at)}.</p>}
    </div>
  );
}

/* ------------------------------------------------------------ one link */
function LinkSheet({ link, admin, emailReady, onClose, onDuplicate }: {
  link: PaymentLinkRow | null; admin: boolean; emailReady: boolean; onClose: () => void; onDuplicate: (l: PaymentLink) => void;
}) {
  const { profile } = useAuth();
  const { busy, run } = useLinkActions();
  const toast = useToast();
  useBrandFonts();
  const [editing, setEditing] = useState(false);
  if (!link) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const mine = link.created_by === profile?.id;
  const canAct = mine || admin;
  const s = PAY_STATUS[link.status];
  const url = payUrl(link.brand as BrandKey, link.code);
  const asPublic: PublicLink = {
    code: link.code, brand: link.brand as BrandKey, number: link.number, status: link.status as PublicLink['status'], mode: link.mode as PublicLink['mode'],
    client_name: link.client_name, client_company: link.client_company, client_email: link.client_email, purpose: link.purpose,
    items: link.items as unknown as PayItem[], currency: link.currency as Currency, discount: Number(link.discount), tax_label: link.tax_label,
    tax_rate: Number(link.tax_rate), subtotal: Number(link.subtotal), tax_amount: Number(link.tax_amount), total: Number(link.total), note: link.note,
    due_on: link.due_on, created_at: link.created_at, paid_at: link.paid_at, paid_amount: link.paid_amount, payer_name: link.payer_name,
    reference: link.paypal_capture_id, refunded_amount: Number(link.refunded_amount), prepared_by: link.maker?.full_name ?? null,
  };

  return (
    <Sheet
      open
      onClose={() => { setEditing(false); onClose(); }}
      width={1100}
      title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[15px]">{link.number}</span><Pill tone={s.tone}>{s.label}</Pill>{link.mode === 'sandbox' && <Pill tone="warn">Test payment</Pill>}{link.disputed && <Pill tone="bad">Dispute open</Pill>}</span>}
      footer={canAct && (
        <>
          <Button variant="ghost" className="mr-auto" icon={<CopyPlus className="size-4" />} onClick={() => onDuplicate(link)}>Duplicate</Button>
          {link.status === 'paid' && (
            <Button variant="glass" icon={<Mail className="size-4" />} loading={busy === 'receipt'} disabled={!emailReady}
              onClick={() => run('receipt', () => paymentsFn({ action: 'email_receipt', id: link.id }), 'Receipt sent')}>Email receipt</Button>
          )}
          {link.status === 'open' && (
            <Button variant="glass" icon={<X className="size-4" />} loading={busy === 'close'}
              onClick={() => run('close', () => rpc('close_payment_link', { p_id: link.id }), 'Link closed: the client can no longer pay it')}>Close link</Button>
          )}
          {link.status === 'closed' && (
            <Button variant="glass" icon={<RotateCcw className="size-4" />} loading={busy === 'keep'}
              onClick={() => run('keep', () => rpc('keep_payment_link', { p_id: link.id }), 'Link reopened')}>Reopen</Button>
          )}
        </>
      )}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
        <div className="grid content-start gap-5">
          {needsDecision(link) && canAct && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warn/35 bg-warn/10 px-4 py-3">
              <AlertTriangle className="size-5 text-warn" />
              <div className="min-w-0 flex-1 text-[14px] font-semibold">Still unpaid. Keep it open, or close it?</div>
              <Button size="sm" variant="glass" loading={busy === 'keep'} onClick={() => run('keep', () => rpc('keep_payment_link', { p_id: link.id }), 'Kept open')}>Keep open</Button>
              <Button size="sm" variant="ghost" loading={busy === 'close'} onClick={() => run('close', () => rpc('close_payment_link', { p_id: link.id }), 'Link closed')}>Close it</Button>
            </div>
          )}

          <ShareBox key={`share-${link.id}`} link={link} url={url} emailReady={emailReady} />

          {link.status === 'open' && canAct && (
            editing
              ? <EditWords link={link} onDone={() => setEditing(false)} />
              : <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setEditing(true)}>Fix the client's details or note</Button>
          )}

          <Panel strong className="!p-4">
            <div className="text-3 mb-3 text-[13px] font-bold uppercase tracking-wider">History</div>
            <ol className="grid gap-2.5 text-[13.5px]">
              <Step on>Made by {link.maker?.full_name ?? 'someone who has left'} · {dateTime(link.created_at)}</Step>
              {link.emailed_at && <Step on>Emailed to the client · {dateTime(link.emailed_at)}</Step>}
              {link.asked_at && <Step on warn>Asked "keep or close?" · {dateTime(link.asked_at)}</Step>}
              {link.kept_at && <Step on>Kept open · {dateTime(link.kept_at)}</Step>}
              {link.closed_at && <Step on>Closed · {dateTime(link.closed_at)}</Step>}
              {link.status === 'pending' && <Step on warn>Paid; PayPal is still clearing it</Step>}
              {link.paid_at && (
                <Step on good>
                  Paid {money(link.currency, link.paid_amount ?? link.total)}{link.payer_name ? ` by ${link.payer_name}` : ''} · {dateTime(link.paid_at)}
                  {admin && link.paypal_fee != null && <span className="text-3"> · PayPal fee {money(link.currency, link.paypal_fee)}, you get {money(link.currency, link.net_amount)}</span>}
                </Step>
              )}
              {link.paypal_capture_id && <Step on>PayPal reference <span className="font-mono">{link.paypal_capture_id}</span>
                <button className="text-3 ml-2 underline" onClick={() => { void navigator.clipboard.writeText(link.paypal_capture_id!); toast({ title: 'Copied', tone: 'success' }); }}>copy</button></Step>}
              {(link.refunds as { amount: number; at: string; reason?: string }[] | null)?.map((r, i) => (
                <Step key={i} on bad>Refunded {money(link.currency, r.amount)} · {dateTime(r.at)}{r.reason ? ` · ${r.reason}` : ''}</Step>
              ))}
              {link.status === 'open' && <Step>Next "keep or close?" check {day(link.next_check_at)}</Step>}
            </ol>
          </Panel>

          <Commission key={`comm-${link.id}`} link={link} admin={admin} />
        </div>

        <div>
          <div className="text-3 mb-2 text-[12px] font-bold uppercase tracking-wider">What the client sees</div>
          <div className="pay pay-preview" data-brand={link.brand}>
            <div className="pay-wrap">
              {link.status === 'paid' || link.status === 'refunded' ? <ReceiptSheet link={asPublic} /> : <InvoiceSheet link={asPublic} animateIn={false} />}
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Step({ children, on, good, warn, bad }: { children: ReactNode; on?: boolean; good?: boolean; warn?: boolean; bad?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', good ? 'bg-ok' : bad ? 'bg-bad' : warn ? 'bg-warn' : on ? 'bg-iris' : 'bg-[var(--fill-2)]')} />
      <span className={clsx(!on && 'text-3')}>{children}</span>
    </li>
  );
}

function EditWords({ link, onDone }: { link: PaymentLink; onDone: () => void }) {
  const { busy, run } = useLinkActions();
  const [f, setF] = useState({
    client_name: link.client_name, client_email: link.client_email ?? '', client_company: link.client_company ?? '',
    purpose: link.purpose, note: link.note ?? '', due_on: link.due_on ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Panel strong className="grid gap-3 !p-4">
      <div className="text-2 text-[13px]">The amounts stay as they are. To change them, close this link and duplicate it.</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Client name" value={f.client_name} onChange={set('client_name')} />
        <Input label="Client email" type="email" value={f.client_email} onChange={set('client_email')} />
        <Input label="Client's business" value={f.client_company} onChange={set('client_company')} />
        <Input label="Due date" type="date" value={f.due_on} onChange={set('due_on')} />
      </div>
      <Input label="What it's for" value={f.purpose} onChange={set('purpose')} maxLength={200} />
      <Textarea label="Note to the client" rows={2} value={f.note} onChange={set('note')} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" loading={busy === 'save'} onClick={() => run('save', async () => { await rpc('update_payment_link', { p_id: link.id, p: f as never }); onDone(); }, 'Saved')}>Save</Button>
      </div>
    </Panel>
  );
}

function Commission({ link, admin }: { link: PaymentLinkRow; admin: boolean }) {
  const people = usePeople();
  const settings = useSettings();
  const { busy, run } = useLinkActions();
  const fx = link.currency === 'GBP' ? Number(link.commission_fx ?? settings.data?.gbp_to_usd ?? 1.27) : 1;
  const auto = Math.round((Number(link.subtotal) - Number(link.discount)) * fx * 100) / 100;
  const [counts, setCounts] = useState(link.counts_for_commission);
  const [owner, setOwner] = useState(link.commission_owner ?? '');
  const [amount, setAmount] = useState(link.commission_usd != null ? String(link.commission_usd) : '');
  const amountNow = link.commission_usd != null ? Number(link.commission_usd) : auto;
  const changed = counts !== link.counts_for_commission || owner !== (link.commission_owner ?? '') || amount !== (link.commission_usd != null ? String(link.commission_usd) : '');

  const summary = link.mode === 'sandbox'
    ? 'Test payment: never counts for commission.'
    : !link.counts_for_commission || !link.commission_owner
      ? 'Doesn\'t count for commission.'
      : `${link.status === 'paid' ? 'Counts' : 'Will count'} for ${link.owner?.full_name ?? 'them'} as ${usd(amountNow)}${link.currency === 'GBP' ? ` (at $${fx} per £1)` : ''}, before tax.`;

  return (
    <Panel strong className="!p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-3 text-[13px] font-bold uppercase tracking-wider">Commission</div>
        {link.deal_id && <Pill tone="good">Won deal #{link.deal_id}</Pill>}
      </div>
      <p className="text-[14px]">{summary}</p>
      {admin && link.mode !== 'sandbox' && (
        <div className="mt-4 grid gap-3">
          <Switch checked={counts} onChange={setCounts} label="Counts for commission" />
          {counts && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Picker
                label="Credit goes to"
                value={owner || null}
                onChange={setOwner}
                placeholder="Choose someone"
                options={(people.data ?? []).filter((p) => p.role !== 'client' && p.is_active).map((p) => ({ value: p.id, label: p.full_name, hint: p.role }))}
              />
              <Input label="Amount (USD)" hint={`automatic: ${usd(auto)}`} inputMode="decimal" placeholder={String(auto)} value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="primary" disabled={!changed || (counts && !owner)} loading={busy === 'comm'}
              onClick={() => run('comm', () => rpc('set_payment_commission', { p_id: link.id, p_counts: counts, p_owner: (counts ? owner : link.commission_owner) as string, p_amount_usd: amount === '' ? (null as unknown as number) : Number(amount) }), 'Commission updated')}>
              Save commission
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
