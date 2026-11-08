import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CopyPlus, DownloadCloud, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useVaultMutations, type CrmMonth } from '@/data/vault';
import { INVESTOR_ONLY, KINDS, KIND_ORDER, monthLabel, periodLabel, type Kind, type VEntry } from '@/lib/finance';
import { Button, Empty, Input, Panel, PanelHeader, Picker, Pill, Sheet, Switch, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { monthOptions, show, useV } from './parts';

/* ================================================================ ledger */
export function Ledger() {
  const { data, months, period } = useV();
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [who, setWho] = useState<string>('all');
  const [editing, setEditing] = useState<Partial<VEntry> | null>(null);
  const { rollRecurring } = useVaultMutations();
  const toast = useToast();
  const set = useMemo(() => new Set(months), [months]);
  const rows = data.entries.filter((e) => set.has(e.month) && (kind === 'all' || e.kind === kind)
    && (who === 'all' || (who === 'company' ? e.investor_id == null : e.investor_id === Number(who))))
    .sort((a, b) => b.month.localeCompare(a.month) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const lastMonth = months[months.length - 1];
  const recurringHere = data.entries.filter((e) => e.month === lastMonth && e.recurring).length;

  return (
    <div className="space-y-4">
      <Panel className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Picker className="w-[230px]" value={kind} onChange={(v) => setKind(v as Kind | 'all')}
            options={[{ value: 'all', label: 'Every kind' }, ...KIND_ORDER.map((k) => ({ value: k, label: KINDS[k].label }))]} />
          <Picker className="w-[230px]" value={who} onChange={setWho}
            options={[{ value: 'all', label: 'Company + all investor teams' }, { value: 'company', label: 'Company only' },
              ...data.investors.map((i) => ({ value: String(i.id), label: `${i.name}'s team` }))]} />
          <div className="ml-auto flex flex-wrap gap-2">
            {recurringHere > 0 && (
              <Button variant="glass" icon={<Repeat className="size-4" />} onClick={async () => {
                const n = await rollRecurring(lastMonth);
                toast({ title: n ? `${n} repeating ${n === 1 ? 'entry' : 'entries'} copied to ${monthLabel(addOne(lastMonth), true)}` : 'Already copied', tone: n ? 'success' : undefined });
              }}>Copy repeating to next month</Button>
            )}
            <Button variant="iris" icon={<Plus className="size-4" />} onClick={() => setEditing({ month: period.preset === 'all' ? lastMonth : period.to, kind: 'revenue', investor_id: who !== 'all' && who !== 'company' ? Number(who) : null })}>Add money in / out</Button>
          </div>
        </div>
      </Panel>

      <CrmPull month={lastMonth} investorId={who !== 'all' && who !== 'company' ? Number(who) : null} />

      <Panel padded={false}>
        <div className="p-5 pb-2"><PanelHeader title="Entries" sub={`${periodLabel(months)} · ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`} /></div>
        {!rows.length ? (
          <Empty title="Nothing here yet" body="Add revenue, salaries, rent, commissions, taxes… one line per item, per month."
            action={<Button variant="iris" icon={<Plus className="size-4" />} onClick={() => setEditing({ month: lastMonth, kind: 'revenue', investor_id: null })}>Add the first entry</Button>} />
        ) : <EntryTable rows={rows} onEdit={setEditing} />}
      </Panel>

      <EntryEditor value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
const addOne = (m: string) => { const d = new Date(`${m}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };

export function EntryTable({ rows, onEdit, hideWho }: { rows: VEntry[]; onEdit: (e: VEntry) => void; hideWho?: boolean }) {
  const { data } = useV();
  const cats = new Map(data.categories.map((c) => [c.id, c.name]));
  const invs = new Map(data.investors.map((i) => [i.id, i.name]));
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[720px] text-[13.5px]">
        <thead className="text-3 text-left text-[11.5px] font-bold uppercase tracking-wide">
          <tr><th className="px-5 py-2">Month</th><th>Kind</th><th>Type & description</th>{!hideWho && <th>Belongs to</th>}<th className="px-5 text-right">Amount</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const k = KINDS[e.kind];
            const inflow = e.kind === 'revenue' || e.kind === 'other_income' || e.kind === 'capital_in';
            return (
              <tr key={e.id} className="group cursor-pointer border-t border-[color:var(--hairline,rgba(127,127,127,.15))] hover:bg-[var(--fill)]" onClick={() => onEdit(e)}>
                <td className="whitespace-nowrap px-5 py-2.5">{monthLabel(e.month)}</td>
                <td><span className="flex items-center gap-2 whitespace-nowrap"><i className="size-2.5 rounded-full" style={{ background: k.color }} />{k.label}</span></td>
                <td className="max-w-[320px]">
                  <div className="truncate font-semibold">{(e.category_id && cats.get(e.category_id)) || '—'}</div>
                  {(e.label || e.note) && <div className="text-3 truncate text-[12px]">{[e.label, e.note].filter(Boolean).join(' · ')}</div>}
                </td>
                {!hideWho && <td className="whitespace-nowrap">{e.investor_id ? <Pill tone="iris">{invs.get(e.investor_id) ?? 'Investor'}</Pill> : <span className="text-3">Company</span>}</td>}
                <td className={clsx('tabular whitespace-nowrap px-5 text-right font-bold', inflow ? 'text-ok' : '')}>
                  {inflow ? '+' : '−'}{show(e.amount)}
                  {e.currency === 'PKR' && e.original_amount != null && <div className="text-3 text-[11px] font-medium">Rs {Number(e.original_amount).toLocaleString()} @ {e.fx}</div>}
                </td>
                <td className="pr-4 text-right">
                  {e.recurring && <Repeat className="text-3 inline size-3.5" />}
                  <Pencil className="text-3 ml-2 inline size-3.5 opacity-0 group-hover:opacity-100" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================ editor */
export function EntryEditor({ value, onClose, lockInvestor }: { value: Partial<VEntry> | null; onClose: () => void; lockInvestor?: boolean }) {
  const { data, knownMonths } = useV();
  const { save, remove } = useVaultMutations();
  const toast = useToast();
  const rate = Number(data.settings.pkr_rate) || 280;
  const [f, setF] = useState<Partial<VEntry> & { amountText?: string; fxText?: string; newType?: string }>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    setF({
      ...value, currency: value.currency ?? 'USD',
      amountText: value.id ? String(value.currency === 'PKR' ? value.original_amount ?? '' : value.amount ?? '') : '',
      fxText: String(value.fx ?? rate), newType: '',
    });
  }, [value, rate]);
  const kind = (f.kind ?? 'revenue') as Kind;
  const cats = data.categories.filter((c) => c.kind === kind && (!c.archived || c.id === f.category_id));
  const typed = Number(String(f.amountText ?? '').replace(/[, ]/g, ''));
  const fx = Number(f.fxText) || rate;
  const usdAmount = f.currency === 'PKR' ? typed / fx : typed;
  const needsInvestor = INVESTOR_ONLY.includes(kind);

  const submit = async () => {
    if (!(typed > 0)) { toast({ title: 'Type an amount above zero', tone: 'danger' }); return; }
    if (needsInvestor && !f.investor_id) { toast({ title: `${KINDS[kind].label} must belong to an investor`, tone: 'danger' }); return; }
    setBusy(true);
    try {
      let category_id = f.category_id ?? null;
      if (f.newType?.trim()) {
        const same = data.categories.find((c) => c.kind === kind && c.name.toLowerCase() === f.newType!.trim().toLowerCase());
        category_id = same ? same.id : (await save<{ id: number }>('category', { kind, name: f.newType.trim(), acquisition: kind === 'marketing' })).id;
      }
      await save('entry', {
        id: f.id, month: f.month, investor_id: f.investor_id ?? null, kind, category_id, label: f.label ?? '',
        amount: Math.round(usdAmount * 100) / 100, currency: f.currency, original_amount: f.currency === 'PKR' ? typed : null,
        fx: f.currency === 'PKR' ? fx : null, recurring: !!f.recurring, note: f.note ?? '',
      });
      toast({ title: f.id ? 'Entry updated' : 'Entry added', tone: 'success' });
      onClose();
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };

  return (
    <Sheet open={!!value} onClose={onClose} title={f.id ? 'Edit entry' : 'Add money in or out'} width={560}
      footer={<div className="flex w-full items-center gap-2">
        {f.id && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { if (!confirm('Delete this entry?')) return; await remove('entry', f.id!); onClose(); }}>Delete</Button>}
        {f.id && <Button variant="ghost" icon={<CopyPlus className="size-4" />} onClick={() => setF({ ...f, id: undefined })}>Duplicate</Button>}
        <div className="flex-1" />
        <Button variant="glass" onClick={onClose}>Cancel</Button>
        <Button variant="iris" loading={busy} onClick={() => void submit()}>{f.id ? 'Save' : 'Add'}</Button>
      </div>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Picker label="Month" value={f.month} onChange={(month) => setF({ ...f, month })} options={monthOptions(knownMonths)} />
          <Picker label="Belongs to" value={f.investor_id ? String(f.investor_id) : 'company'} disabled={lockInvestor}
            onChange={(v) => setF({ ...f, investor_id: v === 'company' ? null : Number(v) })}
            options={[{ value: 'company', label: 'The company (no investor)' }, ...data.investors.map((i) => ({ value: String(i.id), label: `${i.name}'s team` }))]} />
        </div>
        <div>
          <Picker label="Kind of money" value={kind} onChange={(k) => setF({ ...f, kind: k as Kind, category_id: null })}
            options={KIND_ORDER.map((k) => ({ value: k, label: KINDS[k].label, hint: KINDS[k].plain }))} />
          <p className="text-3 mt-1.5 text-[12px]">{KINDS[kind].plain}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Picker label="Type" value={f.category_id ? String(f.category_id) : '__none'} onChange={(v) => setF({ ...f, category_id: v === '__none' ? null : Number(v), newType: '' })}
            options={[{ value: '__none', label: 'No type' }, ...cats.map((c) => ({ value: String(c.id), label: c.name }))]} />
          <Input label="…or type a new one" placeholder="e.g. LinkedIn ads" value={f.newType ?? ''} onChange={(e) => setF({ ...f, newType: e.target.value })} />
        </div>
        <Input label="Description (optional)" placeholder="e.g. Acme Corp website, October rent" value={f.label ?? ''} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <Input label="Amount" inputMode="decimal" placeholder="0" value={f.amountText ?? ''} onChange={(e) => setF({ ...f, amountText: e.target.value })}
            leading={<span className="text-[13px] font-bold">{f.currency === 'PKR' ? 'Rs' : '$'}</span>} />
          {/* Plain buttons: the sliding Segmented pill keeps a closing sheet on screen. */}
          <div className="fill inline-flex rounded-[14px] p-1" role="group" aria-label="Currency">
            {(['USD', 'PKR'] as const).map((c) => (
              <button key={c} type="button" aria-pressed={(f.currency ?? 'USD') === c} onClick={() => setF({ ...f, currency: c })}
                className={clsx('rounded-[11px] px-3 py-1.5 text-[13px] font-semibold', (f.currency ?? 'USD') === c ? 'bg-[var(--glass-strong)] shadow-[0_2px_8px_rgba(0,0,0,0.08)]' : 'text-2')}>{c}</button>
            ))}
          </div>
        </div>
        {f.currency === 'PKR' && (
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <Input label="Rate (PKR per 1 USD)" inputMode="decimal" value={f.fxText ?? ''} onChange={(e) => setF({ ...f, fxText: e.target.value })} />
            <div className="fill rounded-2xl px-3 py-2.5 text-[14px]">= <b className="tabular">{show(Number.isFinite(usdAmount) ? usdAmount : 0)}</b></div>
          </div>
        )}
        <div className="fill flex items-center justify-between gap-3 rounded-[18px] p-3.5">
          <div>
            <div className="text-[14px] font-bold">Repeats every month</div>
            <div className="text-2 text-[12.5px]">Rent, salaries, retainers… copy them forward with one click.</div>
          </div>
          <Switch checked={!!f.recurring} onChange={(recurring) => setF({ ...f, recurring })} />
        </div>
        <Textarea label="Note (optional)" rows={2} value={f.note ?? ''} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
    </Sheet>
  );
}

/* ============================================================ from the CRM */
/** What the CRM already knows for a month, with one-tap "add" buttons. */
export function CrmPull({ month, investorId }: { month: string; investorId: number | null }) {
  const { data } = useV();
  const { crmMonth, save } = useVaultMutations();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [crm, setCrm] = useState<CrmMonth | null>(null);
  const [loading, setLoading] = useState(false);
  const agents = investorId ? data.agents.filter((a) => a.investor_id === investorId).map((a) => a.profile_id) : null;
  const rate = Number(data.settings.pkr_rate) || 280;
  const load = async () => {
    setLoading(true);
    try { setCrm(await crmMonth(month, agents)); } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setLoading(false); }
  };
  useEffect(() => { if (open) void load(); }, [open, month, investorId]); // eslint-disable-line react-hooks/exhaustive-deps
  const cat = (kind: Kind, name: string) => data.categories.find((c) => c.kind === kind && c.name === name)?.id ?? null;
  const add = async (kind: Kind, amount: number, label: string, catName?: string, pkr?: number) => {
    if (!(amount > 0)) return;
    await save('entry', { month, investor_id: investorId, kind, category_id: catName ? cat(kind, catName) : null, label, amount: Math.round(amount * 100) / 100,
      currency: pkr ? 'PKR' : 'USD', original_amount: pkr ?? null, fx: pkr ? rate : null });
    toast({ title: `${KINDS[kind].label} added from the CRM`, tone: 'success' });
  };
  const add2 = async (key: 'new_clients' | 'agents', v: number) => {
    const cur = data.stats.find((s) => s.month === month && (s.investor_id ?? null) === investorId);
    await save('stats', { month, investor_id: investorId, data: { ...(cur?.data ?? {}), [key]: v } });
    toast({ title: 'Saved to monthly numbers', tone: 'success' });
  };
  const noAgents = investorId != null && !agents?.length;
  return (
    <Panel>
      <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-2 text-[15px] font-bold"><DownloadCloud className="size-4 text-iris" />Pull from the CRM · {monthLabel(month, true)}</span>
        <span className="text-2 text-[13px]">{open ? 'Hide' : 'Show what the CRM recorded'}</span>
      </button>
      {open && (
        <div className="mt-4">
          {noAgents ? <p className="text-2 text-[13.5px]">Pick this investor's agents first (Investors → their card → Team) so the CRM knows whose deals to count.</p>
            : loading || !crm ? <p className="text-2 text-[13.5px]">Reading the CRM…</p> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ['Payments received (PayPal links)', crm.payments_usd, `${crm.payments_count} paid`, () => add('revenue', crm.payments_usd, 'Payments received (CRM)')],
                  ['Won deals value', crm.deals_won_usd, `${crm.deals_won} deals`, () => add('revenue', crm.deals_won_usd, 'Won deals (CRM)')],
                  ['PayPal fees', crm.paypal_fees_usd, 'cost of delivery', () => add('direct_cost', crm.paypal_fees_usd, 'PayPal fees (CRM)', 'Payment processing fees (PayPal)')],
                  ['Refunds', crm.refunds_usd, '', () => add('refund', crm.refunds_usd, 'Refunds (CRM)', 'Client refunds')],
                  ['Commissions on paid links', crm.commission_usd, '', () => add('commission', crm.commission_usd, 'Commissions (CRM)', 'Closer commission')],
                  ['Base salaries on file', crm.salaries_pkr / rate, `Rs ${Math.round(crm.salaries_pkr).toLocaleString()} @ ${rate}`, () => add('salary', crm.salaries_pkr / rate, 'Salaries on file (CRM)', undefined, crm.salaries_pkr)],
                ].map(([label, v, sub, fn]) => (
                  <div key={label as string} className="fill flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5">
                    <div className="min-w-0"><div className="text-[13.5px] font-semibold">{label as string}</div><div className="text-3 text-[12px]">{sub as string}</div></div>
                    <div className="flex items-center gap-2">
                      <span className="tabular font-bold">{show(v as number)}</span>
                      <Button size="sm" variant="glass" disabled={!(Number(v) > 0)} onClick={() => void (fn as () => Promise<void>)()}>Add</Button>
                    </div>
                  </div>
                ))}
                <div className="fill flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5">
                  <div><div className="text-[13.5px] font-semibold">Clients closed (won deals)</div><div className="text-3 text-[12px]">to monthly numbers</div></div>
                  <div className="flex items-center gap-2"><span className="tabular font-bold">{crm.deals_won}</span><Button size="sm" variant="glass" onClick={() => void add2('new_clients', crm.deals_won)}>Use</Button></div>
                </div>
                <div className="fill flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5">
                  <div><div className="text-[13.5px] font-semibold">Active sales agents</div><div className="text-3 text-[12px]">to monthly numbers</div></div>
                  <div className="flex items-center gap-2"><span className="tabular font-bold">{crm.agents}</span><Button size="sm" variant="glass" onClick={() => void add2('agents', crm.agents)}>Use</Button></div>
                </div>
                <p className="text-3 text-[12px] sm:col-span-2">Pick either payments received or won deals as revenue, not both, or it will count twice. Check the figures before adding: the CRM only knows what was recorded in it.</p>
              </div>
            )}
        </div>
      )}
    </Panel>
  );
}
