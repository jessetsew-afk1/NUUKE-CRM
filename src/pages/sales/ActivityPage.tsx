import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { MessageSquare, SkipForward } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { OUTCOME_TONE, outcomeMap, useAttempts, useOutcomes } from '@/data/sales';
import { must, supabase } from '@/lib/supabase';
import type { Lead } from '@/lib/types';
import { Agent } from '@/agent/Agent';
import { Empty, PageHeader, Panel, Picker, Pill, Segmented, Sheet, Skeleton } from '@/ui/kit';
import { LeadDetail } from './LeadsPage';
import { addDaysISO, count, localISO, time } from '@/lib/format';

type Range = 'today' | 'yesterday' | 'week' | 'month';

export default function ActivityPage() {
  const { agent } = useAuth();
  const [range, setRange] = useState<Range>('today');
  const [action, setAction] = useState<'all' | 'call' | 'skip' | 'note'>('all');
  const [outcome, setOutcome] = useState<string>('__all');
  const [lead, setLead] = useState<Lead | null>(null);
  const today = localISO();
  const [from, to] = {
    today: [today, today],
    yesterday: [addDaysISO(today, -1), addDaysISO(today, -1)],
    week: [addDaysISO(today, -6), today],
    month: [addDaysISO(today, -29), today],
  }[range];
  const attempts = useAttempts(from, to, action);
  const outcomes = useOutcomes();
  const map = useMemo(() => outcomeMap(outcomes.data), [outcomes.data]);

  const rows = (attempts.data ?? []).filter((a) => outcome === '__all' || a.outcome === outcome);
  const byDay = useMemo(() => {
    const g = new Map<string, typeof rows>();
    for (const r of rows) g.set(r.work_date, [...(g.get(r.work_date) ?? []), r]);
    return [...g.entries()];
  }, [rows]);

  const calls = rows.filter((r) => r.action === 'call');
  const connected = calls.filter((r) => map.get(r.outcome ?? '')?.connected).length;
  const skips = rows.filter((r) => r.action === 'skip').length;

  const openLead = async (id: number) => {
    const l = must(await supabase.from('leads').select('*').eq('id', id).single()) as Lead;
    setLead(l);
  };

  return (
    <>
      <PageHeader title="Call log" sub="Every Done, Skip and note you have made — nothing is lost." />
      <Panel className="mb-5 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={range} onChange={setRange} options={[
            { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'week', label: '7 days' }, { value: 'month', label: '30 days' },
          ]} />
          <Segmented value={action} onChange={setAction} options={[
            { value: 'all', label: 'Everything' }, { value: 'call', label: 'Calls' }, { value: 'skip', label: 'Skips' }, { value: 'note', label: 'Notes' },
          ]} />
          <Picker className="w-[230px]" value={outcome} onChange={setOutcome}
            options={[{ value: '__all', label: 'Any outcome' }, ...(outcomes.data ?? []).map((o) => ({ value: o.key, label: o.label }))]} />
          <div className="text-2 ml-auto flex gap-4 px-2 text-[13px]">
            <span><b className="tabular text-[color:var(--text)]">{count(calls.length)}</b> calls</span>
            <span><b className="tabular text-[color:var(--text)]">{count(connected)}</b> connected</span>
            <span><b className="tabular text-[color:var(--text)]">{count(skips)}</b> skipped</span>
          </div>
        </div>
      </Panel>

      {attempts.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <Panel><Empty art={<Agent config={agent} size={120} mood="sleepy" />} title="Nothing logged here yet" body="Start the dialer and your calls will appear here as you go." /></Panel>
      ) : (
        <div className="space-y-6">
          {byDay.map(([d, list]) => (
            <section key={d}>
              <div className="text-3 mb-2 flex items-center gap-2 px-1 text-[12px] font-bold uppercase tracking-[0.12em]">
                {d === today ? 'Today' : format(parseISO(d), 'EEEE d MMMM')}
                <span className="fill rounded-full px-2 normal-case tracking-normal">{list.filter((x) => x.action === 'call').length} calls</span>
              </div>
              <Panel padded={false} className="divide-y divide-[var(--hairline)] overflow-hidden">
                {list.map((a, i) => {
                  const o = a.outcome ? map.get(a.outcome) : null;
                  return (
                    <motion.button
                      key={a.id}
                      type="button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 20) * 0.01 }}
                      onClick={() => a.lead && void openLead(a.lead.id)}
                      className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-[var(--fill)]"
                    >
                      <span className="text-3 tabular w-[70px] shrink-0 text-[13px] font-semibold">{time(a.created_at)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold">{a.lead?.name || 'Lead'}</span>
                        <span className="text-2 block truncate text-[13px]">
                          {a.comment ? `“${a.comment}”` : <span className="text-3">{a.lead?.service ?? ''}</span>}
                        </span>
                      </span>
                      {a.attempt_no && <span className="text-3 hidden text-[12px] sm:inline">call {a.attempt_no}</span>}
                      <span className="w-[140px] shrink-0 text-right">
                        {a.action === 'skip' ? <Pill tone="neutral"><SkipForward className="size-3" />Skipped</Pill>
                          : a.action === 'note' ? <Pill tone="info"><MessageSquare className="size-3" />Note</Pill>
                            : <Pill tone={OUTCOME_TONE[o?.tone ?? 'neutral']}>{o?.short_label ?? a.outcome}</Pill>}
                      </span>
                    </motion.button>
                  );
                })}
              </Panel>
            </section>
          ))}
        </div>
      )}

      <Sheet open={!!lead} onClose={() => setLead(null)} width={1040} title={lead?.name || 'Lead'}>
        {lead && <LeadDetail lead={lead} onDone={() => setLead(null)} />}
      </Sheet>
    </>
  );
}
