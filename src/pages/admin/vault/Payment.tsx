import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, Landmark, Plus, Trash2, X } from 'lucide-react';
import { useVaultMutations } from '@/data/vault';
import { computePayment, fmtValue, type PayDeduction, type PaymentDetails, type PayRoute, type VPayment } from '@/lib/finance';
import { Button, Input, Picker, Sheet, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { monthOptions, thisMonth, useV } from './parts';

/* What was used last time, so the next payment is quick (this browser only). */
const LAST = 'nuuke.vault.lastPayment';
type Last = Pick<PaymentDetails, 'route' | 'usd_gbp' | 'gbp_pkr' | 'usd_pkr' | 'bank_fee_pkr' | 'deductions'>;
const readLast = (): Partial<Last> => { try { return JSON.parse(localStorage.getItem(LAST) ?? '{}'); } catch { return {}; } };
const uid = () => Math.random().toString(36).slice(2, 9);

export interface PaymentDraft { payment?: VPayment; month?: string; investor_id?: number | null }

const ROUTES: { value: PayRoute; label: string; hint: string }[] = [
  { value: 'USD>GBP>PKR', label: '$ → £ → Rs', hint: 'Paid in dollars, PayPal turns it into pounds, the bank into rupees' },
  { value: 'USD>PKR', label: '$ → Rs', hint: 'Dollars straight into rupees' },
  { value: 'GBP>PKR', label: '£ → Rs', hint: 'Paid in pounds' },
];

export function PaymentEditor({ draft, onClose }: { draft: PaymentDraft | null; onClose: () => void }) {
  const { data, knownMonths } = useV();
  const { savePayment, remove } = useVaultMutations();
  const toast = useToast();
  const ref = Number(data.settings.pkr_rate) || 280;
  const feeCats = data.categories.filter((c) => (c.kind === 'direct_cost' || c.kind === 'tax' || c.kind === 'expense') && !c.archived);
  const catId = (kind: string, name: string) => data.categories.find((c) => c.kind === kind && c.name === name)?.id ?? null;

  const [d, setD] = useState<PaymentDetails | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [inv, setInv] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!draft) return;
    const p = draft.payment;
    setMonth(p?.month ?? draft.month ?? thisMonth());
    setInv(p ? p.investor_id : draft.investor_id ?? null);
    if (p) { setD({ ...p.details, received_pkr: p.details.received_pkr ?? null }); return; }
    const last = readLast();
    setD({
      client: '', label: '', revenue_category_id: catId('revenue', 'Website projects'), currency: 'USD', gross: 0,
      deductions: (last.deductions?.length ? last.deductions.map((x) => ({ ...x, id: uid() })) : [
        { id: uid(), name: 'PayPal fee', kind: 'direct_cost', category_id: catId('direct_cost', 'Payment processing fees (PayPal)'), pct: 0, fixed: 0 },
        { id: uid(), name: 'Merchant fee', kind: 'direct_cost', category_id: catId('direct_cost', 'Merchant & gateway fees'), pct: 0, fixed: 0 },
        { id: uid(), name: 'Tax', kind: 'tax', category_id: catId('tax', 'Withholding tax'), pct: 0, fixed: 0 },
      ]) as PayDeduction[],
      route: last.route ?? 'USD>GBP>PKR', usd_gbp: last.usd_gbp ?? 0, gbp_pkr: last.gbp_pkr ?? 0, usd_pkr: last.usd_pkr ?? 0,
      bank_fee_pkr: last.bank_fee_pkr ?? 0, received_pkr: null, ref_usd_pkr: ref, note: '',
    });
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = useMemo(() => (d ? computePayment(d, data.categories) : null), [d, data.categories]);
  if (!d) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const set = <K extends keyof PaymentDetails>(k: K, v: PaymentDetails[K]) => setD((x) => (x ? { ...x, [k]: v } : x));
  const setDed = (id: string, patch: Partial<PayDeduction>) => set('deductions', d.deductions.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const num = (v: string) => { const n = Number(v.replace(/[, ]/g, '')); return Number.isFinite(n) ? n : 0; };
  const sym = d.route === 'GBP>PKR' ? '£' : '$';

  const submit = async () => {
    if (!res?.ok) { toast({ title: res?.error ?? 'Check the payment', tone: 'danger' }); return; }
    setBusy(true);
    try {
      const details = { ...d, currency: d.route === 'GBP>PKR' ? 'GBP' : 'USD' } as PaymentDetails;
      await savePayment({ id: draft?.payment?.id, month, investor_id: inv, client: d.client, details, entries: res.entries });
      try { localStorage.setItem(LAST, JSON.stringify({ route: d.route, usd_gbp: d.usd_gbp, gbp_pkr: d.gbp_pkr, usd_pkr: d.usd_pkr, bank_fee_pkr: d.bank_fee_pkr, deductions: d.deductions })); } catch { /* */ }
      toast({ title: draft?.payment ? 'Payment updated' : 'Payment logged', body: `Rs ${Math.round(res.landedPkr).toLocaleString()} landed · ${res.entries.length} lines in the books`, tone: 'success' });
      onClose();
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };

  return (
    <Sheet open={!!draft} onClose={onClose} width={1000} title={draft?.payment ? 'Edit client payment' : 'Log a client payment'}
      footer={<div className="flex w-full items-center gap-2">
        {draft?.payment && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => {
          if (!confirm('Delete this payment and all its lines?')) return; await remove('payment', draft.payment!.id); onClose();
        }}>Delete</Button>}
        <div className="flex-1" />
        <Button variant="glass" onClick={onClose}>Cancel</Button>
        <Button variant="iris" loading={busy} disabled={!res?.ok} onClick={() => void submit()}>{draft?.payment ? 'Save payment' : 'Log payment'}</Button>
      </div>}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* ---------------------------------------------------------- the form */}
        <div className="space-y-5">
          <Section n={1} title="Who paid">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Client" placeholder="e.g. Acme Corp" value={d.client} onChange={(e) => set('client', e.target.value)} autoFocus={!draft?.payment} />
              <Input label="For (optional)" placeholder="e.g. Website deposit" value={d.label} onChange={(e) => set('label', e.target.value)} />
              <Picker label="Revenue type" value={d.revenue_category_id ? String(d.revenue_category_id) : '__none'} onChange={(v) => set('revenue_category_id', v === '__none' ? null : Number(v))}
                options={[{ value: '__none', label: 'No type' }, ...data.categories.filter((c) => c.kind === 'revenue' && !c.archived).map((c) => ({ value: String(c.id), label: c.name }))]} />
              <Picker label="Month" value={month} onChange={setMonth} options={monthOptions(knownMonths)} />
              <Picker className="sm:col-span-2" label="Belongs to" value={inv ? String(inv) : 'company'} onChange={(v) => setInv(v === 'company' ? null : Number(v))}
                options={[{ value: 'company', label: 'The company (no investor)' }, ...data.investors.map((i) => ({ value: String(i.id), label: `${i.name}'s team` }))]} />
            </div>
          </Section>

          <Section n={2} title="How the money travelled">
            <div className="grid grid-cols-3 gap-2">
              {ROUTES.map((r) => (
                <button key={r.value} type="button" title={r.hint} onClick={() => set('route', r.value)}
                  className={clsx('rounded-2xl px-3 py-2.5 text-[14px] font-extrabold transition-all',
                    d.route === r.value ? 'bg-[linear-gradient(135deg,#7C5CFF,#5AB8FF)] text-white shadow-[0_8px_24px_-10px_rgba(124,92,255,.9)]' : 'fill text-2 hover:text-[color:var(--text)]')}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Input label={`Client paid (${sym})`} inputMode="decimal" placeholder="500" value={d.gross || ''} onChange={(e) => set('gross', num(e.target.value))}
                leading={<span className="text-[13px] font-bold">{sym}</span>} />
            </div>
          </Section>

          <Section n={3} title="Taken off before it reached you" sub="Each can be a % of the payment, a fixed amount, or both">
            <div className="space-y-2">
              {d.deductions.map((x) => (
                <div key={x.id} className="fill grid grid-cols-[1fr_auto] gap-2 rounded-2xl p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_80px_80px_36px]">
                  <input value={x.name} onChange={(e) => setDed(x.id, { name: e.target.value })} placeholder="e.g. PayPal fee"
                    className="h-9 rounded-xl bg-[var(--glass-strong)] px-3 text-[13.5px] font-semibold outline-none focus:ring-2 focus:ring-iris" />
                  <button type="button" aria-label="Remove" onClick={() => set('deductions', d.deductions.filter((y) => y.id !== x.id))} className="text-3 grid size-9 place-items-center rounded-xl hover:text-bad sm:order-last"><X className="size-4" /></button>
                  <Picker className="col-span-2 sm:col-span-1" value={x.category_id ? `${x.kind}:${x.category_id}` : `${x.kind}:`} onChange={(v) => { const [k, id] = v.split(':'); setDed(x.id, { kind: k as PayDeduction['kind'], category_id: id ? Number(id) : null }); }}
                    options={[
                      { value: 'direct_cost:', label: 'Fee (no type)' }, { value: 'tax:', label: 'Tax (no type)' },
                      ...feeCats.map((c) => ({ value: `${c.kind}:${c.id}`, label: `${c.kind === 'tax' ? 'Tax' : c.kind === 'expense' ? 'Expense' : 'Fee'} · ${c.name}` })),
                    ]} />
                  <MiniNum value={x.pct} suffix="%" onChange={(v) => setDed(x.id, { pct: v })} />
                  <MiniNum value={x.fixed} prefix={sym} onChange={(v) => setDed(x.id, { fixed: v })} />
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set('deductions', [...d.deductions, { id: uid(), name: '', kind: 'direct_cost', category_id: null, pct: 0, fixed: 0 }])}>Add a fee or tax</Button>
            </div>
          </Section>

          <Section n={4} title="Conversion rates" sub="Type the rates you actually got">
            <div className="grid gap-3 sm:grid-cols-2">
              {d.route === 'USD>GBP>PKR' && <Input label="£ per $1" inputMode="decimal" placeholder="0.76" value={d.usd_gbp || ''} onChange={(e) => set('usd_gbp', num(e.target.value))} />}
              {d.route !== 'USD>PKR' && <Input label="Rs per £1" inputMode="decimal" placeholder="360" value={d.gbp_pkr || ''} onChange={(e) => set('gbp_pkr', num(e.target.value))} />}
              {d.route === 'USD>PKR' && <Input label="Rs per $1" inputMode="decimal" placeholder="278" value={d.usd_pkr || ''} onChange={(e) => set('usd_pkr', num(e.target.value))} />}
              <Input label="Bank charges (Rs)" inputMode="decimal" placeholder="0" value={d.bank_fee_pkr || ''} onChange={(e) => set('bank_fee_pkr', num(e.target.value))} />
              <Input label="Actually landed (Rs, optional)" inputMode="decimal" placeholder="from your bank statement" value={d.received_pkr ?? ''}
                onChange={(e) => set('received_pkr', e.target.value.trim() ? num(e.target.value) : null)} hint="If it differs, the gap counts as conversion cost." />
              <Input label="Market rate (Rs per $1)" inputMode="decimal" value={d.ref_usd_pkr || ''} onChange={(e) => set('ref_usd_pkr', num(e.target.value))}
                hint="What $1 is really worth today: used to measure what the conversion cost you." />
            </div>
          </Section>
          <Textarea label="Note (optional)" rows={2} value={d.note} onChange={(e) => set('note', e.target.value)} />
        </div>

        {/* ---------------------------------------------------- the journey */}
        <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <Journey res={res} />
        </div>
      </div>
    </Sheet>
  );
}

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="grid size-6 place-items-center rounded-full bg-iris text-[12px] font-extrabold text-white">{n}</span>
        <div><div className="text-[14.5px] font-extrabold">{title}</div>{sub && <div className="text-3 text-[12px]">{sub}</div>}</div>
      </div>
      {children}
    </section>
  );
}

function MiniNum({ value, onChange, prefix, suffix }: { value: number; onChange: (v: number) => void; prefix?: string; suffix?: string }) {
  const [t, setT] = useState(value ? String(value) : '');
  useEffect(() => { if (Number(t || 0) !== value) setT(value ? String(value) : ''); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="flex h-9 items-center gap-1 rounded-xl bg-[var(--glass-strong)] px-2.5 text-[13.5px] focus-within:ring-2 focus-within:ring-iris">
      {prefix && <span className="text-3 font-bold">{prefix}</span>}
      <input inputMode="decimal" value={t} placeholder="0" onChange={(e) => { setT(e.target.value); const n = Number(e.target.value); onChange(Number.isFinite(n) ? n : 0); }}
        className="tabular w-full min-w-0 bg-transparent text-right outline-none" />
      {suffix && <span className="text-3 font-bold">{suffix}</span>}
    </label>
  );
}

const money = (n: number, c: 'USD' | 'GBP' | 'PKR') =>
  c === 'PKR' ? `Rs ${Math.round(Math.abs(n)).toLocaleString()}` : `${c === 'GBP' ? '£' : '$'}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The payment's trip from the client to the bank, drawn as it is typed. */
export function Journey({ res, compact }: { res: ReturnType<typeof computePayment> | null; compact?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-[26px] bg-[#0E0D14] p-5 text-white shadow-[0_30px_80px_-30px_rgba(124,92,255,.6)]">
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[#7C5CFF] opacity-40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-[#30C46C] opacity-25 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#B9B2FF]"><Landmark className="size-3.5" />The money's journey</div>
        {!res?.steps.length ? (
          <p className="mt-6 text-[14px] text-white/60">Type what the client paid and watch it travel to your bank.</p>
        ) : (
          <ol className="mt-4">
            <AnimatePresence initial={false}>
              {res.steps.map((s, i) => (
                <motion.li key={`${s.label}-${i}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                  className="relative flex items-start gap-3 pb-3 last:pb-0">
                  {i < res.steps.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-white/15" />}
                  <span className={clsx('relative mt-0.5 grid size-[23px] shrink-0 place-items-center rounded-full text-[11px] font-black',
                    s.kind === 'start' ? 'bg-[#30C46C]' : s.kind === 'end' ? 'bg-[linear-gradient(135deg,#7C5CFF,#5AB8FF)]' : s.kind === 'minus' ? 'bg-[#FF6B6B]/90' : s.kind === 'convert' ? 'bg-[#FECA57] text-black' : 'bg-white/15')}>
                    {s.kind === 'minus' ? '−' : s.kind === 'convert' ? '⇄' : s.kind === 'end' ? '✓' : s.kind === 'start' ? '$' : <ArrowDown className="size-3" />}
                  </span>
                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <div className={clsx('truncate text-[13.5px]', s.kind === 'end' || s.kind === 'start' ? 'font-extrabold' : 'text-white/80')}>{s.label}</div>
                      {s.sub && <div className="text-[11.5px] text-white/45">{s.sub}</div>}
                    </div>
                    <div className={clsx('tabular shrink-0 font-display font-extrabold', s.kind === 'end' ? 'text-[22px] text-[#8BE9B3]' : s.kind === 'start' ? 'text-[18px]' : 'text-[14.5px]', s.kind === 'minus' && 'text-[#FF8E8E]')}>
                      {s.amount < 0 ? '−' : ''}{money(s.amount, s.currency)}
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
        {res?.ok && !compact && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Chip label="You kept" value={fmtValue(res.keptPct, 'pct')} tone="#8BE9B3" />
            <Chip label="Your real rate" value={`Rs ${res.effectiveRate?.toFixed(1)} / $1`} />
            <Chip label="Fees & tax" value={`$${res.deductionsUsd.toFixed(2)}`} tone="#FF8E8E" />
            <Chip label={res.fxCostUsd + res.bankUsd >= 0 ? 'Conversion & bank' : 'Conversion gain'} value={`$${Math.abs(res.fxCostUsd + res.bankUsd).toFixed(2)}`} tone={res.fxCostUsd + res.bankUsd >= 0 ? '#FECA57' : '#8BE9B3'} />
          </div>
        )}
        {res?.ok && !compact && (
          <p className="mt-4 text-[12px] leading-relaxed text-white/55">
            Books get {res.entries.length} lines: revenue ${res.grossUsd.toFixed(2)}, each fee and tax as a cost, and the conversion and bank charges as their own costs, so everything adds up to the Rs {Math.round(res.landedPkr).toLocaleString()} that landed.
          </p>
        )}
        {res && !res.ok && res.error && res.steps.length > 0 && <p className="mt-4 text-[13px] font-semibold text-[#FECA57]">{res.error}</p>}
      </div>
    </div>
  );
}
const Chip = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="rounded-2xl bg-white/[0.07] px-3 py-2.5">
    <div className="text-[10.5px] font-bold uppercase tracking-wider text-white/50">{label}</div>
    <div className="tabular mt-0.5 font-display text-[16px] font-extrabold" style={{ color: tone }}>{value}</div>
  </div>
);
