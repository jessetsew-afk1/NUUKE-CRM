/**
 * Vault PDFs: the whole business, one investor's team, one kind of money or one type, as a short
 * summary or a detailed breakdown. Also the monthly investor statement. Clean, quiet layout: Inter,
 * lots of white, hairlines and soft grey cards.
 */
import { Document, Font, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { VaultData } from '@/data/vault';
import {
  BASIS_LABEL, KINDS, KIND_ORDER, METRICS, METRIC_GROUPS, addMonths, buildReport, fmtValue, investorLedger, investorSummary, monthLabel,
  monthRange, periodLabel, statFor, type Fmt, type InvestorMonth, type Kind, type VEntry, type VInvestor,
} from '@/lib/finance';

Font.register({
  family: 'Inter',
  fonts: [400, 500, 600, 700, 800].map((w) => ({ src: `${window.location.origin}/fonts/inter-${w}.woff`, fontWeight: w })),
});
// Don't break words across lines with hyphens.
Font.registerHyphenationCallback((w) => [w]);

const plain = (t: string) => t.replace(/≥/g, '>=').replace(/≤/g, '<=');
const f = (v: number | null | undefined, k: Fmt = 'usd') => plain(fmtValue(v, k));
/** Costs in brackets, the accountant's way. */
const neg = (v: number) => (v ? `(${f(Math.abs(v))})` : f(0));

const INK = '#1D1D1F'; const SOFT = '#6E6E73'; const FAINT = '#A1A1A6'; const LINE = '#E5E5EA'; const BG = '#F5F5F7';
const IRIS = '#5E5CE6'; const GOOD = '#248A3D'; const BAD = '#D70015';
const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 58, paddingHorizontal: 46, fontSize: 9, color: INK, fontFamily: 'Inter' },
  // No lineHeight on the page itself: it stops react-pdf drawing the page numbers.
  eyebrow: { fontSize: 7.5, fontWeight: 600, letterSpacing: 1.3, color: SOFT, textTransform: 'uppercase' },
  h1: { fontSize: 26, fontWeight: 700, letterSpacing: -0.7, marginTop: 7, lineHeight: 1.12 },
  sub: { fontSize: 10, color: SOFT, marginTop: 5, lineHeight: 1.35 },
  rule: { height: 0.8, backgroundColor: LINE, marginTop: 16, marginBottom: 16 },
  h2: { fontSize: 12.5, fontWeight: 700, letterSpacing: -0.25, marginTop: 20, marginBottom: 7 },
  h3: { fontSize: 8, fontWeight: 600, letterSpacing: 0.8, color: SOFT, textTransform: 'uppercase', marginTop: 10, marginBottom: 3 },
  cards: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, backgroundColor: BG, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12 },
  cardLabel: { fontSize: 7, color: SOFT, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 },
  cardValue: { fontSize: 16.5, fontWeight: 700, letterSpacing: -0.4, marginTop: 5, lineHeight: 1.2 },
  cardNote: { fontSize: 7.5, color: SOFT, marginTop: 4, lineHeight: 1.3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: LINE },
  rowStrong: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5.5, borderTopWidth: 0.9, borderTopColor: INK, marginTop: 1, marginBottom: 2 },
  label: { color: SOFT }, bold: { fontWeight: 700 },
  table: {},
  th: { flexDirection: 'row', backgroundColor: BG, borderRadius: 7, paddingVertical: 6, paddingHorizontal: 8 },
  td: { flexDirection: 'row', paddingVertical: 4.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: LINE },
  tfoot: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 0.9, borderTopColor: INK },
  thText: { fontSize: 7, color: SOFT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 },
  two: { flexDirection: 'row', gap: 24 },
  col: { flex: 1 },
  note: { fontSize: 7.8, color: SOFT, marginTop: 5, lineHeight: 1.4 },
  defs: { marginTop: 18, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: BG, borderRadius: 12 },
  def: { fontSize: 7.4, color: SOFT, marginBottom: 2, lineHeight: 1.4 },
  footer: { position: 'absolute', bottom: 24, left: 46, right: 46, flexDirection: 'row', fontSize: 7, color: FAINT },
  pageNo: { position: 'absolute', bottom: 24, right: 46, width: 60, textAlign: 'right', fontSize: 7, color: FAINT },
  mrow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  pill: { fontSize: 7, fontWeight: 700, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 5, marginTop: 5, alignSelf: 'flex-start', lineHeight: 1.2 },
});

/* ================================================================ parts */
const today = () => new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

function Header({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={s.eyebrow}>{plain(eyebrow)}</Text>
        <Text style={[s.eyebrow, { color: FAINT }]}>Confidential</Text>
      </View>
      <Text style={s.h1}>{plain(title)}</Text>
      <Text style={s.sub}>{plain(sub)}</Text>
      <View style={s.rule} />
    </View>
  );
}
const Line = ({ l, v, strong, color, indent }: { l: string; v: string; strong?: boolean; color?: string; indent?: boolean }) => (
  <View style={strong ? s.rowStrong : s.row} wrap={false}>
    <Text style={[strong ? s.bold : s.label, indent ? { paddingLeft: 10 } : {}]}>{plain(l)}</Text>
    <Text style={[strong ? s.bold : {}, color ? { color } : {}]}>{v}</Text>
  </View>
);
const Card = ({ label, value, note, accent, delta }: { label: string; value: string; note?: string; accent?: boolean; delta?: { text: string; good: boolean } | null }) => (
  <View style={[s.card, accent ? { backgroundColor: '#EEEEFC' } : {}]}>
    <Text style={s.cardLabel}>{plain(label)}</Text>
    <Text style={[s.cardValue, accent ? { color: IRIS } : {}]}>{value}</Text>
    {delta ? <Text style={[s.pill, { color: delta.good ? GOOD : BAD, backgroundColor: delta.good ? '#E3F4E8' : '#FCE4E6' }]}>{plain(delta.text)}</Text> : null}
    {note ? <Text style={s.cardNote}>{plain(note)}</Text> : null}
  </View>
);
function Table({ cols, rows, widths, foot, left = 1 }: { cols: string[]; rows: string[][]; widths: number[]; foot?: string[]; /** How many columns (from the left) are text, not numbers. */ left?: number }) {
  const cell = (i: number) => ({ flex: widths[i], textAlign: (i < left ? 'left' : 'right') as 'right' | 'left', paddingRight: i < widths.length - 1 ? 6 : 0 });
  return (
    <View style={s.table}>
      <View style={s.th} fixed>{cols.map((c, i) => <Text key={c} style={[s.thText, cell(i)]}>{c}</Text>)}</View>
      {rows.map((r, j) => (
        <View key={j} style={s.td} wrap={false}>{r.map((c, i) => <Text key={i} style={[cell(i), i === 0 ? {} : { fontWeight: i === r.length - 1 ? 600 : 400 }]}>{plain(c)}</Text>)}</View>
      ))}
      {foot ? <View style={s.tfoot} wrap={false}>{foot.map((c, i) => <Text key={i} style={[cell(i), s.bold]}>{plain(c)}</Text>)}</View> : null}
    </View>
  );
}
/** Labelled horizontal bars: where the money came from or went. */
function Bars({ items, total }: { items: { label: string; value: number; color: string; sub?: string }[]; total?: number }) {
  const max = Math.max(1, ...items.map((x) => Math.abs(x.value)));
  const all = total ?? items.reduce((a, x) => a + Math.max(0, x.value), 0);
  return (
    <View>
      {items.map((x) => (
        <View key={x.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3.2 }} wrap={false}>
          <Text style={{ width: 150, paddingRight: 8, color: SOFT }}>{plain(x.label)}</Text>
          <View style={{ flex: 1, height: 7, backgroundColor: BG, borderRadius: 4 }}>
            <View style={{ width: `${Math.max(1.5, (Math.abs(x.value) / max) * 100)}%`, height: 7, backgroundColor: x.color, borderRadius: 4 }} />
          </View>
          <Text style={{ width: 70, textAlign: 'right', fontWeight: 600 }}>{f(x.value)}</Text>
          <Text style={{ width: 38, textAlign: 'right', color: SOFT, fontSize: 7.5 }}>{all ? f(x.value / all, 'pct') : ''}</Text>
        </View>
      ))}
    </View>
  );
}
/** A small month-by-month column chart (one or two series). */
function MonthChart({ points, a, b, height = 92 }: {
  points: { month: string; a: number; b?: number }[]; a: { label: string; color: string }; b?: { label: string; color: string }; height?: number;
}) {
  const max = Math.max(1, ...points.flatMap((p) => [Math.abs(p.a), Math.abs(p.b ?? 0)]));
  const every = points.length > 18 ? 3 : points.length > 9 ? 2 : 1;
  return (
    <View wrap={false}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: points.length > 18 ? 2 : 4, borderBottomWidth: 0.6, borderBottomColor: LINE }}>
        {points.map((p) => (
          <View key={p.month} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1.5, height }}>
            <View style={{ width: b ? '42%' : '62%', height: Math.max(0.8, (Math.abs(p.a) / max) * (height - 4)), backgroundColor: a.color, borderTopLeftRadius: 2.5, borderTopRightRadius: 2.5 }} />
            {b ? <View style={{ width: '42%', height: Math.max(0.8, (Math.abs(p.b ?? 0) / max) * (height - 4)), backgroundColor: b.color, borderTopLeftRadius: 2.5, borderTopRightRadius: 2.5 }} /> : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: points.length > 18 ? 2 : 4, marginTop: 3 }}>
        {points.map((p, i) => <Text key={p.month} style={{ flex: 1, textAlign: 'center', fontSize: 6.3, color: FAINT }}>{i % every === 0 ? monthLabel(p.month).replace(' 20', " '") : ''}</Text>)}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
        {[a, b].filter(Boolean).map((x) => (
          <View key={x!.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: x!.color }} /><Text style={{ fontSize: 7.3, color: SOFT }}>{x!.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const Footer = ({ company, note, signatory }: { company: string; note?: string; signatory?: string }) => {
  const left = plain(`${company} · Confidential${signatory ? ` · Prepared by ${signatory}` : ''}${note ? ` · ${note}` : ''}`);
  return (
    <View style={s.footer} fixed>
      <Text style={{ flex: 1 }}>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
};
const Defs = ({ items }: { items: string[] }) => (
  <View style={s.defs} wrap={false}>
    <Text style={[s.bold, { fontSize: 8.5, marginBottom: 5 }]}>What these words mean</Text>
    {items.map((t) => <Text key={t} style={s.def}>{plain(t)}</Text>)}
  </View>
);
/** Compared with the period of the same length just before. */
function delta(now: number, before: number | null | undefined, higherIsBetter = true) {
  if (before == null || !before) return null;
  const d = (now - before) / Math.abs(before);
  if (!Number.isFinite(d)) return null;
  return { text: `${d >= 0 ? '+' : '-'}${f(Math.abs(d), 'pct')} vs previous`, good: higherIsBetter ? d >= 0 : d <= 0 };
}
const sumOf = (xs: VEntry[]) => xs.reduce((a, e) => a + Number(e.amount), 0);
const COST_KINDS: Kind[] = ['direct_cost', 'commission', 'salary', 'rent', 'marketing', 'software', 'expense', 'depreciation', 'interest', 'tax'];
const isInflow = (k: Kind) => k === 'revenue' || k === 'other_income' || k === 'capital_in';

/** Trim leading empty months so a long "All time" or 12-month period doesn't start with blank rows. */
function activeMonths(months: string[], has: (m: string) => boolean) {
  const first = months.findIndex(has);
  return first < 0 ? months : months.slice(first);
}
/* ========================================================= investor */
function InvestorDoc({ data, inv, month }: { data: VaultData; inv: VInvestor; month: string }) {
  const company = data.settings.company || 'NUUKE';
  const L = investorLedger(inv, data.entries, data.stats, month);
  const sum = investorSummary(inv, L);
  const r = L.find((x) => x.month === month);
  const ytd = L.filter((x) => x.month.slice(0, 4) === month.slice(0, 4));
  const total = (pick: (x: InvestorMonth) => number) => ytd.reduce((a, x) => a + pick(x), 0);
  const k = r?.kinds; const p = r?.pnl;
  const other = k ? k.direct_cost + k.marketing + k.software + k.expense + k.depreciation + k.interest : 0;
  return (
    <Document title={`${inv.name} - ${monthLabel(month, true)} investor statement`} author={company}>
      <Page size="A4" style={s.page}>
        <Header eyebrow={`${company} · Investor statement`} title={inv.name}
          sub={`${monthLabel(month, true)}  ·  ${inv.share_pct}% of team ${BASIS_LABEL[inv.share_basis]}  ·  Issued ${today()}`} />

        <View style={s.cards}>
          <Card label="Your share this month" value={f(r?.share ?? 0)} accent />
          <Card label="Paid to you this month" value={f(r?.paid ?? 0)} />
          <Card label="Owed to you now" value={f(sum.owed)} note="Earned to date minus paid" />
          <Card label="Total invested" value={f(sum.invested)} note={sum.returnedCapital ? `${f(sum.returnedCapital)} returned` : undefined} />
        </View>

        <View style={s.two}>
          <View style={s.col}>
            <Text style={s.h2}>Your team this month</Text>
            <Line l="Revenue (after refunds)" v={f(p?.revenue ?? 0)} />
            <Line l="Gross profit" v={f(p?.grossProfit ?? 0)} />
            <Line l="Agents on the team" v={r?.agents == null ? '-' : String(r.agents)} />
            <Line l="Clients closed" v={r?.clientsClosed == null ? '-' : String(r.clientsClosed)} />
            <Line l="Commissions paid" v={f(k?.commission ?? 0)} />
            <Line l="Salaries" v={f(k?.salary ?? 0)} />
            <Line l="Rent & office" v={f(k?.rent ?? 0)} />
            <Line l="Other expenses" v={f(other)} />
            <Line l="Taxes" v={f(k?.tax ?? 0)} />
            <Line l="Net profit" v={f(p?.netProfit ?? 0)} strong color={(p?.netProfit ?? 0) < 0 ? BAD : undefined} />
          </View>
          <View style={s.col}>
            <Text style={s.h2}>How your share is worked out</Text>
            <Line l={`Team ${BASIS_LABEL[inv.share_basis]}`} v={f(r?.basis ?? 0)} />
            {r && r.lossOffset > 0 ? <Line l="Less: earlier losses recovered" v={`(${f(r.lossOffset)})`} /> : null}
            <Line l="Amount shared" v={f(r?.shareable ?? 0)} />
            <Line l="Your percentage" v={`${inv.share_pct}%`} />
            <Line l="Your share" v={f(r?.share ?? 0)} strong color={IRIS} />
            {r && r.basis < 0 && inv.carry_losses ? <Text style={s.note}>This month made a loss of {f(-r.basis)}. Under your agreement it is recovered from the next profitable months before a share is paid.</Text> : null}

            <Text style={s.h2}>Your account to date</Text>
            <Line l="Invested" v={f(sum.invested)} />
            <Line l="Earned to date" v={f(sum.earned)} />
            <Line l="Paid to you" v={f(sum.paid)} />
            <Line l="Owed to you" v={f(sum.owed)} strong />
            <Line l="Return on investment" v={f(sum.roi, 'pct')} />
            <Line l="Yearly return" v={f(sum.annualRoi, 'pct')} />
            <Line l="Paid back so far" v={f(sum.paybackProgress, 'pct')} />
          </View>
        </View>

        <Text style={s.h2}>Recent months</Text>
        <Table widths={[1.3, 1, 1, 1, 1, 1]} cols={['Month', 'Revenue', 'Net profit', 'Your share', 'Paid', 'Owed after']}
          rows={L.slice(-6).map((x) => [monthLabel(x.month), f(x.pnl.revenue), f(x.pnl.netProfit), f(x.share), f(x.paid), f(x.owedToDate)])} />
        <Text style={s.note}>
          Year to date ({month.slice(0, 4)}): revenue {f(total((x) => x.pnl.revenue))} · net profit {f(total((x) => x.pnl.netProfit))} · your share {f(total((x) => x.share))} · paid {f(total((x) => x.paid))}
        </Text>

        <View style={s.defs} wrap={false}>
          <Text style={[s.bold, { fontSize: 8.5, marginBottom: 4 }]}>What these words mean</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.def}>Revenue: what the team's clients paid, after refunds.</Text>
              <Text style={s.def}>Gross profit: revenue minus the direct cost of doing and selling the work (freelancers, payment fees, commissions).</Text>
              <Text style={s.def}>Net profit: what is left after every cost (salaries, rent, tools, other expenses) and tax.</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.def}>Your share: {inv.share_pct}% of the team's {BASIS_LABEL[inv.share_basis]}{inv.carry_losses ? ', after any earlier losses are recovered' : ''}.</Text>
              <Text style={s.def}>Owed to you: everything you have earned so far minus what has been paid to you.</Text>
              <Text style={s.def}>ROI: your share earned for every $1 you invested. Yearly return converts it to a per-year rate.</Text>
            </View>
          </View>
        </View>
        <Footer company={company} note={data.settings.report_note} signatory={data.settings.signatory} />
      </Page>
    </Document>
  );
}


/* ============================================================ overall */
/** The whole business, or one investor's team: summary or full breakdown. */
function OverallDoc({ data, months, team, detail }: { data: VaultData; months: string[]; team: 'company' | number; detail: Detail }) {
  const company = data.settings.company || 'NUUKE';
  const inv = team === 'company' ? null : data.investors.find((i) => i.id === team) ?? null;
  const rep = buildReport({ scope: team, months, entries: data.entries, stats: data.stats, categories: data.categories, investors: data.investors,
    taxRate: data.settings.tax_rate != null ? Number(data.settings.tax_rate) / 100 : undefined });
  const m = rep.metrics; const p = rep.pnl; const k = rep.kinds; const prev = rep.prev;
  const full = detail === 'detailed';
  const pick = (keys: string[]) => keys.map((key) => METRICS.find((x) => x.key === key)).filter((x): x is (typeof METRICS)[number] => !!x);
  const headline = pick(['gross_margin', 'net_margin', 'cti', 'new_clients', 'cac', 'ltv_cac', 'cash', 'runway']);
  const set = new Set(months);
  const inTeam = (e: VEntry) => team === 'company' || e.investor_id === team;
  const here = data.entries.filter((e) => set.has(e.month) && inTeam(e));
  const cats = new Map(data.categories.map((c) => [c.id, c.name]));
  const byType = (kind: Kind) => {
    const g = new Map<string, number>();
    for (const e of here.filter((x) => x.kind === kind)) {
      const name = (e.category_id && cats.get(e.category_id)) || 'No type';
      g.set(name, (g.get(name) ?? 0) + Number(e.amount));
    }
    return [...g.entries()].sort((a, b) => b[1] - a[1]);
  };
  const shown = activeMonths(rep.byMonth.map((x) => x.month), (mm) => {
    const x = rep.byMonth.find((b) => b.month === mm)!.pnl; return !!(x.grossRevenue || x.costOfSales || x.opex || x.tax);
  });
  const rows = rep.byMonth.filter((x) => shown.includes(x.month));
  const costs = (x: typeof p) => x.costOfSales + x.opex + x.depreciation + x.interest + x.tax;
  const spend = COST_KINDS.map((kk) => ({ label: KINDS[kk].label, value: k[kk], color: KINDS[kk].color })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const title = inv ? `${inv.name}'s team` : 'Financial report';
  const name = inv ? `${inv.name}'s team` : company;

  /** A P&L line with its types listed underneath (detailed only). */
  const KindLine = ({ kind, label, cost = true }: { kind: Kind; label: string; cost?: boolean }) => (
    <>
      <Line l={label} v={cost ? neg(k[kind]) : f(k[kind])} />
      {full && k[kind] ? byType(kind).map(([n, v]) => <Line key={n} l={n} v={cost ? neg(v) : f(v)} indent />) : null}
    </>
  );

  // Balance sheet: the latest month-end numbers on or before the period's end.
  const last = months[months.length - 1];
  const BAL = ['cash', 'receivables', 'other_assets', 'fixed_assets', 'payables', 'other_liabilities', 'debt'];
  const balMonth = [...new Set(data.stats.map((x) => x.month))].filter((mm) => mm <= last).sort().reverse()
    .find((mm) => BAL.some((key) => statFor(data.stats, mm, team, key) != null));
  const g = (key: string) => (balMonth ? statFor(data.stats, balMonth, team, key) ?? 0 : 0);
  const assets = g('cash') + g('receivables') + g('other_assets') + g('fixed_assets');
  const liabilities = g('payables') + g('other_liabilities') + g('debt');

  return (
    <Document title={`${name} - ${periodLabel(months)} ${full ? 'detailed' : 'summary'} report`} author={company}>
      <Page size="A4" style={s.page}>
        <Header eyebrow={`${company} · ${full ? 'Detailed report' : 'Summary report'}`} title={title}
          sub={`${periodLabel(months)}  ·  ${inv ? `${inv.share_pct}% of team ${BASIS_LABEL[inv.share_basis]} to ${inv.name}  ·  ` : ''}Issued ${today()}  ·  USD`} />

        <View style={s.cards}>
          <Card label="Revenue" value={f(p.revenue)} delta={delta(p.revenue, prev?.revenue)} />
          <Card label="Gross profit" value={f(p.grossProfit)} note={`${f(m.gross_margin, 'pct')} margin`} />
          <Card label="Net profit" value={f(p.netProfit)} note={`${f(m.net_margin, 'pct')} margin`} delta={delta(p.netProfit, prev?.netProfit)} accent />
          <Card label={rep.investorShares ? 'Kept after investors' : 'Free cash flow'} value={f(rep.investorShares ? m.retained_profit : m.free_cash_flow)} />
        </View>

        {rows.length > 1 && (
          <>
            <Text style={s.h2}>Revenue and costs by month</Text>
            <MonthChart points={rows.map((x) => ({ month: x.month, a: x.pnl.revenue, b: costs(x.pnl) }))} a={{ label: 'Revenue', color: '#34C759' }} b={{ label: 'Costs', color: '#FF9F0A' }} />
          </>
        )}

        <View style={s.two}>
          <View style={s.col}>
            <Text style={s.h2}>Profit & loss</Text>
            <KindLine kind="revenue" label="Revenue" cost={false} />
            {k.refund ? <KindLine kind="refund" label="Less refunds" /> : null}
            <Line l="Net revenue" v={f(p.revenue)} strong />
            <KindLine kind="direct_cost" label="Cost of delivery" />
            <KindLine kind="commission" label="Commissions" />
            <Line l="Gross profit" v={f(p.grossProfit)} strong />
            <KindLine kind="salary" label="Salaries" />
            <KindLine kind="rent" label="Rent & office" />
            <KindLine kind="marketing" label="Marketing & leads" />
            <KindLine kind="software" label="Software & tools" />
            <KindLine kind="expense" label="Other expenses" />
            <Line l="EBITDA" v={f(p.ebitda)} strong />
            {k.depreciation ? <KindLine kind="depreciation" label="Depreciation" /> : null}
            {k.interest ? <KindLine kind="interest" label="Interest" /> : null}
            {k.other_income ? <KindLine kind="other_income" label="Other income" cost={false} /> : null}
            <KindLine kind="tax" label="Taxes" />
            <Line l="Net profit" v={f(p.netProfit)} strong color={p.netProfit < 0 ? BAD : GOOD} />
            {rep.investorShares ? <Line l={inv ? `${inv.name}'s share` : "Investors' profit shares"} v={neg(rep.investorShares)} /> : null}
            {rep.investorShares ? <Line l="Profit kept by the company" v={f(m.retained_profit)} strong /> : null}
          </View>
          <View style={s.col}>
            <Text style={s.h2}>Key figures</Text>
            {headline.map((d) => <Line key={d.key} l={d.name} v={f(m[d.key], d.fmt)} />)}
            <Text style={s.h2}>Cash flow</Text>
            <Line l="Cash from operations" v={f(p.operatingCashFlow)} />
            <Line l="Equipment bought" v={neg(p.capex)} />
            <Line l="Investment received" v={f(p.capitalIn)} />
            <Line l="Paid to investors" v={neg(p.payouts + p.capitalOut)} />
            <Line l="Net change in cash" v={f(p.netCashFlow)} strong />
          </View>
        </View>

        {spend.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>Where the money went</Text>
            <Bars items={spend} />
          </View>
        )}

        {!full && (
          <Defs items={[...pick(['revenue', 'gross_profit', 'ebitda', 'net_profit']), ...headline].map((d) => `${d.name}${d.abbr && !d.name.includes(d.abbr) ? ` (${d.abbr})` : ''}: ${d.def}`)} />
        )}
        <Footer company={company} note={data.settings.report_note} signatory={data.settings.signatory} />
      </Page>

      {full && (
        <Page size="A4" style={s.page}>
          <Header eyebrow={`${company} · Detailed report`} title="Month by month" sub={periodLabel(months)} />
          <Table widths={[1.25, 1, 1, 1, 1, 1]} cols={['Month', 'Revenue', 'Gross profit', 'Costs', 'Net profit', 'Margin']}
            rows={rows.map((x) => [monthLabel(x.month), f(x.pnl.revenue), f(x.pnl.grossProfit), f(costs(x.pnl)), f(x.pnl.netProfit),
              x.pnl.revenue ? f(x.pnl.netProfit / x.pnl.revenue, 'pct') : '-'])}
            foot={['Total', f(p.revenue), f(p.grossProfit), f(costs(p)), f(p.netProfit), f(m.net_margin, 'pct')]} />

          {KIND_ORDER.filter((kk) => !['revenue', 'capital_in', 'capital_out', 'payout'].includes(kk) && k[kk]).length > 0 && (
            <>
              <Text style={s.h2}>Every cost, by month</Text>
              <Table widths={[1.6, ...rows.slice(-6).map(() => 1), 1.1]}
                cols={['Kind', ...rows.slice(-6).map((x) => monthLabel(x.month).replace(' 20', " '")), rows.length > 6 ? 'Period' : 'Total']}
                rows={COST_KINDS.filter((kk) => k[kk]).map((kk) => [KINDS[kk].label,
                  ...rows.slice(-6).map((x) => { const v = here.filter((e) => e.kind === kk && e.month === x.month).reduce((a, e) => a + Number(e.amount), 0); return v ? f(v) : '-'; }),
                  f(k[kk])])} />
              {rows.length > 6 ? <Text style={s.note}>Columns show the last 6 months; the last column is the whole period.</Text> : null}
            </>
          )}

          <View style={s.two} wrap={false}>
            <View style={s.col}>
              <Text style={s.h2}>Balance sheet</Text>
              {balMonth ? (
                <>
                  <Text style={s.h3}>At the end of {monthLabel(balMonth, true)}</Text>
                  <Line l="Cash in bank" v={f(g('cash'))} />
                  <Line l="Owed to us" v={f(g('receivables'))} />
                  <Line l="Other short-term assets" v={f(g('other_assets'))} />
                  <Line l="Equipment (book value)" v={f(g('fixed_assets'))} />
                  <Line l="Total assets" v={f(assets)} strong />
                  <Line l="Bills we owe" v={f(g('payables'))} />
                  <Line l="Other short-term debts" v={f(g('other_liabilities'))} />
                  <Line l="Loans" v={f(g('debt'))} />
                  <Line l="Total liabilities" v={f(liabilities)} strong />
                  <Line l="Net assets" v={f(assets - liabilities)} strong color={assets - liabilities < 0 ? BAD : undefined} />
                </>
              ) : <Text style={s.note}>No month-end cash, receivables or debts recorded yet (Monthly numbers).</Text>}
            </View>
            <View style={s.col}>
              {team === 'company' && data.investors.length > 0 ? (
                <>
                  <Text style={s.h2}>Investors</Text>
                  {data.investors.map((iv) => {
                    const L = investorLedger(iv, data.entries, data.stats, last);
                    const sm = investorSummary(iv, L);
                    const share = L.filter((x) => set.has(x.month)).reduce((a, x) => a + x.share, 0);
                    return (
                      <View key={iv.id} wrap={false} style={{ marginBottom: 6 }}>
                        <Text style={s.h3}>{plain(`${iv.name} · ${iv.share_pct}% of ${BASIS_LABEL[iv.share_basis]}`)}</Text>
                        <Line l="Share earned this period" v={f(share)} />
                        <Line l="Invested to date" v={f(sm.invested)} />
                        <Line l="Paid out to date" v={f(sm.paid)} />
                        <Line l="Owed at period end" v={f(sm.owed)} strong />
                      </View>
                    );
                  })}
                </>
              ) : null}
            </View>
          </View>
          <Footer company={company} note={data.settings.report_note} signatory={data.settings.signatory} />
        </Page>
      )}

      {full && (
        <Page size="A4" style={s.page}>
          <Header eyebrow={`${company} · Detailed report`} title="Metrics & ratios" sub={`${periodLabel(months)}  ·  each with how it's worked out`} />
          {METRIC_GROUPS.filter((gname) => gname !== 'Profit & loss').map((gname) => (
            <View key={gname}>
              <Text style={s.h2} minPresenceAhead={50}>{gname}</Text>
              {METRICS.filter((x) => x.group === gname).map((d) => (
                <View key={d.key} style={s.mrow} wrap={false}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ fontWeight: 600 }}>{plain(`${d.name}${d.abbr && !d.name.includes(d.abbr) ? ` (${d.abbr})` : ''}`)}</Text>
                    <Text style={{ color: SOFT, fontSize: 7.2, marginTop: 1 }}>{plain(d.formula)}</Text>
                  </View>
                  <Text style={{ fontWeight: 700 }}>{f(m[d.key], d.fmt)}</Text>
                </View>
              ))}
            </View>
          ))}
          <Footer company={company} note={data.settings.report_note} signatory={data.settings.signatory} />
        </Page>
      )}
    </Document>
  );
}

/* ============================================================ category */
/** One kind of money (e.g. Salaries) or one type (e.g. LinkedIn ads): totals, trend and where it's made of. */
function CategoryDoc({ data, months, team, target, detail }: {
  data: VaultData; months: string[]; team: 'company' | number; target: { kind: Kind } | { category: number }; detail: Detail;
}) {
  const company = data.settings.company || 'NUUKE';
  const full = detail === 'detailed';
  const cat = 'category' in target ? data.categories.find((c) => c.id === target.category) ?? null : null;
  const kind: Kind = 'kind' in target ? target.kind : (cat?.kind ?? 'expense');
  const title = cat ? cat.name : KINDS[kind].label;
  const inv = team === 'company' ? null : data.investors.find((i) => i.id === team) ?? null;
  const cats = new Map(data.categories.map((c) => [c.id, c.name]));
  const invs = new Map(data.investors.map((i) => [i.id, i.name]));
  const match = (e: VEntry) => (team === 'company' || e.investor_id === team) && (cat ? e.category_id === cat.id : e.kind === kind);
  const set = new Set(months);
  const lines = data.entries.filter((e) => set.has(e.month) && match(e));
  const prevMonths = months.length ? monthRange(addMonths(months[0], -months.length), addMonths(months[0], -1)) : [];
  const prevSet = new Set(prevMonths);
  const prevLines = data.entries.filter((e) => prevSet.has(e.month) && match(e));
  const total = sumOf(lines); const before = prevLines.length ? sumOf(prevLines) : null;
  const rep = buildReport({ scope: team, months, entries: data.entries, stats: data.stats, categories: data.categories, investors: data.investors });
  const revenue = rep.pnl.revenue;
  const allCosts = COST_KINDS.reduce((a, kk) => a + rep.kinds[kk], 0);
  const inflow = isInflow(kind);
  const shown = activeMonths(months, (mm) => lines.some((e) => e.month === mm));
  const perMonth = shown.map((mm) => ({ month: mm, a: sumOf(lines.filter((e) => e.month === mm)) }));
  // Spread over the months that had any of it (an empty current month shouldn't drag the average down).
  const withData = months.filter((mm) => lines.some((e) => e.month === mm)).length;
  const avg = total / (withData || 1);
  const groupBy = (key: (e: VEntry) => string) => {
    const g = new Map<string, number>();
    for (const e of lines) g.set(key(e), (g.get(key(e)) ?? 0) + Number(e.amount));
    return [...g.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byType = cat ? [] : groupBy((e) => (e.category_id && cats.get(e.category_id)) || 'No type');
  const byTeam = team === 'company' ? groupBy((e) => (e.investor_id ? `${invs.get(e.investor_id) ?? 'Investor'}'s team` : 'Company')) : [];
  const byWhat = groupBy((e) => (e.label || (e.category_id && cats.get(e.category_id)) || KINDS[e.kind].label).replace(/\s+/g, ' ').trim());
  const PALETTE = ['#5E5CE6', '#34C759', '#FF9F0A', '#0A84FF', '#FF375F', '#30B0C7', '#AF52DE', '#FFD60A', '#8E8E93'];
  const bars = (xs: [string, number][], n = 8) => {
    const top = xs.slice(0, n); const rest = xs.slice(n).reduce((a, x) => a + x[1], 0);
    return [...top.map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] })), ...(rest ? [{ label: 'Everything else', value: rest, color: '#C7C7CC' }] : [])];
  };
  const shareLabel = inflow ? 'Share of revenue' : 'Share of all costs';
  const share = inflow ? (revenue ? total / revenue : null) : (allCosts ? total / allCosts : null);

  return (
    <Document title={`${title} - ${periodLabel(months)}`} author={company}>
      <Page size="A4" style={s.page}>
        <Header eyebrow={`${company} · ${cat ? KINDS[kind].label : 'Category'} · ${full ? 'Detailed' : 'Summary'}`} title={title}
          sub={`${periodLabel(months)}  ·  ${inv ? `${inv.name}'s team` : 'Whole company'}  ·  Issued ${today()}  ·  USD`} />
        <View style={s.cards}>
          <Card label="Total" value={f(total)} delta={delta(total, before, inflow)} accent />
          <Card label="Monthly average" value={f(avg)} note={`over ${withData} ${withData === 1 ? 'month' : 'months'}`} />
          <Card label={shareLabel} value={f(share, 'pct')} />
          {inflow ? <Card label="Lines" value={String(lines.length)} /> : <Card label="Of revenue" value={f(revenue ? total / revenue : null, 'pct')} note="for every $1 that came in" />}
        </View>

        {lines.length === 0 ? (
          <Text style={[s.note, { marginTop: 18, fontSize: 10 }]}>Nothing was recorded here in this period.</Text>
        ) : (
          <>
            {perMonth.length > 1 && (
              <>
                <Text style={s.h2}>By month</Text>
                <MonthChart points={perMonth} a={{ label: title, color: KINDS[kind].color }} />
              </>
            )}
            <View style={s.two}>
              {byType.length > 1 ? (
                <View style={s.col} wrap={false}>
                  <Text style={s.h2}>By type</Text>
                  <Bars items={bars(byType)} />
                </View>
              ) : null}
              {byTeam.length > 1 ? (
                <View style={s.col} wrap={false}>
                  <Text style={s.h2}>By team</Text>
                  <Bars items={bars(byTeam)} />
                </View>
              ) : null}
            </View>
            {byWhat.length > 1 && (
              <View wrap={false}>
                <Text style={s.h2}>Biggest items</Text>
                <Bars items={bars(byWhat, full ? 12 : 6)} />
              </View>
            )}
            {full && (
              <>
                <Text style={s.h2}>Month by month</Text>
                <Table widths={[1.3, 1, 1, 1, 0.7]} cols={['Month', 'Amount', shareLabel, 'Of revenue', 'Lines']}
                  rows={perMonth.map((x) => {
                    const r2 = rep.byMonth.find((b) => b.month === x.month)?.pnl;
                    const c2 = r2 ? r2.costOfSales + r2.opex + r2.depreciation + r2.interest + r2.tax : 0;
                    return [monthLabel(x.month), f(x.a), inflow ? (r2?.revenue ? f(x.a / r2.revenue, 'pct') : '-') : (c2 ? f(x.a / c2, 'pct') : '-'),
                      r2?.revenue ? f(x.a / r2.revenue, 'pct') : '-', String(lines.filter((e) => e.month === x.month).length)];
                  })}
                  foot={['Total', f(total), f(share, 'pct'), f(revenue ? total / revenue : null, 'pct'), String(lines.length)]} />
                <Text style={s.h2}>Every line</Text>
                <Table left={3} widths={[0.9, 2.4, 1.2, 1]} cols={['Month', 'Description', 'Team', 'Amount']}
                  rows={[...lines].sort((a, b) => b.month.localeCompare(a.month) || Number(b.amount) - Number(a.amount)).map((e) => [
                    monthLabel(e.month),
                    [e.label, !cat && e.category_id ? cats.get(e.category_id) : null, e.note].filter(Boolean).join(' · ') || KINDS[e.kind].label,
                    e.investor_id ? invs.get(e.investor_id) ?? 'Investor' : 'Company',
                    `${f(Number(e.amount))}${e.currency === 'PKR' && e.original_amount != null ? `  (Rs ${Math.round(Number(e.original_amount)).toLocaleString()})` : ''}`,
                  ])}
                  foot={['', `${lines.length} lines`, '', f(total)]} />
              </>
            )}
          </>
        )}
        <Defs items={[`${KINDS[kind].label}: ${KINDS[kind].plain}`, `${shareLabel}: this ${cat ? 'type' : 'kind'} as a part of all ${inflow ? 'revenue' : 'costs'} in the period.`,
          'Monthly average: the total spread over the months that had any of it.', 'Compared with the period of the same length just before.']} />
        <Footer company={company} note={data.settings.report_note} signatory={data.settings.signatory} />
      </Page>
    </Document>
  );
}

/* ============================================================== export */
export type Detail = 'simple' | 'detailed';
export type ExportWhat =
  | { type: 'overall'; team: 'company' | number; months: string[]; detail: Detail }
  | { type: 'kind'; kind: Kind; team: 'company' | number; months: string[]; detail: Detail }
  | { type: 'category'; id: number; team: 'company' | number; months: string[]; detail: Detail }
  | { type: 'investor'; id: number; month: string };

/** Build the PDF and save it. Returns the file name. */
export async function downloadPdf(data: VaultData, w: ExportWhat): Promise<string> {
  const company = data.settings.company || 'NUUKE';
  let doc: ReactNode; let name: string;
  if (w.type === 'investor') {
    const inv = data.investors.find((i) => i.id === w.id);
    if (!inv) throw new Error('Pick an investor');
    doc = <InvestorDoc data={data} inv={inv} month={w.month} />;
    name = `${company} - ${inv.name} - ${monthLabel(w.month, true)} statement`;
  } else {
    if (!w.months.length) throw new Error('Pick a period');
    const team = w.team === 'company' ? '' : ` - ${data.investors.find((i) => i.id === w.team)?.name ?? 'Investor'}'s team`;
    const per = periodLabel(w.months).replace(/–/g, 'to');
    const lvl = w.detail === 'detailed' ? 'detailed' : 'summary';
    if (w.type === 'overall') {
      doc = <OverallDoc data={data} months={w.months} team={w.team} detail={w.detail} />;
      name = `${company}${team} - ${per} financial report (${lvl})`;
    } else if (w.type === 'kind') {
      doc = <CategoryDoc data={data} months={w.months} team={w.team} target={{ kind: w.kind }} detail={w.detail} />;
      name = `${company}${team} - ${KINDS[w.kind].label} - ${per} (${lvl})`;
    } else {
      const c = data.categories.find((x) => x.id === w.id);
      doc = <CategoryDoc data={data} months={w.months} team={w.team} target={{ category: w.id }} detail={w.detail} />;
      name = `${company}${team} - ${c?.name ?? 'Type'} - ${per} (${lvl})`;
    }
  }
  const blob = await pdf(doc as Parameters<typeof pdf>[0]).toBlob();
  const file = `${name.replace(/[\\/:*?"<>|]/g, '-')}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return file;
}
