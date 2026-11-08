/**
 * The finance vault's calculation engine.
 *
 * Everything shown in the vault is worked out here from two kinds of rows the
 * owner types: money entries (each a month, a kind, an amount in USD, and
 * optionally the investor whose team it belongs to) and monthly numbers
 * (agents, leads, clients, hours, and the month-end balance sheet). Nothing is
 * stored twice, so changing one entry changes every total, ratio, investor
 * share and report that uses it, at once.
 *
 * Company figures include every entry (the company's own and every investor
 * team's). An investor's figures use only their team's entries.
 */

/* ===================================================================== types */
export type Kind =
  | 'revenue' | 'refund' | 'other_income' | 'direct_cost' | 'commission' | 'salary' | 'rent' | 'marketing' | 'software'
  | 'expense' | 'depreciation' | 'interest' | 'tax' | 'capital_in' | 'capital_out' | 'payout' | 'capex';

export interface VEntry {
  id: number; month: string; investor_id: number | null; kind: Kind; category_id: number | null; label: string | null;
  amount: number; currency: 'USD' | 'PKR'; original_amount: number | null; fx: number | null; recurring: boolean; note: string | null;
}
export interface VStats { id: number; month: string; investor_id: number | null; data: Record<string, number | null> }
export interface VCategory { id: number; kind: Kind; name: string; note: string | null; acquisition: boolean; archived: boolean }
export type ShareBasis = 'net_profit' | 'gross_profit' | 'revenue';
export interface VInvestor {
  id: number; name: string; company: string | null; email: string | null; phone: string | null; joined_on: string | null;
  share_pct: number; share_basis: ShareBasis; carry_losses: boolean; target_return_pct: number | null; payout_day: number | null;
  agreement: string | null; notes: string | null; color: string | null; status: 'active' | 'paused' | 'exited';
}
export interface VSettings {
  company?: string; pkr_rate?: number; tax_rate?: number; report_note?: string; signatory?: string;
}

/* ===================================================== the kinds of money */
export type Section = 'income' | 'cost_of_sales' | 'operating' | 'below' | 'tax' | 'capital' | 'investing';
export const KINDS: Record<Kind, { label: string; plain: string; section: Section; color: string }> = {
  revenue: { label: 'Revenue', plain: 'Money clients paid us for work (sales, projects, retainers, ebooks).', section: 'income', color: '#30C46C' },
  refund: { label: 'Refunds & chargebacks', plain: 'Money we gave back to clients. Taken off revenue.', section: 'income', color: '#FF6B6B' },
  direct_cost: { label: 'Cost of delivery', plain: 'Costs of doing the client work itself: freelancers, client hosting, payment fees.', section: 'cost_of_sales', color: '#FF9F43' },
  commission: { label: 'Commissions paid', plain: 'Commission paid to closers, setters and referrers for winning clients.', section: 'cost_of_sales', color: '#F368E0' },
  salary: { label: 'Salaries & wages', plain: 'Fixed monthly pay for the team.', section: 'operating', color: '#7C5CFF' },
  rent: { label: 'Rent & office', plain: 'Office rent, electricity, internet and other running costs of the space.', section: 'operating', color: '#54A0FF' },
  marketing: { label: 'Marketing & leads', plain: 'Ads, Bark credits, lead lists: money spent to find new clients.', section: 'operating', color: '#00D2D3' },
  software: { label: 'Software & tools', plain: 'Subscriptions: CRM, Zoom, design and dev tools, servers.', section: 'operating', color: '#5F27CD' },
  expense: { label: 'Other operating expenses', plain: 'Everything else it costs to run the company: legal, accounting, bank charges, travel.', section: 'operating', color: '#C8D6E5' },
  depreciation: { label: 'Depreciation & amortisation', plain: 'The part of an asset (laptop, furniture) "used up" this month. Not cash leaving.', section: 'below', color: '#8395A7' },
  interest: { label: 'Interest & finance costs', plain: 'Interest paid on loans and finance charges.', section: 'below', color: '#576574' },
  other_income: { label: 'Other income', plain: 'Income not from client work: bank interest, currency gains.', section: 'below', color: '#1DD1A1' },
  tax: { label: 'Taxes', plain: 'Income tax, sales tax/GST paid over, withholding tax.', section: 'tax', color: '#EE5253' },
  capital_in: { label: 'Investment received', plain: 'Money an investor put into the company. Not revenue: it is owed back as capital.', section: 'capital', color: '#10AC84' },
  capital_out: { label: 'Capital returned', plain: 'Part of an investor\'s original investment handed back to them.', section: 'capital', color: '#FECA57' },
  payout: { label: 'Profit share paid out', plain: 'Profit share actually paid to an investor (a distribution).', section: 'capital', color: '#FF9FF3' },
  capex: { label: 'Equipment & assets bought', plain: 'Buying things that last over a year (laptops, furniture). Cash out, but not a monthly expense.', section: 'investing', color: '#48DBFB' },
};
export const KIND_ORDER: Kind[] = ['revenue', 'refund', 'direct_cost', 'commission', 'salary', 'rent', 'marketing', 'software', 'expense',
  'depreciation', 'interest', 'other_income', 'tax', 'capex', 'capital_in', 'capital_out', 'payout'];
/** Kinds that only make sense against one investor. */
export const INVESTOR_ONLY: Kind[] = ['capital_in', 'capital_out', 'payout'];

/* ===================================================== monthly numbers */
export interface StatField { key: string; label: string; def: string; scope: 'both' | 'company'; kind: 'flow' | 'snapshot' }
export const STAT_FIELDS: StatField[] = [
  { key: 'agents', label: 'Agents on the team', def: 'Sales agents working this month (closers and setters).', scope: 'both', kind: 'snapshot' },
  { key: 'headcount', label: 'Total staff', def: 'Everyone on payroll this month, sales and production.', scope: 'both', kind: 'snapshot' },
  { key: 'leads', label: 'New leads', def: 'Fresh leads received or bought this month.', scope: 'both', kind: 'flow' },
  { key: 'meetings', label: 'Sales meetings held', def: 'Discovery or sales calls that actually happened.', scope: 'both', kind: 'flow' },
  { key: 'new_clients', label: 'Clients closed', def: 'New clients who signed and paid this month.', scope: 'both', kind: 'flow' },
  { key: 'clients_start', label: 'Active clients at start', def: 'Paying clients on the first day of the month.', scope: 'both', kind: 'snapshot' },
  { key: 'clients_end', label: 'Active clients at end', def: 'Paying clients on the last day of the month.', scope: 'both', kind: 'snapshot' },
  { key: 'clients_lost', label: 'Clients lost', def: 'Clients who stopped paying or cancelled this month (churn).', scope: 'both', kind: 'flow' },
  { key: 'billable_hours', label: 'Billable hours', def: 'Hours of work billed or billable to clients.', scope: 'both', kind: 'flow' },
  { key: 'available_hours', label: 'Available hours', def: 'Total working hours the production team had.', scope: 'both', kind: 'flow' },
  { key: 'cash', label: 'Cash in bank (month end)', def: 'All money in bank accounts, PayPal and cash on the last day.', scope: 'company', kind: 'snapshot' },
  { key: 'receivables', label: 'Owed to us (month end)', def: 'Invoices sent that clients have not paid yet (accounts receivable).', scope: 'company', kind: 'snapshot' },
  { key: 'other_assets', label: 'Other short-term assets', def: 'Deposits, advances and anything else turning into cash within a year.', scope: 'company', kind: 'snapshot' },
  { key: 'fixed_assets', label: 'Equipment value (book)', def: 'What laptops, furniture and other assets are worth after depreciation.', scope: 'company', kind: 'snapshot' },
  { key: 'payables', label: 'Bills we owe (month end)', def: 'Bills received but not paid yet (accounts payable), incl. unpaid salaries.', scope: 'company', kind: 'snapshot' },
  { key: 'other_liabilities', label: 'Other short-term debts', def: 'Taxes due, client advances (deferred revenue), credit cards.', scope: 'company', kind: 'snapshot' },
  { key: 'debt', label: 'Loans outstanding', def: 'Money borrowed that still has to be repaid.', scope: 'company', kind: 'snapshot' },
];

/* =================================================================== months */
export const monthKey = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(`${d.slice(0, 7)}-01T00:00:00Z`) : new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-01`;
};
export function addMonths(m: string, n: number) {
  const y = Number(m.slice(0, 4)); const mo = Number(m.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, mo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
export function monthRange(from: string, to: string) {
  const out: string[] = [];
  for (let m = monthKey(from); m <= monthKey(to) && out.length < 600; m = addMonths(m, 1)) out.push(m);
  return out;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (m: string, long = false) => `${(long ? MONTHS_LONG : MONTHS)[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const periodLabel = (months: string[]) =>
  !months.length ? '—' : months.length === 1 ? monthLabel(months[0], true) : `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`;

/* ================================================================ helpers */
const safe = (a: number, b: number): number | null => (b && Number.isFinite(a / b) ? a / b : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
type Scope = 'company' | number;
const inScope = (scope: Scope, investorId: number | null) => scope === 'company' || investorId === scope;

export type KindTotals = Record<Kind, number>;
export const emptyKinds = (): KindTotals => Object.fromEntries(KIND_ORDER.map((k) => [k, 0])) as KindTotals;

export function kindTotals(entries: VEntry[], months: string[], scope: Scope): KindTotals {
  const set = new Set(months);
  const t = emptyKinds();
  for (const e of entries) if (set.has(e.month) && inScope(scope, e.investor_id)) t[e.kind] += Number(e.amount);
  return t;
}

/** The profit and loss for a set of kind totals. */
export interface PnL {
  grossRevenue: number; refunds: number; revenue: number; costOfSales: number; grossProfit: number;
  opex: number; ebitda: number; depreciation: number; ebit: number; interest: number; otherIncome: number; ebt: number;
  tax: number; netProfit: number; capex: number; capitalIn: number; capitalOut: number; payouts: number;
  operatingCashFlow: number; freeCashFlow: number; netCashFlow: number;
}
export function pnl(t: KindTotals): PnL {
  const revenue = t.revenue - t.refund;
  const costOfSales = t.direct_cost + t.commission;
  const grossProfit = revenue - costOfSales;
  const opex = t.salary + t.rent + t.marketing + t.software + t.expense;
  const ebitda = grossProfit - opex;
  const ebit = ebitda - t.depreciation;
  const ebt = ebit - t.interest + t.other_income;
  const netProfit = ebt - t.tax;
  const operatingCashFlow = netProfit + t.depreciation;
  const freeCashFlow = operatingCashFlow - t.capex;
  return {
    grossRevenue: t.revenue, refunds: t.refund, revenue, costOfSales, grossProfit, opex, ebitda, depreciation: t.depreciation, ebit,
    interest: t.interest, otherIncome: t.other_income, ebt, tax: t.tax, netProfit, capex: t.capex,
    capitalIn: t.capital_in, capitalOut: t.capital_out, payouts: t.payout,
    operatingCashFlow, freeCashFlow, netCashFlow: freeCashFlow + t.capital_in - t.capital_out - t.payout,
  };
}

/* ================================================================== stats */
/** One month's numbers for a scope. Company flows fall back to the sum of the investor teams. */
export function statFor(stats: VStats[], month: string, scope: Scope, key: string): number | null {
  if (scope !== 'company') {
    const v = stats.find((s) => s.month === month && s.investor_id === scope)?.data?.[key];
    return v == null || v === ('' as never) ? null : Number(v);
  }
  const own = stats.find((s) => s.month === month && s.investor_id == null)?.data?.[key];
  if (own != null && own !== ('' as never)) return Number(own);
  const field = STAT_FIELDS.find((f) => f.key === key);
  if (field?.scope === 'company') return null;
  const parts = stats.filter((s) => s.month === month && s.investor_id != null).map((s) => s.data?.[key]).filter((v) => v != null && v !== ('' as never));
  return parts.length ? sum(parts.map(Number)) : null;
}
const flowSum = (stats: VStats[], months: string[], scope: Scope, key: string) => {
  const vs = months.map((m) => statFor(stats, m, scope, key)).filter((v): v is number => v != null);
  return vs.length ? sum(vs) : null;
};
const snapAvg = (stats: VStats[], months: string[], scope: Scope, key: string) => {
  const vs = months.map((m) => statFor(stats, m, scope, key)).filter((v): v is number => v != null);
  return vs.length ? sum(vs) / vs.length : null;
};
/** The latest month in range that has the number. */
const snapLast = (stats: VStats[], months: string[], scope: Scope, key: string) => {
  for (let i = months.length - 1; i >= 0; i--) { const v = statFor(stats, months[i], scope, key); if (v != null) return v; }
  return null;
};

/* ============================================================== investors */
export interface InvestorMonth {
  month: string; pnl: PnL; kinds: KindTotals; basis: number; lossCarriedIn: number; lossOffset: number; shareable: number;
  share: number; paid: number; capitalIn: number; capitalOut: number;
  earnedToDate: number; paidToDate: number; owedToDate: number; investedToDate: number; returnedToDate: number;
  agents: number | null; clientsClosed: number | null;
}
export const basisOf = (p: PnL, basis: ShareBasis) => (basis === 'revenue' ? p.revenue : basis === 'gross_profit' ? p.grossProfit : p.netProfit);
export const BASIS_LABEL: Record<ShareBasis, string> = { net_profit: 'net profit', gross_profit: 'gross profit', revenue: 'revenue' };

/** The investor's account month by month, from their first entry to `until`. */
export function investorLedger(inv: VInvestor, entries: VEntry[], stats: VStats[], until: string): InvestorMonth[] {
  const mine = entries.filter((e) => e.investor_id === inv.id);
  const first = [inv.joined_on ? monthKey(inv.joined_on) : null, ...mine.map((e) => e.month)].filter(Boolean).sort()[0] as string | undefined;
  if (!first) return [];
  const start = first <= until ? first : until;
  let carry = 0; let earned = 0; let paid = 0; let invested = 0; let returned = 0;
  return monthRange(start, until).map((month) => {
    const kinds = kindTotals(mine, [month], inv.id);
    const p = pnl(kinds);
    const basis = basisOf(p, inv.share_basis);
    const lossCarriedIn = carry;
    let lossOffset = 0; let shareable = 0;
    if (basis < 0) { if (inv.carry_losses) carry += -basis; }
    else { lossOffset = inv.carry_losses ? Math.min(carry, basis) : 0; carry -= lossOffset; shareable = basis - lossOffset; }
    const share = round2((shareable * Number(inv.share_pct)) / 100);
    earned += share; paid += kinds.payout; invested += kinds.capital_in; returned += kinds.capital_out;
    return {
      month, pnl: p, kinds, basis, lossCarriedIn, lossOffset, shareable, share, paid: kinds.payout, capitalIn: kinds.capital_in, capitalOut: kinds.capital_out,
      earnedToDate: round2(earned), paidToDate: round2(paid), owedToDate: round2(earned - paid), investedToDate: invested, returnedToDate: returned,
      agents: statFor(stats, month, inv.id, 'agents'), clientsClosed: statFor(stats, month, inv.id, 'new_clients'),
    };
  });
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monthly internal rate of return by bisection; flows[i] is the net cash to the investor in month i. */
export function irr(flows: number[]): number | null {
  if (!flows.some((f) => f < 0) || !flows.some((f) => f > 0)) return null;
  const npv = (r: number) => flows.reduce((a, f, i) => a + f / (1 + r) ** i, 0);
  let lo = -0.9999; let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface InvestorSummary {
  invested: number; returnedCapital: number; netCapital: number; earned: number; paid: number; owed: number;
  roi: number | null; cashOnCash: number | null; moic: number | null; annualRoi: number | null; irrAnnual: number | null;
  paybackProgress: number | null; monthsToPayback: number | null; avgMonthlyShare: number; months: number; vsTarget: number | null;
}
export function investorSummary(inv: VInvestor, ledger: InvestorMonth[]): InvestorSummary {
  const last = ledger[ledger.length - 1];
  const invested = last?.investedToDate ?? 0; const returnedCapital = last?.returnedToDate ?? 0;
  const earned = last?.earnedToDate ?? 0; const paid = last?.paidToDate ?? 0; const owed = earned - paid;
  const firstIn = ledger.findIndex((r) => r.capitalIn > 0);
  const months = firstIn < 0 ? 0 : ledger.length - firstIn;
  const roi = safe(earned, invested);
  // Their capital stays theirs (it sits in their capital account), so the closing value is what is owed plus capital not yet returned.
  const flows = ledger.slice(Math.max(0, firstIn)).map((r) => -r.capitalIn + r.paid + r.capitalOut);
  if (flows.length) flows[flows.length - 1] += owed + (invested - returnedCapital);
  const mIrr = irr(flows);
  const recent = ledger.slice(-3);
  const avgMonthlyShare = recent.length ? sum(recent.map((r) => r.share)) / recent.length : 0;
  const back = paid + returnedCapital;
  const annualRoi = roi != null && months > 0 ? (1 + roi) ** (12 / months) - 1 : null;
  return {
    invested, returnedCapital, netCapital: invested - returnedCapital, earned, paid, owed,
    roi, cashOnCash: safe(paid + returnedCapital, invested), moic: safe(paid + returnedCapital + owed + (invested - returnedCapital), invested),
    annualRoi: Number.isFinite(annualRoi as number) ? annualRoi : null,
    irrAnnual: mIrr == null || months < 2 ? null : (1 + mIrr) ** 12 - 1,
    paybackProgress: safe(back, invested), monthsToPayback: invested > back && avgMonthlyShare > 0 ? (invested - back) / avgMonthlyShare : invested > 0 && back >= invested ? 0 : null,
    avgMonthlyShare, months,
    vsTarget: inv.target_return_pct != null && annualRoi != null ? annualRoi - Number(inv.target_return_pct) / 100 : null,
  };
}

/* ============================================================ the report */
export interface Report {
  scope: Scope; months: string[]; kinds: KindTotals; pnl: PnL; prev: PnL | null; metrics: Record<string, number | null>;
  investorShares: number; byMonth: { month: string; pnl: PnL }[];
}

/**
 * Every metric for a scope and period. `all` = all entries (for to-date figures like equity and ROI).
 * `investors` lets the company report take the investors' profit shares off its own profit.
 */
export function buildReport(opts: {
  scope: Scope; months: string[]; entries: VEntry[]; stats: VStats[]; categories: VCategory[]; investors: VInvestor[];
  /** Planning tax rate, 0..1, for the suggested tax reserve. */
  taxRate?: number;
}): Report {
  const { scope, months, entries, stats, categories, investors } = opts;
  const n = months.length || 1;
  const kinds = kindTotals(entries, months, scope);
  const p = pnl(kinds);
  const prevMonths = months.length ? monthRange(addMonths(months[0], -months.length), addMonths(months[0], -1)) : [];
  const prevKinds = kindTotals(entries, prevMonths, scope);
  const hasPrev = entries.some((e) => prevMonths.includes(e.month) && inScope(scope, e.investor_id));
  const prev = hasPrev ? pnl(prevKinds) : null;
  const byMonth = months.map((m) => ({ month: m, pnl: pnl(kindTotals(entries, [m], scope)) }));
  const end = months[months.length - 1] ?? monthKey(new Date());

  // Acquisition spend: all marketing, plus commission/salary/software/expense lines whose type counts toward acquisition.
  const acqCats = new Set(categories.filter((c) => c.acquisition).map((c) => c.id));
  const set = new Set(months);
  const acquisition = sum(entries.filter((e) => set.has(e.month) && inScope(scope, e.investor_id)
    && (e.kind === 'marketing' || (e.category_id != null && acqCats.has(e.category_id)))).map((e) => Number(e.amount)));
  const recurring = (ms: string[]) => sum(entries.filter((e) => ms.includes(e.month) && inScope(scope, e.investor_id) && e.kind === 'revenue' && e.recurring).map((e) => Number(e.amount)));

  // Investors' profit shares in this period.
  const invs = scope === 'company' ? investors : investors.filter((i) => i.id === scope);
  let investorShares = 0;
  for (const inv of invs) investorShares += sum(investorLedger(inv, entries, stats, end).filter((r) => set.has(r.month)).map((r) => r.share));

  // To-date (everything up to the period end) for balance-sheet style figures.
  const toDate = entries.filter((e) => e.month <= end);
  const allKinds = kindTotals(toDate, [...new Set(toDate.map((e) => e.month))], scope);
  const allP = pnl(allKinds);
  const equity = allKinds.capital_in - allKinds.capital_out + allP.netProfit - allKinds.payout;

  const leads = flowSum(stats, months, scope, 'leads');
  const meetings = flowSum(stats, months, scope, 'meetings');
  const newClients = flowSum(stats, months, scope, 'new_clients');
  const lost = flowSum(stats, months, scope, 'clients_lost');
  const startSum = flowSum(stats, months, scope, 'clients_start');
  const avgActive = (() => {
    const vs = months.map((m) => {
      const a = statFor(stats, m, scope, 'clients_start'); const b = statFor(stats, m, scope, 'clients_end');
      return a != null && b != null ? (a + b) / 2 : a ?? b;
    }).filter((v): v is number => v != null);
    return vs.length ? sum(vs) / vs.length : null;
  })();
  const agents = snapAvg(stats, months, scope, 'agents');
  const headcount = snapAvg(stats, months, scope, 'headcount');
  const billable = flowSum(stats, months, scope, 'billable_hours');
  const available = flowSum(stats, months, scope, 'available_hours');
  const cash = snapLast(stats, months, scope, 'cash');
  const ar = snapLast(stats, months, scope, 'receivables');
  const otherAssets = snapLast(stats, months, scope, 'other_assets') ?? 0;
  const ap = snapLast(stats, months, scope, 'payables');
  const otherLiab = snapLast(stats, months, scope, 'other_liabilities') ?? 0;
  const debt = snapLast(stats, months, scope, 'debt');
  const currentLiab = ap != null || otherLiab ? (ap ?? 0) + otherLiab : null;
  const currentAssets = cash != null || ar != null ? (cash ?? 0) + (ar ?? 0) + otherAssets : null;

  const gm = safe(p.grossProfit, p.revenue);
  const monthlyRev = p.revenue / n;
  const arpa = avgActive ? monthlyRev / avgActive : null;
  const churn = lost != null && startSum ? lost / startSum : null; // monthly churn (lost ÷ clients at the starts)
  const lifetime = churn ? 1 / churn : null;
  const cac = newClients ? acquisition / newClients : null;
  const ltv = arpa != null && gm != null && lifetime != null ? arpa * gm * lifetime : null;
  const fixedMonthly = (kinds.salary + kinds.rent + kinds.software + kinds.expense + kinds.interest) / n;
  const variableRatio = safe(kinds.direct_cost + kinds.commission + kinds.marketing, p.revenue);
  const contribution = variableRatio != null ? 1 - variableRatio : null;
  const totalCosts = p.costOfSales + p.opex + kinds.depreciation + kinds.interest + kinds.tax;
  const cashCosts = p.costOfSales + p.opex + kinds.interest + kinds.tax;
  const netBurn = p.netCashFlow < 0 ? -p.netCashFlow / n : 0;
  const mrr = recurring([end]);
  const prevRev = prev?.revenue ?? null;
  const growth = prevRev ? (p.revenue - prevRev) / Math.abs(prevRev) : null;
  const ebitdaMargin = safe(p.ebitda, p.revenue);
  const investedToDate = allKinds.capital_in;

  const metrics: Record<string, number | null> = {
    // P&L
    gross_revenue: p.grossRevenue, refunds: p.refunds, revenue: p.revenue, cogs: p.costOfSales, gross_profit: p.grossProfit,
    opex: p.opex, ebitda: p.ebitda, ebit: p.ebit, ebt: p.ebt, net_profit: p.netProfit, investor_shares: investorShares,
    retained_profit: p.netProfit - investorShares, total_costs: totalCosts, avg_monthly_revenue: monthlyRev, avg_monthly_profit: p.netProfit / n,
    // margins
    gross_margin: gm, operating_margin: safe(p.ebit, p.revenue), ebitda_margin: ebitdaMargin, net_margin: safe(p.netProfit, p.revenue),
    contribution_margin: contribution, cti: safe(p.costOfSales + p.opex, p.revenue + p.otherIncome), opex_ratio: safe(p.opex, p.revenue),
    payroll_ratio: safe(kinds.salary + kinds.commission, p.revenue), marketing_ratio: safe(kinds.marketing, p.revenue), refund_rate: safe(p.refunds, p.grossRevenue),
    // growth
    revenue_growth: growth, profit_growth: prev && prev.netProfit ? (p.netProfit - prev.netProfit) / Math.abs(prev.netProfit) : null,
    mrr, arr: mrr * 12, recurring_share: safe(recurring(months), p.grossRevenue), rule_of_40: growth != null && ebitdaMargin != null ? growth + ebitdaMargin : null,
    // clients & sales
    new_clients: newClients, cac, cpl: leads ? kinds.marketing / leads : null, lead_conversion: newClients != null && leads ? newClients / leads : null,
    close_rate: newClients != null && meetings ? newClients / meetings : null, arpa, avg_deal: newClients ? p.grossRevenue / newClients : null,
    churn, retention: churn != null ? 1 - churn : null, lifetime_months: lifetime, ltv, ltv_cac: ltv != null && cac ? ltv / cac : null,
    cac_payback: cac != null && arpa && gm ? cac / (arpa * gm) : null, acquisition_spend: acquisition,
    roas: kinds.marketing ? p.revenue / kinds.marketing : null, romi: kinds.marketing ? (p.grossProfit - kinds.marketing) / kinds.marketing : null,
    // team
    agents, revenue_per_agent: agents ? monthlyRev / agents : null, profit_per_agent: agents ? p.netProfit / n / agents : null,
    revenue_per_employee: headcount ? monthlyRev / headcount : null, clients_per_agent: agents && newClients != null ? newClients / n / agents : null,
    utilization: billable != null && available ? billable / available : null, effective_rate: billable ? p.revenue / billable : null,
    commission_rate: safe(kinds.commission, p.revenue),
    // cash & liquidity
    operating_cash_flow: p.operatingCashFlow, free_cash_flow: p.freeCashFlow, net_cash_flow: p.netCashFlow,
    gross_burn: cashCosts / n, net_burn: netBurn, runway: cash != null && netBurn > 0 ? cash / netBurn : null, cash,
    break_even: gm ? fixedMonthly / gm : null, break_even_gap: gm ? monthlyRev - fixedMonthly / gm : null,
    dso: ar != null && p.revenue ? ar / (p.revenue / (n * 30)) : null, dpo: ap != null && cashCosts ? ap / (cashCosts / (n * 30)) : null,
    working_capital: currentAssets != null || currentLiab != null ? (currentAssets ?? 0) - (currentLiab ?? 0) : null,
    current_ratio: currentAssets != null && currentLiab ? currentAssets / currentLiab : null,
    quick_ratio: (cash != null || ar != null) && currentLiab ? ((cash ?? 0) + (ar ?? 0)) / currentLiab : null,
    cash_ratio: cash != null && currentLiab ? cash / currentLiab : null,
    // balance sheet & returns
    capital_invested: investedToDate, equity, debt, debt_to_equity: debt != null && equity > 0 ? debt / equity : null,
    roi: investedToDate ? p.netProfit / investedToDate : null, roi_to_date: investedToDate ? allP.netProfit / investedToDate : null,
    roe: equity > 0 ? p.netProfit / equity : null, roa: currentAssets != null ? safe(p.netProfit, currentAssets + (snapLast(stats, months, scope, 'fixed_assets') ?? 0)) : null,
    interest_coverage: kinds.interest ? p.ebit / kinds.interest : null, capex: kinds.capex, distributions: kinds.payout,
    // tax
    tax: kinds.tax, effective_tax_rate: p.ebt > 0 ? kinds.tax / p.ebt : null,
    tax_reserve: p.ebt > 0 && opts.taxRate ? p.ebt * opts.taxRate : null,
  };
  return { scope, months, kinds, pnl: p, prev, metrics, investorShares, byMonth };
}

/* ======================================================= metric registry */
export type Fmt = 'usd' | 'pct' | 'x' | 'months' | 'num' | 'days' | 'usdh';
export interface MetricDef {
  key: string; name: string; abbr?: string; group: string; def: string; formula: string; fmt: Fmt;
  better?: 'higher' | 'lower'; simple?: boolean; needs?: string; good?: string;
}
export const METRIC_GROUPS = ['Profit & loss', 'Margins', 'Growth', 'Clients & sales', 'Team & productivity', 'Cash & liquidity', 'Returns & balance sheet', 'Tax'] as const;

export const METRICS: MetricDef[] = [
  // Profit & loss
  { key: 'gross_revenue', name: 'Gross revenue', group: 'Profit & loss', fmt: 'usd', better: 'higher', def: 'Everything clients paid before refunds.', formula: 'Sum of revenue entries' },
  { key: 'refunds', name: 'Refunds & chargebacks', group: 'Profit & loss', fmt: 'usd', better: 'lower', def: 'Money handed back to clients.', formula: 'Sum of refund entries' },
  { key: 'revenue', name: 'Net revenue', abbr: 'Revenue', group: 'Profit & loss', fmt: 'usd', better: 'higher', simple: true, def: 'What we actually earned from clients after refunds: the "top line".', formula: 'Gross revenue − refunds' },
  { key: 'cogs', name: 'Cost of sales', abbr: 'COGS', group: 'Profit & loss', fmt: 'usd', better: 'lower', def: 'Costs directly caused by doing and selling the work: freelancers, client hosting, payment fees, commissions.', formula: 'Cost of delivery + commissions' },
  { key: 'gross_profit', name: 'Gross profit', group: 'Profit & loss', fmt: 'usd', better: 'higher', simple: true, def: 'What is left from revenue after paying for the work itself, before running costs like salaries and rent.', formula: 'Net revenue − cost of sales' },
  { key: 'opex', name: 'Operating expenses', abbr: 'OPEX', group: 'Profit & loss', fmt: 'usd', better: 'lower', def: 'The cost of running the company: salaries, rent, marketing, software and other overheads.', formula: 'Salaries + rent + marketing + software + other expenses' },
  { key: 'ebitda', name: 'EBITDA', abbr: 'EBITDA', group: 'Profit & loss', fmt: 'usd', better: 'higher', def: 'Earnings Before Interest, Taxes, Depreciation and Amortisation: profit from day-to-day operations, the number buyers and investors compare companies on.', formula: 'Gross profit − operating expenses' },
  { key: 'ebit', name: 'Operating profit', abbr: 'EBIT', group: 'Profit & loss', fmt: 'usd', better: 'higher', def: 'Earnings Before Interest and Taxes: EBITDA after the wear-and-tear of equipment.', formula: 'EBITDA − depreciation & amortisation' },
  { key: 'ebt', name: 'Profit before tax', abbr: 'EBT', group: 'Profit & loss', fmt: 'usd', better: 'higher', def: 'Profit after interest and other income, before tax.', formula: 'EBIT − interest + other income' },
  { key: 'net_profit', name: 'Net profit', abbr: 'Net income', group: 'Profit & loss', fmt: 'usd', better: 'higher', simple: true, def: 'The "bottom line": what the company truly made after every cost and tax.', formula: 'Profit before tax − taxes' },
  { key: 'investor_shares', name: 'Investor profit shares', group: 'Profit & loss', fmt: 'usd', def: 'What investors earned from their teams in this period under their agreements.', formula: 'Σ (each investor\'s basis after carried losses × their share %)' },
  { key: 'retained_profit', name: 'Profit kept by the company', group: 'Profit & loss', fmt: 'usd', better: 'higher', simple: true, def: 'Net profit left for the company after investors take their share.', formula: 'Net profit − investor profit shares' },
  { key: 'total_costs', name: 'Total costs', group: 'Profit & loss', fmt: 'usd', better: 'lower', simple: true, def: 'Every cost on the profit and loss, including tax.', formula: 'Cost of sales + OPEX + depreciation + interest + tax' },
  { key: 'avg_monthly_revenue', name: 'Average monthly revenue', group: 'Profit & loss', fmt: 'usd', better: 'higher', def: 'Net revenue per month across the period.', formula: 'Net revenue ÷ months' },
  { key: 'avg_monthly_profit', name: 'Average monthly profit', group: 'Profit & loss', fmt: 'usd', better: 'higher', def: 'Net profit per month across the period.', formula: 'Net profit ÷ months' },
  // Margins
  { key: 'gross_margin', name: 'Gross margin', abbr: 'GM %', group: 'Margins', fmt: 'pct', better: 'higher', simple: true, def: 'Of every $1 of revenue, how much is left after paying for the work itself.', formula: 'Gross profit ÷ net revenue', good: 'Agencies: 50–70% is healthy' },
  { key: 'operating_margin', name: 'Operating margin', abbr: 'EBIT %', group: 'Margins', fmt: 'pct', better: 'higher', def: 'Of every $1 of revenue, how much is operating profit.', formula: 'EBIT ÷ net revenue', good: 'Agencies: 15–25% is strong' },
  { key: 'ebitda_margin', name: 'EBITDA margin', group: 'Margins', fmt: 'pct', better: 'higher', def: 'EBITDA as a share of revenue.', formula: 'EBITDA ÷ net revenue', good: 'Agencies: 15–30%' },
  { key: 'net_margin', name: 'Net profit margin', group: 'Margins', fmt: 'pct', better: 'higher', simple: true, def: 'Of every $1 of revenue, how much ends as real profit.', formula: 'Net profit ÷ net revenue', good: 'Agencies: 10–20% is good' },
  { key: 'contribution_margin', name: 'Contribution margin', group: 'Margins', fmt: 'pct', better: 'higher', def: 'What each $1 of sales leaves to pay fixed costs, after costs that rise with sales (delivery, commission, marketing).', formula: '1 − (delivery + commission + marketing) ÷ revenue' },
  { key: 'cti', name: 'Cost-to-income ratio', abbr: 'CTI', group: 'Margins', fmt: 'pct', better: 'lower', simple: true, def: 'How many cents it costs to earn each $1 of income. Lower is more efficient.', formula: '(Cost of sales + OPEX) ÷ (revenue + other income)', good: 'Under 80% for an agency; under 60% is excellent' },
  { key: 'opex_ratio', name: 'Operating expense ratio', group: 'Margins', fmt: 'pct', better: 'lower', def: 'Running costs as a share of revenue.', formula: 'OPEX ÷ net revenue' },
  { key: 'payroll_ratio', name: 'Payroll ratio', group: 'Margins', fmt: 'pct', better: 'lower', def: 'Share of revenue spent on people (salaries + commissions).', formula: '(Salaries + commissions) ÷ net revenue', good: 'Agencies: 40–55%' },
  { key: 'marketing_ratio', name: 'Marketing spend ratio', group: 'Margins', fmt: 'pct', def: 'Share of revenue spent on marketing and leads.', formula: 'Marketing ÷ net revenue' },
  { key: 'commission_rate', name: 'Commission rate', group: 'Margins', fmt: 'pct', def: 'Commissions as a share of revenue.', formula: 'Commissions ÷ net revenue' },
  { key: 'refund_rate', name: 'Refund rate', group: 'Margins', fmt: 'pct', better: 'lower', def: 'Share of sales refunded or charged back.', formula: 'Refunds ÷ gross revenue', good: 'Keep under 5%' },
  // Growth
  { key: 'revenue_growth', name: 'Revenue growth', group: 'Growth', fmt: 'pct', better: 'higher', simple: true, def: 'How much revenue grew versus the same-length period just before.', formula: '(This period − previous period) ÷ previous period' },
  { key: 'profit_growth', name: 'Profit growth', group: 'Growth', fmt: 'pct', better: 'higher', def: 'How much net profit grew versus the previous period.', formula: '(This net profit − previous) ÷ |previous|' },
  { key: 'mrr', name: 'Monthly recurring revenue', abbr: 'MRR', group: 'Growth', fmt: 'usd', better: 'higher', def: 'Revenue that repeats every month (retainers, maintenance plans) in the last month of the period.', formula: 'Recurring revenue entries in the last month' },
  { key: 'arr', name: 'Annual recurring revenue', abbr: 'ARR', group: 'Growth', fmt: 'usd', better: 'higher', def: 'MRR as a yearly figure.', formula: 'MRR × 12' },
  { key: 'recurring_share', name: 'Recurring revenue share', group: 'Growth', fmt: 'pct', better: 'higher', def: 'How much of revenue repeats monthly. Higher means steadier income and a higher company valuation.', formula: 'Recurring revenue ÷ gross revenue' },
  { key: 'rule_of_40', name: 'Rule of 40', group: 'Growth', fmt: 'pct', better: 'higher', def: 'Growth % plus EBITDA margin %. Investors like it at 40% or more: it balances growing fast and making money.', formula: 'Revenue growth + EBITDA margin' },
  // Clients & sales
  { key: 'new_clients', name: 'Clients closed', group: 'Clients & sales', fmt: 'num', better: 'higher', simple: true, def: 'New clients won in the period.', formula: 'Sum of "Clients closed"', needs: 'Monthly numbers: Clients closed' },
  { key: 'acquisition_spend', name: 'Acquisition spend', group: 'Clients & sales', fmt: 'usd', def: 'Everything spent to win clients: marketing plus any commission, salary or tool types marked "counts toward CAC".', formula: 'Marketing + acquisition-type costs' },
  { key: 'cac', name: 'Customer acquisition cost', abbr: 'CAC', group: 'Clients & sales', fmt: 'usd', better: 'lower', simple: true, def: 'What it costs, on average, to win one new client.', formula: 'Acquisition spend ÷ clients closed', needs: 'Clients closed' },
  { key: 'cpl', name: 'Cost per lead', abbr: 'CPL', group: 'Clients & sales', fmt: 'usd', better: 'lower', def: 'Marketing spend for each lead received.', formula: 'Marketing ÷ new leads', needs: 'New leads' },
  { key: 'lead_conversion', name: 'Lead-to-client rate', group: 'Clients & sales', fmt: 'pct', better: 'higher', def: 'Share of leads that became paying clients.', formula: 'Clients closed ÷ new leads', needs: 'New leads, clients closed' },
  { key: 'close_rate', name: 'Meeting close rate', group: 'Clients & sales', fmt: 'pct', better: 'higher', def: 'Share of sales meetings that turned into a client.', formula: 'Clients closed ÷ meetings held', needs: 'Meetings held, clients closed' },
  { key: 'avg_deal', name: 'Average deal size', group: 'Clients & sales', fmt: 'usd', better: 'higher', def: 'Average revenue brought in per new client.', formula: 'Gross revenue ÷ clients closed', needs: 'Clients closed' },
  { key: 'arpa', name: 'Average revenue per client', abbr: 'ARPA', group: 'Clients & sales', fmt: 'usd', better: 'higher', def: 'Revenue per active client per month.', formula: 'Monthly revenue ÷ average active clients', needs: 'Active clients at start/end' },
  { key: 'churn', name: 'Client churn rate', group: 'Clients & sales', fmt: 'pct', better: 'lower', def: 'Share of clients lost each month.', formula: 'Clients lost ÷ active clients at start', needs: 'Clients lost, active at start' },
  { key: 'retention', name: 'Client retention rate', group: 'Clients & sales', fmt: 'pct', better: 'higher', def: 'Share of clients kept each month.', formula: '1 − churn rate' },
  { key: 'lifetime_months', name: 'Client lifetime', group: 'Clients & sales', fmt: 'months', better: 'higher', def: 'How long an average client stays paying.', formula: '1 ÷ monthly churn' },
  { key: 'ltv', name: 'Customer lifetime value', abbr: 'LTV / CLV', group: 'Clients & sales', fmt: 'usd', better: 'higher', simple: true, def: 'The gross profit one client brings over the whole time they stay with us.', formula: 'ARPA × gross margin × client lifetime', needs: 'Active clients, clients lost' },
  { key: 'ltv_cac', name: 'LTV to CAC ratio', abbr: 'LTV:CAC', group: 'Clients & sales', fmt: 'x', better: 'higher', simple: true, def: 'How many dollars of profit each $1 spent winning a client brings back.', formula: 'LTV ÷ CAC', good: '3× or more is healthy; under 1× loses money' },
  { key: 'cac_payback', name: 'CAC payback period', group: 'Clients & sales', fmt: 'months', better: 'lower', def: 'Months of a client\'s gross profit needed to earn back what it cost to win them.', formula: 'CAC ÷ (ARPA × gross margin)', good: 'Under 12 months' },
  { key: 'roas', name: 'Return on ad spend', abbr: 'ROAS', group: 'Clients & sales', fmt: 'x', better: 'higher', def: 'Revenue for each $1 of marketing.', formula: 'Net revenue ÷ marketing' },
  { key: 'romi', name: 'Return on marketing investment', abbr: 'ROMI', group: 'Clients & sales', fmt: 'pct', better: 'higher', def: 'Gross profit gained per $1 of marketing, after paying the marketing back.', formula: '(Gross profit − marketing) ÷ marketing' },
  // Team
  { key: 'agents', name: 'Agents (average)', group: 'Team & productivity', fmt: 'num', simple: true, def: 'Average number of sales agents working.', formula: 'Average of "Agents on the team"', needs: 'Agents on the team' },
  { key: 'revenue_per_agent', name: 'Revenue per agent', group: 'Team & productivity', fmt: 'usd', better: 'higher', def: 'Monthly revenue each agent brings in.', formula: 'Monthly revenue ÷ agents', needs: 'Agents' },
  { key: 'profit_per_agent', name: 'Profit per agent', group: 'Team & productivity', fmt: 'usd', better: 'higher', def: 'Monthly net profit per agent.', formula: 'Monthly net profit ÷ agents', needs: 'Agents' },
  { key: 'clients_per_agent', name: 'Clients per agent', group: 'Team & productivity', fmt: 'num', better: 'higher', def: 'New clients each agent closes per month.', formula: 'Monthly clients closed ÷ agents', needs: 'Agents, clients closed' },
  { key: 'revenue_per_employee', name: 'Revenue per employee', group: 'Team & productivity', fmt: 'usd', better: 'higher', def: 'Monthly revenue for each person on payroll.', formula: 'Monthly revenue ÷ total staff', needs: 'Total staff' },
  { key: 'utilization', name: 'Utilisation rate', group: 'Team & productivity', fmt: 'pct', better: 'higher', def: 'Share of the production team\'s time spent on billable client work.', formula: 'Billable hours ÷ available hours', good: 'Agencies aim for 70–80%', needs: 'Billable & available hours' },
  { key: 'effective_rate', name: 'Effective hourly rate', group: 'Team & productivity', fmt: 'usdh', better: 'higher', def: 'What we really earn per billable hour.', formula: 'Net revenue ÷ billable hours', needs: 'Billable hours' },
  // Cash
  { key: 'operating_cash_flow', name: 'Operating cash flow', abbr: 'OCF', group: 'Cash & liquidity', fmt: 'usd', better: 'higher', def: 'Cash made from running the business (profit with non-cash depreciation added back).', formula: 'Net profit + depreciation' },
  { key: 'free_cash_flow', name: 'Free cash flow', abbr: 'FCF', group: 'Cash & liquidity', fmt: 'usd', better: 'higher', simple: true, def: 'Cash left after running the business and buying equipment: what could be paid to owners and investors.', formula: 'Operating cash flow − equipment bought' },
  { key: 'net_cash_flow', name: 'Net cash flow', group: 'Cash & liquidity', fmt: 'usd', better: 'higher', def: 'Total change in cash, after investments received and payouts made.', formula: 'FCF + capital in − capital returned − payouts' },
  { key: 'cash', name: 'Cash in bank', group: 'Cash & liquidity', fmt: 'usd', better: 'higher', simple: true, def: 'Cash on hand at the end of the period.', formula: 'Month-end cash', needs: 'Cash in bank' },
  { key: 'gross_burn', name: 'Gross burn', group: 'Cash & liquidity', fmt: 'usd', def: 'Total cash spent per month to run the company.', formula: '(Cost of sales + OPEX + interest + tax) ÷ months' },
  { key: 'net_burn', name: 'Net burn', group: 'Cash & liquidity', fmt: 'usd', better: 'lower', def: 'Cash lost per month when spending is more than income. Zero means not burning cash.', formula: '−Net cash flow ÷ months (if negative)' },
  { key: 'runway', name: 'Cash runway', group: 'Cash & liquidity', fmt: 'months', better: 'higher', def: 'How many months the cash lasts at the current burn.', formula: 'Cash ÷ net burn', needs: 'Cash, and a month that burns cash' },
  { key: 'break_even', name: 'Break-even revenue', group: 'Cash & liquidity', fmt: 'usd', def: 'Monthly revenue needed to cover all fixed costs: below it we lose money.', formula: 'Monthly fixed costs ÷ gross margin' },
  { key: 'break_even_gap', name: 'Safety margin over break-even', group: 'Cash & liquidity', fmt: 'usd', better: 'higher', def: 'How far monthly revenue is above (or below) break-even.', formula: 'Monthly revenue − break-even revenue' },
  { key: 'dso', name: 'Days sales outstanding', abbr: 'DSO', group: 'Cash & liquidity', fmt: 'days', better: 'lower', def: 'Average days clients take to pay us.', formula: 'Receivables ÷ revenue per day', needs: 'Owed to us', good: 'Under 30 days' },
  { key: 'dpo', name: 'Days payables outstanding', abbr: 'DPO', group: 'Cash & liquidity', fmt: 'days', def: 'Average days we take to pay our bills.', formula: 'Payables ÷ costs per day', needs: 'Bills we owe' },
  { key: 'working_capital', name: 'Working capital', group: 'Cash & liquidity', fmt: 'usd', better: 'higher', def: 'Short-term money we have minus short-term money we owe.', formula: '(Cash + receivables + other assets) − (payables + other debts)', needs: 'Balance sheet numbers' },
  { key: 'current_ratio', name: 'Current ratio', group: 'Cash & liquidity', fmt: 'x', better: 'higher', def: 'Can we pay our short-term bills? Dollars of short-term assets per $1 owed.', formula: 'Current assets ÷ current liabilities', good: '1.5× to 3× is healthy', needs: 'Balance sheet numbers' },
  { key: 'quick_ratio', name: 'Quick ratio', abbr: 'Acid test', group: 'Cash & liquidity', fmt: 'x', better: 'higher', def: 'Same as current ratio but only counting cash and money owed to us.', formula: '(Cash + receivables) ÷ current liabilities', good: '1× or more', needs: 'Balance sheet numbers' },
  { key: 'cash_ratio', name: 'Cash ratio', group: 'Cash & liquidity', fmt: 'x', better: 'higher', def: 'Could we pay all short-term debts with cash today?', formula: 'Cash ÷ current liabilities', needs: 'Balance sheet numbers' },
  // Returns & balance sheet
  { key: 'capital_invested', name: 'Capital invested (to date)', group: 'Returns & balance sheet', fmt: 'usd', simple: true, def: 'All investment received up to the end of the period.', formula: 'Sum of investment received' },
  { key: 'roi', name: 'Return on investment', abbr: 'ROI', group: 'Returns & balance sheet', fmt: 'pct', better: 'higher', simple: true, def: 'Net profit in the period for every $1 investors put in.', formula: 'Net profit ÷ capital invested' },
  { key: 'roi_to_date', name: 'ROI to date', group: 'Returns & balance sheet', fmt: 'pct', better: 'higher', def: 'All net profit ever made for every $1 invested.', formula: 'Net profit to date ÷ capital invested' },
  { key: 'equity', name: "Owners' equity (book)", group: 'Returns & balance sheet', fmt: 'usd', better: 'higher', def: 'What the company is worth on paper to its owners: capital in, plus profits kept, minus payouts.', formula: 'Capital in − capital returned + net profit to date − payouts to date' },
  { key: 'roe', name: 'Return on equity', abbr: 'ROE', group: 'Returns & balance sheet', fmt: 'pct', better: 'higher', def: 'Profit made on the owners\' money in the business.', formula: 'Net profit ÷ equity' },
  { key: 'roa', name: 'Return on assets', abbr: 'ROA', group: 'Returns & balance sheet', fmt: 'pct', better: 'higher', def: 'Profit made for every $1 of assets the company holds.', formula: 'Net profit ÷ (current assets + equipment)', needs: 'Balance sheet numbers' },
  { key: 'debt', name: 'Loans outstanding', group: 'Returns & balance sheet', fmt: 'usd', better: 'lower', def: 'Borrowed money still owed.', formula: 'Month-end loans', needs: 'Loans outstanding' },
  { key: 'debt_to_equity', name: 'Debt-to-equity', abbr: 'D/E', group: 'Returns & balance sheet', fmt: 'x', better: 'lower', def: 'How much of the company runs on borrowed money versus owners\' money.', formula: 'Loans ÷ equity', good: 'Under 1×' },
  { key: 'interest_coverage', name: 'Interest coverage', group: 'Returns & balance sheet', fmt: 'x', better: 'higher', def: 'How many times operating profit covers interest payments.', formula: 'EBIT ÷ interest', good: 'Over 3×' },
  { key: 'capex', name: 'Capital expenditure', abbr: 'CAPEX', group: 'Returns & balance sheet', fmt: 'usd', def: 'Money spent on equipment and assets that last over a year.', formula: 'Sum of equipment & assets bought' },
  { key: 'distributions', name: 'Distributions paid', group: 'Returns & balance sheet', fmt: 'usd', def: 'Profit share actually paid out to investors in the period.', formula: 'Sum of payouts' },
  // Tax
  { key: 'tax', name: 'Taxes', group: 'Tax', fmt: 'usd', def: 'All taxes recorded in the period.', formula: 'Sum of tax entries' },
  { key: 'effective_tax_rate', name: 'Effective tax rate', group: 'Tax', fmt: 'pct', def: 'Share of pre-tax profit that went to tax.', formula: 'Taxes ÷ profit before tax' },
  { key: 'tax_reserve', name: 'Suggested tax reserve', group: 'Tax', fmt: 'usd', def: 'Cash to set aside for tax at your planning rate (Settings).', formula: 'Profit before tax × planning tax rate' },
];
export const metricDef = (k: string) => METRICS.find((m) => m.key === k);

/** Format a metric value. */
export function fmtValue(v: number | null | undefined, f: Fmt): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 })}`;
  switch (f) {
    case 'usd': return money(v);
    case 'usdh': return `${money(v)}/h`;
    case 'pct': return `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
    case 'x': return `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}×`;
    case 'months': return `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} mo`;
    case 'days': return `${Math.round(v)} days`;
    default: return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
}
export const money = (v: number | null | undefined) => fmtValue(v ?? 0, 'usd');
