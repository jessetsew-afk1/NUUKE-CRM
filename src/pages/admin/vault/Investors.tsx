import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, Banknote, FileDown, HandCoins, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { usePeople } from '@/data/common';
import { useVaultMutations } from '@/data/vault';
import {
  BASIS_LABEL, fmtValue, investorLedger, investorSummary, monthLabel, type InvestorMonth, type VEntry, type VInvestor,
} from '@/lib/finance';
import { Button, Chip, Empty, Input, Panel, PanelHeader, Picker, Pill, ProgressBar, Sheet, Switch, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { CrmPull, EntryEditor, EntryTable } from './Ledger';
import { Numbers } from './Numbers';
import { ProfitAndLoss } from './Statements';
import { Def, monthOptions, show, thisMonth, useV } from './parts';

const Exporter = lazy(() => import('./pdf'));
const COLORS = ['#7C5CFF', '#30C46C', '#FF9F43', '#54A0FF', '#F368E0', '#00D2D3', '#EE5253', '#FECA57'];

export function Investors() {
  const { data, months } = useV();
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<Partial<VInvestor> | null>(null);
  const end = months[months.length - 1];
  const inv = data.investors.find((i) => i.id === open);
  if (inv) return <InvestorDetail inv={inv} onBack={() => setOpen(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-2 text-[14px]">Each investor funds a team. Their card shows what they put in, what their team made, their share, and what is owed.</div>
        <Button variant="iris" icon={<Plus className="size-4" />} onClick={() => setEditing({ share_pct: 30, share_basis: 'net_profit', carry_losses: true, status: 'active', color: COLORS[data.investors.length % COLORS.length] })}>New investor</Button>
      </div>
      {!data.investors.length ? (
        <Panel><Empty art={<HandCoins className="size-10 text-iris" />} title="No investors yet" body="Create a card for each investor: how much they put in, their profit share, and their team." /></Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.investors.map((i) => {
            const L = investorLedger(i, data.entries, data.stats, end);
            const s = investorSummary(i, L);
            const last = L[L.length - 1];
            return (
              <button key={i.id} type="button" onClick={() => setOpen(i.id)} className="glass group relative overflow-hidden rounded-[26px] p-5 text-left transition-transform hover:-translate-y-0.5">
                <div className="absolute -right-10 -top-10 size-36 rounded-full opacity-30 blur-2xl" style={{ background: i.color ?? '#7C5CFF' }} />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[18px] font-extrabold">{i.name}</div>
                    <div className="text-2 truncate text-[13px]">{i.company || i.email || 'Investor'}</div>
                  </div>
                  <Pill tone={i.status === 'active' ? 'good' : i.status === 'paused' ? 'warn' : 'neutral'}>{i.status}</Pill>
                </div>
                <div className="relative mt-4 grid grid-cols-2 gap-3">
                  <Mini label="Invested" value={show(s.invested)} />
                  <Mini label={`Share (${BASIS_LABEL[i.share_basis]})`} value={`${i.share_pct}%`} />
                  <Mini label="Earned to date" value={show(s.earned)} />
                  <Mini label="Owed now" value={show(s.owed)} strong />
                </div>
                <div className="relative mt-4">
                  <div className="text-2 mb-1.5 flex justify-between text-[12px] font-semibold"><span>Paid back</span><span>{fmtValue(s.paybackProgress, 'pct')} of investment</span></div>
                  <ProgressBar value={Math.min(1, s.paybackProgress ?? 0)} max={1} height={8} tone={i.color ?? undefined} />
                </div>
                <div className="text-3 relative mt-3 flex justify-between text-[12px]">
                  <span>ROI {fmtValue(s.roi, 'pct')}</span>
                  <span>{last ? `${monthLabel(last.month)}: ${show(last.share)} share` : 'No activity yet'}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <InvestorEditor value={editing} onClose={() => setEditing(null)} onCreated={(id) => setOpen(id)} />
    </div>
  );
}
const Mini = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div><div className="text-3 text-[11px] font-bold uppercase tracking-wide">{label}</div><div className={clsx('tabular mt-0.5 font-display text-[18px] font-extrabold', strong && 'text-iris')}>{value}</div></div>
);

/* ============================================================ the card */
function InvestorDetail({ inv, onBack }: { inv: VInvestor; onBack: () => void }) {
  const { data, months, mode, knownMonths } = useV();
  const [editing, setEditing] = useState<Partial<VInvestor> | null>(null);
  const [entry, setEntry] = useState<Partial<VEntry> | null>(null);
  const [reportMonth, setReportMonth] = useState(months[months.length - 1]);
  const [exporting, setExporting] = useState(false);
  const [section, setSection] = useState<'month' | 'statement' | 'entries' | 'numbers' | 'team' | 'terms'>('month');
  useEffect(() => { setReportMonth(months[months.length - 1]); }, [months]);
  const end = months[months.length - 1] > thisMonth() ? months[months.length - 1] : thisMonth();
  const L = useMemo(() => investorLedger(inv, data.entries, data.stats, end > reportMonth ? end : reportMonth), [inv, data, end, reportMonth]);
  const upTo = L.filter((r) => r.month <= reportMonth);
  const s = investorSummary(inv, upTo);
  const row = L.find((r) => r.month === reportMonth);
  const entries = data.entries.filter((e) => e.investor_id === inv.id).sort((a, b) => b.month.localeCompare(a.month));
  const ctxForPdf = useV();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="glass" icon={<ArrowLeft className="size-4" />} onClick={onBack}>All investors</Button>
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-4 shrink-0 rounded-full" style={{ background: inv.color ?? '#7C5CFF' }} />
          <h2 className="truncate text-[26px] font-extrabold">{inv.name}</h2>
          <Pill tone="iris">{inv.share_pct}% of {BASIS_LABEL[inv.share_basis]}</Pill>
          {inv.carry_losses && <Pill tone="neutral">losses carried forward</Pill>}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="glass" icon={<Pencil className="size-4" />} onClick={() => setEditing(inv)}>Edit terms</Button>
          <Button variant="glass" icon={<Banknote className="size-4" />} onClick={() => setEntry({ month: reportMonth, investor_id: inv.id, kind: 'capital_in' })}>Record investment</Button>
          <Button variant="glass" icon={<HandCoins className="size-4" />} onClick={() => setEntry({ month: reportMonth, investor_id: inv.id, kind: 'payout', amount: Math.max(0, row?.owedToDate ?? 0) })}>Record payout</Button>
        </div>
      </div>

      <Panel className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2 pl-1 text-[13px] font-semibold">Month</span>
          <Picker className="w-[190px]" value={reportMonth} onChange={setReportMonth} options={monthOptions(knownMonths)} />
          <div className="ml-auto" />
          <Button variant="iris" icon={<FileDown className="size-4" />} onClick={() => setExporting(true)}>Monthly report PDF</Button>
        </div>
      </Panel>

      {/* Account to date */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Total invested" value={show(s.invested)} def="All capital this investor has put in (less any returned)." sub={s.returnedCapital ? `${show(s.returnedCapital)} returned` : undefined} />
        <Tile label="Earned to date" value={show(s.earned)} def="Their profit share across every month so far." />
        <Tile label="Paid out" value={show(s.paid)} def="Profit share actually paid to them." />
        <Tile label="Owed now" value={show(s.owed)} def="Earned minus paid: what the company owes them today." accent />
        <Tile label="ROI" value={fmtValue(s.roi, 'pct')} def="Profit share earned for every $1 invested." />
        <Tile label="Yearly ROI" value={fmtValue(s.annualRoi, 'pct')} def="ROI converted to a per-year rate."
          sub={s.vsTarget != null ? `${s.vsTarget >= 0 ? '+' : ''}${fmtValue(s.vsTarget, 'pct')} vs ${inv.target_return_pct}% target` : undefined} />
        {mode === 'pro' && <Tile label="Total value multiple" value={fmtValue(s.moic, 'x')} def="(Paid + owed + capital still invested) ÷ invested. Also called MOIC/TVPI. 1.5× means every $1 is now worth $1.50." />}
        {mode === 'pro' && <Tile label="IRR (yearly)" value={fmtValue(s.irrAnnual, 'pct')} def="Internal rate of return: the yearly interest rate this investment has effectively earned, counting when each dollar moved. Assumes their capital is still theirs." />}
        <div className={clsx('glass col-span-2 rounded-[22px] p-4', mode === 'pro' ? 'md:col-span-4' : 'md:col-span-2')}>
          <div className="text-2 flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide">Payback<Def text="How much of their investment has come back to them as payouts and returned capital." /></div>
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar className="flex-1" value={Math.min(1, s.paybackProgress ?? 0)} max={1} tone={inv.color ?? undefined} />
            <span className="tabular font-bold">{fmtValue(s.paybackProgress, 'pct')}</span>
          </div>
          <div className="text-3 mt-1.5 text-[12px]">{s.monthsToPayback === 0 ? 'Fully paid back.' : s.monthsToPayback != null ? `About ${fmtValue(s.monthsToPayback, 'months')} to full payback at the recent pace (${show(s.avgMonthlyShare)}/month).` : 'Not enough history to estimate payback yet.'}</div>
        </div>
      </div>

      <div className="scroll-x no-scrollbar flex gap-1.5">
        {([['month', `${monthLabel(reportMonth)} at a glance`], ['statement', 'Month by month'], ['entries', 'Money in & out'], ['numbers', 'Team numbers'], ['team', 'Team & CRM'], ['terms', 'Agreement']] as const).map(([id, label]) => (
          <Chip key={id} active={section === id} onClick={() => setSection(id)}>{label}</Chip>
        ))}
      </div>

      {section === 'month' && <MonthCard inv={inv} row={row} />}
      {section === 'statement' && (
        <>
          <Statement inv={inv} rows={L.filter((r) => r.month <= reportMonth).slice(-24).reverse()} />
          <ProfitAndLoss scope={inv.id} detailed={mode === 'pro'} title={`${inv.name}'s team: profit & loss`} />
        </>
      )}
      {section === 'entries' && (
        <Panel padded={false}>
          <div className="flex items-center justify-between gap-3 p-5 pb-2">
            <PanelHeader className="!mb-0" title="Money in & out for this team" sub="Revenue, commissions, rent, expenses, taxes, investment and payouts" />
            <Button variant="iris" icon={<Plus className="size-4" />} onClick={() => setEntry({ month: reportMonth, investor_id: inv.id, kind: 'revenue' })}>Add</Button>
          </div>
          {entries.length ? <EntryTable rows={entries} onEdit={setEntry} hideWho /> : <Empty title="Nothing recorded for this team yet" />}
        </Panel>
      )}
      {section === 'numbers' && <Numbers investorId={inv.id} compact />}
      {section === 'team' && (
        <>
          <TeamPicker inv={inv} />
          <CrmPull month={reportMonth} investorId={inv.id} />
        </>
      )}
      {section === 'terms' && (
        <Panel>
          <PanelHeader title="Agreement & notes" right={<Button size="sm" variant="glass" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(inv)}>Edit</Button>} />
          <dl className="grid gap-3 text-[14px] sm:grid-cols-2">
            <Term k="Profit share" v={`${inv.share_pct}% of the team's ${BASIS_LABEL[inv.share_basis]}`} />
            <Term k="Losses" v={inv.carry_losses ? 'Carried forward: a losing month is recovered from later profits before a share is earned' : 'Not carried: each month stands alone'} />
            <Term k="Target return" v={inv.target_return_pct != null ? `${inv.target_return_pct}% a year` : '—'} />
            <Term k="Payout day" v={inv.payout_day ? `Day ${inv.payout_day} of each month` : '—'} />
            <Term k="Since" v={inv.joined_on ?? '—'} />
            <Term k="Contact" v={[inv.email, inv.phone].filter(Boolean).join(' · ') || '—'} />
          </dl>
          {inv.agreement && <div className="fill mt-4 whitespace-pre-wrap rounded-2xl p-4 text-[14px]">{inv.agreement}</div>}
          {inv.notes && <div className="text-2 mt-3 whitespace-pre-wrap text-[13.5px]">{inv.notes}</div>}
        </Panel>
      )}

      <InvestorEditor value={editing} onClose={() => setEditing(null)} onDeleted={onBack} />
      <EntryEditor value={entry} onClose={() => setEntry(null)} lockInvestor />
      {exporting && (
        <Suspense fallback={null}>
          <Exporter kind="investor" ctx={ctxForPdf} investorId={inv.id} month={reportMonth} onDone={() => setExporting(false)} />
        </Suspense>
      )}
    </div>
  );
}

function Tile({ label, value, def, sub, accent }: { label: string; value: string; def: string; sub?: string; accent?: boolean }) {
  return (
    <div className="glass rounded-[22px] p-4">
      <div className="text-2 flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide">{label}<Def text={def} /></div>
      <div className={clsx('tabular mt-2 font-display text-[24px] font-extrabold leading-none', accent && 'text-iris')}>{value}</div>
      {sub && <div className="text-3 mt-1.5 text-[12px]">{sub}</div>}
    </div>
  );
}
const Term = ({ k, v }: { k: string; v: string }) => (
  <div><dt className="text-3 text-[11.5px] font-bold uppercase tracking-wide">{k}</dt><dd className="mt-0.5">{v}</dd></div>
);

/** The month the investor asks about, in the words they use. */
function MonthCard({ inv, row }: { inv: VInvestor; row: InvestorMonth | undefined }) {
  if (!row) return <Panel><Empty title="Nothing in this month yet" body="Add this team's revenue and costs for the month in Money in & out." /></Panel>;
  const k = row.kinds; const p = row.pnl;
  const items: [string, string, string][] = [
    ['Revenue', show(p.revenue), 'What the team\'s clients paid this month, after refunds.'],
    ['Gross profit', show(p.grossProfit), 'Revenue minus the cost of doing and selling the work (incl. commissions).'],
    ['Agents on the team', row.agents == null ? '—' : String(row.agents), 'Sales agents working for this investor\'s team.'],
    ['Clients closed', row.clientsClosed == null ? '—' : String(row.clientsClosed), 'New clients the team\'s agents won.'],
    ['Commissions paid', show(k.commission), 'Commission paid to the team\'s closers, setters and referrers.'],
    ['Salaries', show(k.salary), 'Fixed pay for the team.'],
    ['Rent & office', show(k.rent), 'The team\'s share of rent, electricity and internet.'],
    ['Other expenses', show(k.direct_cost + k.marketing + k.software + k.expense), 'Delivery costs, leads & ads, tools and other running costs.'],
    ['Taxes', show(k.tax), 'Taxes recorded against the team.'],
    ['Net profit', show(p.netProfit), 'What the team made after every cost and tax.'],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Panel>
        <PanelHeader title={`${monthLabel(row.month, true)}`} sub="This team's month, line by line" />
        <div className="grid gap-x-6 sm:grid-cols-2">
          {items.map(([l, v, d]) => (
            <div key={l} className="flex items-center justify-between gap-3 border-b border-[color:var(--hairline,rgba(127,127,127,.12))] py-2.5 text-[14px]">
              <span className="text-2 flex items-center gap-1">{l}<Def text={d} /></span>
              <span className={clsx('tabular font-bold', v.startsWith('−') && 'text-bad')}>{v}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel strong>
        <PanelHeader title={`${inv.name}'s share`} sub={`${inv.share_pct}% of ${BASIS_LABEL[inv.share_basis]}`} />
        <div className="space-y-2 text-[14px]">
          <Row l={`Team ${BASIS_LABEL[inv.share_basis]}`} v={show(row.basis)} />
          {row.lossOffset > 0 && <Row l="Less: earlier losses recovered" v={`(${show(row.lossOffset)})`} />}
          {row.basis < 0 && inv.carry_losses && <Row l="Loss carried to next months" v={show(-row.basis)} />}
          <Row l="Amount shared" v={show(row.shareable)} />
          <div className="border-t border-[color:var(--hairline,rgba(127,127,127,.2))] pt-2" />
          <Row l="Their share this month" v={show(row.share)} big />
          <Row l="Paid this month" v={show(row.paid)} />
          <Row l="Owed after this month" v={show(row.owedToDate)} big />
        </div>
      </Panel>
    </div>
  );
}
const Row = ({ l, v, big }: { l: string; v: string; big?: boolean }) => (
  <div className={clsx('flex items-center justify-between gap-3', big && 'text-[17px] font-extrabold')}><span className={clsx(!big && 'text-2')}>{l}</span><span className="tabular">{v}</span></div>
);

function Statement({ inv, rows }: { inv: VInvestor; rows: InvestorMonth[] }) {
  return (
    <Panel padded={false}>
      <div className="p-5 pb-2"><PanelHeader title="Month by month" sub={`Newest first · share = ${inv.share_pct}% of ${BASIS_LABEL[inv.share_basis]}${inv.carry_losses ? ' after earlier losses' : ''}`} /></div>
      {!rows.length ? <Empty title="No months yet" /> : (
        <div className="scroll-x">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead className="text-3 text-right text-[11px] font-bold uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2 text-left">Month</th><th>Revenue</th><th>Gross profit</th><th>Commissions</th><th>Salaries</th><th>Rent</th>
                <th>Other costs</th><th>Tax</th><th>Net profit</th><th>Agents</th><th>Clients</th><th>Their share</th><th>Paid</th><th className="px-5">Owed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="tabular border-t border-[color:var(--hairline,rgba(127,127,127,.15))] text-right">
                  <td className="whitespace-nowrap px-5 py-2 text-left font-semibold">{monthLabel(r.month)}</td>
                  <td>{show(r.pnl.revenue)}</td><td>{show(r.pnl.grossProfit)}</td><td>{show(r.kinds.commission)}</td><td>{show(r.kinds.salary)}</td>
                  <td>{show(r.kinds.rent)}</td><td>{show(r.kinds.direct_cost + r.kinds.marketing + r.kinds.software + r.kinds.expense + r.kinds.depreciation + r.kinds.interest)}</td>
                  <td>{show(r.kinds.tax)}</td><td className={clsx('font-bold', r.pnl.netProfit < 0 && 'text-bad')}>{show(r.pnl.netProfit)}</td>
                  <td>{r.agents ?? '—'}</td><td>{r.clientsClosed ?? '—'}</td>
                  <td className="font-bold text-iris">{show(r.share)}</td><td>{show(r.paid)}</td><td className="px-5 font-bold">{show(r.owedToDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function TeamPicker({ inv }: { inv: VInvestor }) {
  const { data } = useV();
  const people = usePeople();
  const { save } = useVaultMutations();
  const toast = useToast();
  const mine = new Set(data.agents.filter((a) => a.investor_id === inv.id).map((a) => a.profile_id));
  const taken = new Map(data.agents.filter((a) => a.investor_id !== inv.id).map((a) => [a.profile_id, data.investors.find((i) => i.id === a.investor_id)?.name]));
  const staff = (people.data ?? []).filter((p) => p.is_active && ['sales', 'setter', 'production'].includes(p.role));
  const toggle = async (id: string) => {
    const next = new Set(mine); if (next.has(id)) next.delete(id); else next.add(id);
    try { await save('agents', { investor_id: inv.id, profile_ids: [...next] }); } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); }
  };
  return (
    <Panel>
      <PanelHeader title={<span className="flex items-center gap-2"><Users className="size-4" />Agents on {inv.name}'s team</span>}
        sub="Pick who works for this investor. The CRM pull below counts only their deals, payments and salaries." />
      <div className="flex flex-wrap gap-2">
        {staff.map((p) => (
          <Chip key={p.id} active={mine.has(p.id)} onClick={() => void toggle(p.id)}>
            {p.full_name}{taken.get(p.id) && !mine.has(p.id) && <span className="text-3 text-[11px]">· {taken.get(p.id)}</span>}
          </Chip>
        ))}
      </div>
    </Panel>
  );
}

/* ============================================================== editor */
function InvestorEditor({ value, onClose, onCreated, onDeleted }: {
  value: Partial<VInvestor> | null; onClose: () => void; onCreated?: (id: number) => void; onDeleted?: () => void;
}) {
  const { data, knownMonths } = useV();
  const { save, remove } = useVaultMutations();
  const toast = useToast();
  const [f, setF] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    setF({
      name: value.name ?? '', company: value.company ?? '', email: value.email ?? '', phone: value.phone ?? '',
      joined_on: value.joined_on ?? new Date().toISOString().slice(0, 10), share_pct: String(value.share_pct ?? 30),
      share_basis: value.share_basis ?? 'net_profit', carry_losses: value.carry_losses ?? true,
      target_return_pct: value.target_return_pct != null ? String(value.target_return_pct) : '', payout_day: value.payout_day ? String(value.payout_day) : '',
      agreement: value.agreement ?? '', notes: value.notes ?? '', color: value.color ?? COLORS[0], status: value.status ?? 'active',
      initial: '', initialMonth: thisMonth(),
    });
  }, [value]);
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const isNew = !value?.id;
  const submit = async () => {
    const pct = Number(f.share_pct);
    if (!String(f.name).trim()) { toast({ title: 'Give the investor a name', tone: 'danger' }); return; }
    if (!(pct >= 0 && pct <= 100)) { toast({ title: 'Share must be between 0 and 100%', tone: 'danger' }); return; }
    setBusy(true);
    try {
      const row = await save<VInvestor>('investor', { id: value?.id, ...f, share_pct: pct });
      const initial = Number(String(f.initial).replace(/[, $]/g, ''));
      if (isNew && initial > 0) {
        const cat = data.categories.find((c) => c.kind === 'capital_in')?.id ?? null;
        await save('entry', { month: f.initialMonth, investor_id: row.id, kind: 'capital_in', category_id: cat, label: 'Initial investment', amount: initial });
      }
      toast({ title: isNew ? 'Investor created' : 'Saved', tone: 'success' });
      onClose();
      if (isNew) onCreated?.(row.id);
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!value} onClose={onClose} title={isNew ? 'New investor' : `Edit ${value?.name}`} width={600}
      footer={<div className="flex w-full items-center gap-2">
        {!isNew && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => {
          if (!confirm(`Delete ${value?.name} and every entry on their team? This cannot be undone.`)) return;
          await remove('investor', value!.id!); onClose(); onDeleted?.();
        }}>Delete</Button>}
        <div className="flex-1" />
        <Button variant="glass" onClick={onClose}>Cancel</Button>
        <Button variant="iris" loading={busy} onClick={() => void submit()}>{isNew ? 'Create' : 'Save'}</Button>
      </div>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={String(f.name ?? '')} onChange={(e) => set('name', e.target.value)} autoFocus={isNew} />
          <Input label="Company (optional)" value={String(f.company ?? '')} onChange={(e) => set('company', e.target.value)} />
          <Input label="Email" type="email" value={String(f.email ?? '')} onChange={(e) => set('email', e.target.value)} />
          <Input label="Phone" value={String(f.phone ?? '')} onChange={(e) => set('phone', e.target.value)} />
          <Input label="Investing since" type="date" value={String(f.joined_on ?? '')} onChange={(e) => set('joined_on', e.target.value)} />
          <Picker label="Status" value={String(f.status)} onChange={(v) => set('status', v)}
            options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'exited', label: 'Exited' }]} />
        </div>
        <div className="fill space-y-3 rounded-[20px] p-4">
          <div className="text-[14px] font-bold">Their deal</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Profit share %" inputMode="decimal" value={String(f.share_pct ?? '')} onChange={(e) => set('share_pct', e.target.value)} leading={<span className="text-[13px] font-bold">%</span>} />
            <Picker label="Share of the team's…" value={String(f.share_basis)} onChange={(v) => set('share_basis', v)}
              options={[
                { value: 'net_profit', label: 'Net profit', hint: 'After every cost and tax (most common)' },
                { value: 'gross_profit', label: 'Gross profit', hint: 'After delivery costs and commissions only' },
                { value: 'revenue', label: 'Revenue', hint: 'Off the top, before any costs' },
              ]} />
            <Input label="Target yearly return % (optional)" inputMode="decimal" value={String(f.target_return_pct ?? '')} onChange={(e) => set('target_return_pct', e.target.value)} />
            <Input label="Payout day of month (optional)" inputMode="numeric" value={String(f.payout_day ?? '')} onChange={(e) => set('payout_day', e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[13.5px] font-bold">Carry losses forward</div><div className="text-2 text-[12.5px]">A losing month is made up from later profits before they earn again (standard and fair to the company).</div></div>
            <Switch checked={!!f.carry_losses} onChange={(v) => set('carry_losses', v)} />
          </div>
        </div>
        {isNew && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Amount invested (USD)" inputMode="decimal" placeholder="e.g. 10000" value={String(f.initial ?? '')} onChange={(e) => set('initial', e.target.value)} leading={<span className="text-[13px] font-bold">$</span>} />
            <Picker label="Invested in" value={String(f.initialMonth)} onChange={(v) => set('initialMonth', v)} options={monthOptions(knownMonths)} />
          </div>
        )}
        <div>
          <div className="label mb-1.5">Card colour</div>
          <div className="flex gap-2">{COLORS.map((c) => (
            <button key={c} type="button" aria-label={c} onClick={() => set('color', c)} className={clsx('size-8 rounded-full ring-offset-2 ring-offset-transparent', f.color === c && 'ring-2 ring-[color:var(--text)]')} style={{ background: c }} />
          ))}</div>
        </div>
        <Textarea label="Agreement terms" rows={4} placeholder="Key terms: amount, share, payout timing, notice period, exit/buy-out, reporting…" value={String(f.agreement ?? '')} onChange={(e) => set('agreement', e.target.value)} />
        <Textarea label="Private notes" rows={2} value={String(f.notes ?? '')} onChange={(e) => set('notes', e.target.value)} />
      </div>
    </Sheet>
  );
}
