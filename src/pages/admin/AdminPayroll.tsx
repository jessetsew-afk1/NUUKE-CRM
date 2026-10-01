import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { addMonths, format, parseISO } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Download, Send } from 'lucide-react';
import { usePayrollOverview } from '@/data/admin';
import { usePayroll } from '@/data/pay';
import { rpc } from '@/lib/supabase';
import type { Payroll } from '@/lib/types';
import { Agent } from '@/agent/Agent';
import { normaliseAgent } from '@/agent/catalog';
import { Button, PageHeader, Panel, Picker, Pill, Sheet, Skeleton, Stat } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { PayView } from '@/pages/me/PayPage';
import { localISO, payPeriod, pkr, usd } from '@/lib/format';

const TIER: Record<string, { label: string; tone: 'bad' | 'neutral' | 'good' | 'info' }> = {
  below: { label: '≤30% · 30% pay', tone: 'bad' },
  base: { label: 'Full salary', tone: 'info' },
  commission: { label: '+ commission', tone: 'good' },
  none: { label: 'No target', tone: 'neutral' },
};

export default function AdminPayroll() {
  const cur = payPeriod(localISO());
  const options = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const start = format(addMonths(parseISO(cur.start), -i), 'yyyy-MM-dd');
    const end = format(addMonths(parseISO(cur.end), -i), 'yyyy-MM-dd');
    return { value: start, label: `${format(parseISO(start), 'd MMM')} – ${format(parseISO(end), 'd MMM yyyy')}`, hint: i === 0 ? 'Current — still running' : undefined };
  }), [cur.start, cur.end]);
  const [period, setPeriod] = useState(options[0].value);
  const data = usePayrollOverview(period);
  const [open, setOpen] = useState<Payroll | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const rows = data.data ?? [];
  const finished = period !== options[0].value;
  const released = rows.length > 0 && rows.every((r) => r.released_at);

  const totals = rows.reduce((t, r) => ({
    salary: t.salary + Number(r.monthly_salary_pkr), deductions: t.deductions + Number(r.deduction_pkr),
    commission: t.commission + Number(r.sales?.commission_pkr ?? 0), net: t.net + Number(r.net_pkr),
  }), { salary: 0, deductions: 0, commission: 0, net: 0 });

  const release = async () => {
    if (!window.confirm('Release payslips for this period? They are frozen afterwards and everyone is notified.')) return;
    setBusy(true);
    try {
      const n = await rpc<number>('release_payroll', { p_period_start: period });
      toast({ title: `Released ${n} payslips`, tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['payroll-overview'] });
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const head = ['Name', 'Role', 'Salary PKR', 'Scheduled days', 'Deduction days', 'Deductions PKR', 'Target USD', 'Closed USD', 'Tier', 'Commission USD', 'Commission PKR', 'Net PKR'];
    const lines = rows.map((r) => [r.full_name, r.role, r.monthly_salary_pkr, r.scheduled_days, r.deduction_days, r.deduction_pkr, r.sales?.target_usd ?? '', r.sales?.closed_usd ?? '', r.sales?.tier ?? '', r.sales?.commission_usd ?? '', r.sales?.commission_pkr ?? '', r.net_pkr]);
    const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `nuuke-payroll-${period}.csv`;
    a.click();
  };

  return (
    <>
      <PageHeader title="Payroll" sub="20th to 20th. Attendance deductions and sales tiers are applied automatically."
        right={<>
          <Picker className="w-[250px]" align="right" value={period} onChange={setPeriod} options={options} />
          <Button variant="glass" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!rows.length}>CSV</Button>
          {finished && !released && <Button variant="primary" icon={<Send className="size-4" />} loading={busy} onClick={release}>Release payslips</Button>}
          {released && <Pill tone="good" solid><BadgeCheck className="size-3.5" />Released</Pill>}
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Salaries" value={pkr(totals.salary)} sub={`${rows.length} people`} accent="#7C5CFF" />
        <Stat label="Deductions" value={pkr(totals.deductions)} sub="attendance" accent="#FF453A" />
        <Stat label="Commission" value={pkr(totals.commission)} sub="sales over target" accent="#30C46C" />
        <Stat label={finished ? 'Total to pay' : 'Total so far'} value={pkr(totals.net)} sub={`pay day ${format(addMonths(parseISO(period), 1), 'd MMM')}`} accent="#5AB8FF" />
      </div>

      <Panel padded={false} className="overflow-hidden">
        <div className="scroll-x">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead className="text-3 text-[11px] font-bold uppercase tracking-wide">
              <tr className="border-b border-[var(--hairline)]">
                <th className="px-5 py-3">Person</th><th className="px-2 py-3 text-right">Salary</th><th className="px-2 py-3 text-right">Deducted</th>
                <th className="px-2 py-3">Sales</th><th className="px-2 py-3 text-right">Commission</th><th className="px-5 py-3 text-right">Net pay</th>
              </tr>
            </thead>
            <tbody>
              {data.isLoading && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={6} className="px-5 py-2"><Skeleton className="h-10" /></td></tr>)}
              {rows.map((r, i) => (
                <motion.tr key={r.profile_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="cursor-pointer border-b border-[var(--hairline)] last:border-b-0 hover:bg-[var(--fill)]" onClick={() => setOpen(r)}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Agent config={normaliseAgent(r.avatar, r.profile_id)} size={36} animated={false} />
                      <div><div className="font-bold">{r.full_name}</div><div className="text-3 text-[12px] capitalize">{r.role}</div></div>
                    </div>
                  </td>
                  <td className="tabular px-2 py-3 text-right">{pkr(r.monthly_salary_pkr)}</td>
                  <td className="tabular px-2 py-3 text-right">
                    {r.deduction_days > 0 ? <span className="font-semibold text-bad">{r.deduction_days}d · {pkr(r.deduction_pkr)}</span> : <span className="text-3">—</span>}
                  </td>
                  <td className="px-2 py-3">
                    {r.sales ? (
                      <div className="flex items-center gap-2">
                        <Pill tone={TIER[r.sales.tier].tone}>{TIER[r.sales.tier].label}</Pill>
                        <span className="text-3 tabular text-[12px]">{usd(r.sales.closed_usd)} / {usd(r.sales.target_usd)}</span>
                      </div>
                    ) : <span className="text-3">—</span>}
                  </td>
                  <td className="tabular px-2 py-3 text-right">{r.sales?.commission_pkr ? <span className="font-semibold text-ok">{pkr(r.sales.commission_pkr)}</span> : <span className="text-3">—</span>}</td>
                  <td className="tabular px-5 py-3 text-right text-[15px] font-extrabold">{pkr(r.net_pkr)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <PayslipSheet row={open} period={period} onClose={() => setOpen(null)} />
    </>
  );
}

function PayslipSheet({ row, period, onClose }: { row: Payroll | null; period: string; onClose: () => void }) {
  const full = usePayroll(row?.profile_id, period);
  return (
    <Sheet open={!!row} onClose={onClose} width={1100} title={row ? `${row.full_name} — payslip` : ''}>
      <div className="pt-2">{full.data ? <PayView p={full.data} /> : <Skeleton className="h-96" />}</div>
    </Sheet>
  );
}
