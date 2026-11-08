import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useVaultMutations } from '@/data/vault';
import { STAT_FIELDS, monthLabel, monthRange } from '@/lib/finance';
import { Panel, PanelHeader, Picker } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { Def, thisMonth, useV } from './parts';

/** A spreadsheet of the monthly counts for the company or one investor's team. Saves each cell as you leave it. */
export function Numbers({ investorId, compact }: { investorId?: number; compact?: boolean }) {
  const { data, knownMonths } = useV();
  const [scope, setScope] = useState<string>(investorId ? String(investorId) : 'company');
  useEffect(() => { if (investorId) setScope(String(investorId)); }, [investorId]);
  const years = useMemo(() => [...new Set([...knownMonths.map((m) => m.slice(0, 4)), thisMonth().slice(0, 4)])].sort().reverse(), [knownMonths]);
  const [year, setYear] = useState(thisMonth().slice(0, 4));
  const inv = scope === 'company' ? null : Number(scope);
  const fields = STAT_FIELDS.filter((f) => inv == null || f.scope === 'both');
  const months = monthRange(`${year}-01-01`, `${year}-12-01`);

  return (
    <Panel padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
        <PanelHeader className="!mb-0" title={compact ? 'Monthly numbers' : 'Monthly numbers'}
          sub="Counts that aren't money. They power CAC, churn, LTV, per-agent figures and the balance sheet. Saves as you type." />
        <div className="flex flex-wrap gap-2">
          {!investorId && (
            <Picker className="w-[220px]" value={scope} onChange={setScope}
              options={[{ value: 'company', label: 'Company (whole business)' }, ...data.investors.map((i) => ({ value: String(i.id), label: `${i.name}'s team` }))]} />
          )}
          <Picker className="w-[110px]" value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} />
        </div>
      </div>
      {inv == null && (
        <p className="text-3 px-5 pb-2 text-[12px]">Leave a company count blank and it adds up the investor teams' numbers for that month.</p>
      )}
      <div className="scroll-x pb-3">
        <table className="text-[13px]" style={{ minWidth: 140 + fields.length * 118 }}>
          <thead>
            <tr className="text-3 text-left text-[11px] font-bold uppercase tracking-wide">
              <th className="sticky left-0 z-10 bg-[var(--bg-solid,var(--glass-strong))] px-5 py-2">Month</th>
              {fields.map((f) => (
                <th key={f.key} className="px-1.5 align-bottom">
                  <span className="flex items-end gap-0.5 leading-tight">{f.label}<Def text={f.def} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => <NumbersRow key={`${scope}-${m}`} month={m} investorId={inv} fields={fields.map((f) => f.key)} />)}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function NumbersRow({ month, investorId, fields }: { month: string; investorId: number | null; fields: string[] }) {
  const { data } = useV();
  const { save } = useVaultMutations();
  const toast = useToast();
  const row = data.stats.find((s) => s.month === month && (s.investor_id ?? null) === investorId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft(Object.fromEntries(fields.map((k) => [k, row?.data?.[k] == null ? '' : String(row.data[k])])));
  }, [row, fields.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = async (k: string) => {
    const before = row?.data?.[k] == null ? '' : String(row.data[k]);
    const raw = (draft[k] ?? '').replace(/[, $]/g, '');
    if (raw === before) return;
    if (raw !== '' && !Number.isFinite(Number(raw))) { toast({ title: 'Numbers only', tone: 'danger' }); return; }
    const next: Record<string, number | null> = { ...(row?.data ?? {}) };
    if (raw === '') delete next[k]; else next[k] = Number(raw);
    try { await save('stats', { month, investor_id: investorId, data: next }); } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); }
  };
  const isNow = month === thisMonth();
  return (
    <tr className={clsx('border-t border-[color:var(--hairline,rgba(127,127,127,.12))]', isNow && 'bg-[var(--fill)]')}>
      <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-solid,var(--glass-strong))] px-5 py-1.5 font-semibold">{monthLabel(month)}</td>
      {fields.map((k) => (
        <td key={k} className="px-1.5 py-1">
          <input inputMode="decimal" value={draft[k] ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            onBlur={() => void commit(k)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="fill tabular h-9 w-full rounded-xl px-2.5 text-right outline-none focus:ring-2 focus:ring-iris" placeholder="—" />
        </td>
      ))}
    </tr>
  );
}
