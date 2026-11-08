import { useEffect } from 'react';
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import {
  BASIS_LABEL, METRICS, buildReport, fmtValue, investorLedger, investorSummary, monthLabel, periodLabel,
  type Fmt, type InvestorMonth, type Report, type VInvestor,
} from '@/lib/finance';
import { useToast } from '@/ui/toast';
import type { VaultCtx } from './parts';

/* The PDF fonts only have basic characters, so keep the text plain (no "−" minus sign). */
const plain = (t: string) => t.replace(/−/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=');
const f = (v: number | null | undefined, k: Fmt = 'usd') => plain(fmtValue(v, k));

const INK = '#14131A'; const SOFT = '#5B5A66'; const LINE = '#E6E4EE'; const IRIS = '#6A4DF4'; const BG = '#F6F5FB'; const GOOD = '#1F9D57'; const BAD = '#D93A3A';
const s = StyleSheet.create({
  page: { padding: 36, paddingTop: 30, paddingBottom: 40, fontSize: 9.5, color: INK, fontFamily: 'Helvetica', lineHeight: 1.35 },
  band: { backgroundColor: INK, color: '#fff', borderRadius: 10, padding: 15, marginBottom: 12 },
  brand: { fontSize: 9, letterSpacing: 2, color: '#B9B2FF', fontFamily: 'Helvetica-Bold' },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginTop: 6, lineHeight: 1.15 },
  sub: { fontSize: 10, color: '#D6D3E6', marginTop: 6 },
  h2: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 3 },
  cards: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, backgroundColor: BG, borderRadius: 8, padding: 9 },
  cardLabel: { fontSize: 7.5, color: SOFT, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: 'Helvetica-Bold' },
  cardValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  cardNote: { fontSize: 7.5, color: SOFT, marginTop: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.6, borderBottomColor: LINE },
  rowStrong: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1, borderTopColor: INK, marginTop: 2 },
  label: { color: SOFT }, bold: { fontFamily: 'Helvetica-Bold' },
  table: { borderWidth: 0.6, borderColor: LINE, borderRadius: 6 },
  th: { flexDirection: 'row', backgroundColor: BG, paddingVertical: 5, paddingHorizontal: 6 },
  td: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderTopWidth: 0.6, borderTopColor: LINE },
  thText: { fontSize: 7.5, color: SOFT, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  two: { flexDirection: 'row', gap: 14 },
  col: { flex: 1 },
  note: { fontSize: 8, color: SOFT, marginTop: 4 },
  defs: { marginTop: 10, padding: 9, backgroundColor: BG, borderRadius: 8 },
  def: { fontSize: 7.6, color: SOFT, marginBottom: 1.5 },
  footerL: { position: 'absolute', bottom: 18, left: 36, right: 36, fontSize: 7.5, color: SOFT },
  mrow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
});

const Line = ({ l, v, strong, color }: { l: string; v: string; strong?: boolean; color?: string }) => (
  <View style={strong ? s.rowStrong : s.row}>
    <Text style={strong ? s.bold : s.label}>{l}</Text>
    <Text style={[strong ? s.bold : {}, color ? { color } : {}]}>{v}</Text>
  </View>
);
const Card = ({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) => (
  <View style={[s.card, accent ? { backgroundColor: '#EEEAFE' } : {}]}>
    <Text style={s.cardLabel}>{label}</Text>
    <Text style={[s.cardValue, accent ? { color: IRIS } : {}]}>{value}</Text>
    {note ? <Text style={s.cardNote}>{note}</Text> : null}
  </View>
);
function Table({ cols, rows, widths }: { cols: string[]; rows: string[][]; widths: number[] }) {
  return (
    <View style={s.table}>
      <View style={s.th}>{cols.map((c, i) => <Text key={c} style={[s.thText, { flex: widths[i], textAlign: i ? 'right' : 'left' }]}>{c}</Text>)}</View>
      {rows.map((r, j) => (
        <View key={j} style={s.td} wrap={false}>{r.map((c, i) => <Text key={i} style={{ flex: widths[i], textAlign: i ? 'right' : 'left', fontFamily: i === r.length - 1 ? 'Helvetica-Bold' : 'Helvetica' }}>{c}</Text>)}</View>
      ))}
    </View>
  );
}
const Footer = ({ company, note, signatory }: { company: string; note?: string; signatory?: string }) => (
  <>
    <Text style={s.footerL} fixed>{plain(`${company} · Confidential${signatory ? ` · Prepared by ${signatory}` : ''}${note ? ` · ${note}` : ''}`)}</Text>
  </>
);
const today = () => new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

/* ========================================================= investor */
function InvestorDoc({ ctx, inv, month }: { ctx: VaultCtx; inv: VInvestor; month: string }) {
  const { data } = ctx;
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
        <View style={s.band}>
          <Text style={s.brand}>{company.toUpperCase()} · INVESTOR STATEMENT</Text>
          <Text style={s.h1}>{inv.name}</Text>
          <Text style={s.sub}>{monthLabel(month, true)}  ·  {inv.share_pct}% of team {BASIS_LABEL[inv.share_basis]}  ·  Issued {today()}</Text>
        </View>

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

/* ========================================================== company */
function CompanyDoc({ ctx }: { ctx: VaultCtx }) {
  const { data, months, mode } = ctx;
  const company = data.settings.company || 'NUUKE';
  const rep: Report = buildReport({ scope: 'company', months, entries: data.entries, stats: data.stats, categories: data.categories, investors: data.investors,
    taxRate: data.settings.tax_rate != null ? Number(data.settings.tax_rate) / 100 : undefined });
  const m = rep.metrics; const p = rep.pnl; const k = rep.kinds;
  const pick = (keys: string[]) => keys.map((key) => METRICS.find((x) => x.key === key)!).filter(Boolean);
  const headline = pick(['gross_margin', 'net_margin', 'cti', 'new_clients', 'cac', 'ltv_cac', 'cash', 'runway']);
  const proGroups = mode === 'pro';
  return (
    <Document title={`${company} - ${periodLabel(months)} financial report`} author={company}>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.brand}>{company.toUpperCase()} · FINANCIAL REPORT</Text>
          <Text style={s.h1}>{periodLabel(months)}</Text>
          <Text style={s.sub}>{mode === 'pro' ? 'Full management report' : 'Summary'}  ·  Issued {today()}  ·  All figures in USD</Text>
        </View>
        <View style={s.cards}>
          <Card label="Revenue" value={f(p.revenue)} />
          <Card label="Gross profit" value={f(p.grossProfit)} note={`${f(m.gross_margin, 'pct')} margin`} />
          <Card label="Net profit" value={f(p.netProfit)} note={`${f(m.net_margin, 'pct')} margin`} accent />
          <Card label="Free cash flow" value={f(m.free_cash_flow)} />
        </View>

        <View style={s.two}>
          <View style={s.col}>
            <Text style={s.h2}>Profit & loss</Text>
            <Line l="Revenue" v={f(p.grossRevenue)} />
            <Line l="Less refunds" v={`(${f(p.refunds)})`} />
            <Line l="Net revenue" v={f(p.revenue)} strong />
            <Line l="Cost of delivery" v={`(${f(k.direct_cost)})`} />
            <Line l="Commissions" v={`(${f(k.commission)})`} />
            <Line l="Gross profit" v={f(p.grossProfit)} strong />
            <Line l="Salaries" v={`(${f(k.salary)})`} />
            <Line l="Rent & office" v={`(${f(k.rent)})`} />
            <Line l="Marketing & leads" v={`(${f(k.marketing)})`} />
            <Line l="Software & tools" v={`(${f(k.software)})`} />
            <Line l="Other expenses" v={`(${f(k.expense)})`} />
            <Line l="EBITDA" v={f(p.ebitda)} strong />
            <Line l="Depreciation, interest, other" v={f(-k.depreciation - k.interest + k.other_income)} />
            <Line l="Taxes" v={`(${f(k.tax)})`} />
            <Line l="Net profit" v={f(p.netProfit)} strong color={p.netProfit < 0 ? BAD : GOOD} />
            {rep.investorShares ? <Line l="Investors' profit shares" v={`(${f(rep.investorShares)})`} /> : null}
            {rep.investorShares ? <Line l="Profit kept by the company" v={f(m.retained_profit)} strong /> : null}
          </View>
          <View style={s.col}>
            <Text style={s.h2}>Key figures</Text>
            {headline.map((d) => <Line key={d.key} l={d.name} v={f(m[d.key], d.fmt)} />)}
            <Text style={s.h2}>Cash flow</Text>
            <Line l="Cash from operations" v={f(p.operatingCashFlow)} />
            <Line l="Equipment bought" v={`(${f(p.capex)})`} />
            <Line l="Investment received" v={f(p.capitalIn)} />
            <Line l="Paid to investors" v={`(${f(p.payouts + p.capitalOut)})`} />
            <Line l="Net change in cash" v={f(p.netCashFlow)} strong />
          </View>
        </View>

        {rep.byMonth.filter((x) => x.pnl.revenue || x.pnl.opex).length > 1 && (
          <>
            <Text style={s.h2}>Month by month</Text>
            <Table widths={[1.2, 1, 1, 1, 1]} cols={['Month', 'Revenue', 'Gross profit', 'Costs', 'Net profit']}
              rows={rep.byMonth.slice(Math.max(0, rep.byMonth.findIndex((x) => x.pnl.revenue || x.pnl.costOfSales || x.pnl.opex))).slice(-12).map((x) => [monthLabel(x.month), f(x.pnl.revenue), f(x.pnl.grossProfit),
                f(x.pnl.costOfSales + x.pnl.opex + x.pnl.depreciation + x.pnl.interest + x.pnl.tax), f(x.pnl.netProfit)])} />
          </>
        )}

        <View style={s.defs} wrap={false}>
          <Text style={[s.bold, { fontSize: 8.5, marginBottom: 4 }]}>What these words mean</Text>
          {pick(['revenue', 'gross_profit', 'ebitda', 'net_profit', ...headline.map((h) => h.key)]).map((d) => (
            <Text key={d.key} style={s.def}>{plain(`${d.name}${d.abbr && !d.name.includes(d.abbr) ? ` (${d.abbr})` : ''}: ${d.def}`)}</Text>
          ))}
        </View>
        <Footer company={company} note={data.settings.report_note} signatory={data.settings.signatory} />
      </Page>

      {proGroups && (
        <Page size="A4" style={s.page}>
          <Text style={[s.h1, { color: INK, marginTop: 0 }]}>All metrics & ratios</Text>
          <Text style={[s.note, { marginBottom: 6 }]}>{periodLabel(months)} · each with its formula</Text>
          {['Margins', 'Growth', 'Clients & sales', 'Team & productivity', 'Cash & liquidity', 'Returns & balance sheet', 'Tax'].map((g) => (
            <View key={g}>
              <Text style={s.h2} minPresenceAhead={40}>{g}</Text>
              {METRICS.filter((x) => x.group === g).map((d) => (
                <View key={d.key} style={s.mrow} wrap={false}>
                  <Text style={{ flex: 1, paddingRight: 8, fontSize: 8.5 }}>
                    <Text style={s.bold}>{d.name}{d.abbr && !d.name.includes(d.abbr) ? ` (${d.abbr})` : ''}</Text>
                    <Text style={{ color: SOFT, fontSize: 7.5 }}>{`   ${plain(d.formula)}`}</Text>
                  </Text>
                  <Text style={[s.bold, { fontSize: 8.5 }]}>{f(m[d.key], d.fmt)}</Text>
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

/* =========================================================== runner */
export default function Exporter({ kind, ctx, investorId, month, onDone }: {
  kind: 'investor' | 'company'; ctx: VaultCtx; investorId?: number; month?: string; onDone: () => void;
}) {
  const toast = useToast();
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const company = ctx.data.settings.company || 'NUUKE';
        let doc; let name: string;
        if (kind === 'investor') {
          const inv = ctx.data.investors.find((i) => i.id === investorId);
          if (!inv || !month) throw new Error('Pick an investor and month');
          doc = <InvestorDoc ctx={ctx} inv={inv} month={month} />;
          name = `${company} - ${inv.name} - ${monthLabel(month, true)} statement.pdf`;
        } else {
          doc = <CompanyDoc ctx={ctx} />;
          name = `${company} - ${periodLabel(ctx.months).replace(/–/g, 'to')} financial report${ctx.mode === 'pro' ? ' (full)' : ''}.pdf`;
        }
        const blob = await pdf(doc).toBlob();
        if (!alive) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '-');
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        toast({ title: 'PDF downloaded', body: name, tone: 'success' });
      } catch (e) {
        toast({ title: 'Could not make the PDF', body: (e as Error).message, tone: 'danger' });
      } finally {
        onDone();
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
