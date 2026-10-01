import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO, startOfWeek } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, Headphones, PhoneIncoming, Sparkles, Trophy } from 'lucide-react';
import { useTeamOverview, type TeamRow } from '@/data/admin';
import { STAGES, stageMeta, useSalesStats } from '@/data/sales';
import { must, supabase } from '@/lib/supabase';
import type { Deal } from '@/lib/types';
import { Agent } from '@/agent/Agent';
import { normaliseAgent } from '@/agent/catalog';
import { BarList, ColumnChart } from '@/ui/charts';
import { PageHeader, Panel, PanelHeader, Pill, Segmented, Sheet, Skeleton, Stat } from '@/ui/kit';
import { count, dayShort, localISO, payPeriod, pct, usd, usdShort } from '@/lib/format';

type Period = 'today' | 'week' | 'period' | 'month30';
type SortKey = 'won_usd' | 'dials' | 'connected' | 'prospects' | 'meetings' | 'open_pipeline_usd';

export default function AdminSales() {
  const today = localISO();
  const [period, setPeriod] = useState<Period>('period');
  const [sort, setSort] = useState<SortKey>('won_usd');
  const [open, setOpen] = useState<TeamRow | null>(null);
  const [from, to] = useMemo(() => {
    switch (period) {
      case 'today': return [today, today];
      case 'week': return [format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), today];
      case 'month30': return [format(new Date(Date.now() - 29 * 86_400_000), 'yyyy-MM-dd'), today];
      default: return [payPeriod(today).start, today];
    }
  }, [period, today]);
  const team = useTeamOverview(from, to);
  const rows = useMemo(() => [...(team.data ?? [])].sort((a, b) => Number(b[sort]) - Number(a[sort])), [team.data, sort]);
  const sum = (k: keyof TeamRow) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className="px-2 py-3 text-right">
      <button type="button" onClick={() => setSort(k)} className={`inline-flex items-center gap-1 uppercase ${sort === k ? 'text-[color:var(--text)]' : ''}`}>
        {children}<ArrowUpDown className="size-3" />
      </button>
    </th>
  );

  return (
    <>
      <PageHeader title="Sales floor" sub="Every rep's numbers side by side. Tap a rep for their analytics and pipeline."
        right={<Segmented value={period} onChange={setPeriod} options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'period', label: 'Pay period' }, { value: 'month30', label: '30 days' }]} />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Dials" value={count(sum('dials'))} sub={`${rows.length} reps`} icon={<Headphones className="size-4" />} accent="#7C5CFF" />
        <Stat label="Connected" value={count(sum('connected'))} sub={sum('dials') ? `${pct(sum('connected') / sum('dials'))} pick-up` : '—'} icon={<PhoneIncoming className="size-4" />} accent="#2FB98C" />
        <Stat label="Prospects · meetings" value={`${count(sum('prospects'))} · ${count(sum('meetings'))}`} icon={<Sparkles className="size-4" />} accent="#5AB8FF" />
        <Stat label="Closed" value={usdShort(sum('won_usd'))} sub={`${count(sum('won_count'))} deals`} icon={<Trophy className="size-4" />} accent="#30C46C" />
      </div>

      <Panel padded={false} className="overflow-hidden">
        <div className="scroll-x">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead className="text-3 text-[11px] font-bold uppercase tracking-wide">
              <tr className="border-b border-[var(--hairline)]">
                <th className="px-5 py-3">Rep</th>
                <Th k="dials">Dials</Th><Th k="connected">Connected</Th><Th k="prospects">Prospects</Th><Th k="meetings">Meetings</Th>
                <Th k="won_usd">Closed</Th><th className="px-2 py-3">Target</th><Th k="open_pipeline_usd">Pipeline</Th>
                <th className="px-5 py-3 text-right">Leads open</th>
              </tr>
            </thead>
            <tbody>
              {team.isLoading && Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={9} className="px-5 py-2"><Skeleton className="h-10" /></td></tr>)}
              {rows.map((r, i) => {
                const ratio = r.target_usd ? Number(r.won_usd) / Number(r.target_usd) : 0;
                return (
                  <motion.tr layout key={r.profile_id} className="cursor-pointer border-b border-[var(--hairline)] last:border-b-0 hover:bg-[var(--fill)]" onClick={() => setOpen(r)}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-3 tabular w-4 font-extrabold">{i + 1}</span>
                        <Agent config={normaliseAgent(r.avatar, r.profile_id)} size={36} animated={false} />
                        <span className="font-bold">{r.full_name}</span>
                      </div>
                    </td>
                    <td className="tabular px-2 py-3 text-right font-semibold">{count(r.dials)}</td>
                    <td className="tabular px-2 py-3 text-right">{count(r.connected)} <span className="text-3">{r.dials ? pct(r.connected / r.dials) : ''}</span></td>
                    <td className="tabular px-2 py-3 text-right">{count(r.prospects)}</td>
                    <td className="tabular px-2 py-3 text-right">{count(r.meetings)}</td>
                    <td className="tabular px-2 py-3 text-right font-extrabold">{usd(r.won_usd)}</td>
                    <td className="px-2 py-3">
                      {r.target_usd > 0 ? (
                        <div className="w-[130px]">
                          <div className="fill h-1.5 overflow-hidden rounded-full"><div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratio >= 1 ? '#30C46C' : ratio <= 0.3 ? '#FF9F0A' : 'var(--viz-1)' }} /></div>
                          <div className="text-3 mt-0.5 text-[11px]">{Math.round(ratio * 100)}% of {usdShort(r.target_usd)}</div>
                        </div>
                      ) : <span className="text-3">—</span>}
                    </td>
                    <td className="tabular px-2 py-3 text-right">{usdShort(r.open_pipeline_usd)}</td>
                    <td className="tabular px-5 py-3 text-right">{count(r.leads_open)} <span className="text-3">/ {count(r.leads_total)}</span></td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <RepSheet rep={open} from={from} to={to} onClose={() => setOpen(null)} />
    </>
  );
}

function RepSheet({ rep, from, to, onClose }: { rep: TeamRow | null; from: string; to: string; onClose: () => void }) {
  const stats = useSalesStats(rep?.profile_id, from, to);
  const deals = useQuery({
    queryKey: ['rep-deals', rep?.profile_id],
    enabled: !!rep,
    queryFn: async () => must(await supabase.from('deals').select('*').eq('owner_id', rep!.profile_id).not('stage', 'in', '(won,lost)').order('amount_usd', { ascending: false }).limit(12)) as Deal[],
  });
  const t = stats.data?.totals;
  return (
    <Sheet open={!!rep} onClose={onClose} width={1000} title={rep?.full_name}>
      {rep && (
        <div className="space-y-5 pt-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[['Dials', t?.dials], ['Connected', t?.connected], ['Prospects', t?.prospects], ['Meetings', t?.meetings_booked], ['Closed', t ? usd(t.won_usd) : undefined]].map(([l, v]) => (
              <div key={l as string} className="fill rounded-2xl px-3 py-2.5">
                <div className="text-3 text-[11px] font-bold uppercase">{l}</div>
                <div className="tabular text-[20px] font-extrabold">{v === undefined ? '–' : typeof v === 'number' ? count(v) : v}</div>
              </div>
            ))}
          </div>
          <Panel>
            <PanelHeader title="Dials per day" />
            {stats.data ? (
              <ColumnChart ariaLabel="Dials per day" height={200}
                data={stats.data.daily.filter((d) => ![0, 6].includes(parseISO(d.date).getDay())).map((d) => ({ key: d.date, label: format(parseISO(d.date), 'EEE d MMM'), value: d.dials, detail: [{ name: 'Connected', value: String(d.connected) }] }))}
                reference={{ value: rep.daily_target || 250, label: `Target ${rep.daily_target || 250}` }} />
            ) : <Skeleton className="h-48" />}
          </Panel>
          <div className="grid gap-5 md:grid-cols-2">
            <Panel>
              <PanelHeader title="Pipeline by stage" />
              {stats.data && <BarList rows={STAGES.map((s) => { const r = stats.data!.stages.find((x) => x.stage === s.key); return { key: s.key, label: s.label, value: Number(r?.amount ?? 0), valueLabel: usd(r?.amount ?? 0), sub: `${r?.count ?? 0}`, dot: s.color }; })} />}
            </Panel>
            <Panel>
              <PanelHeader title="Biggest open deals" />
              <div className="space-y-2">
                {(deals.data ?? []).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-[13px]">
                    <span className="size-2 rounded-full" style={{ background: stageMeta(d.stage).color }} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{d.contact_name || d.title}</span>
                    <Pill tone="neutral">{stageMeta(d.stage).label}</Pill>
                    <span className="text-3 w-[60px] text-right">{dayShort(d.expected_close)}</span>
                    <span className="tabular w-[64px] text-right font-bold">{usdShort(d.amount_usd)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </Sheet>
  );
}
