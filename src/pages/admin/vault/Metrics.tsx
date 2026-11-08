import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { METRIC_GROUPS, METRICS, fmtValue, periodLabel } from '@/lib/finance';
import { TERMS } from '@/lib/financeTerms';
import { Input, Panel, PanelHeader, Pill } from '@/ui/kit';
import { useReport, useV } from './parts';

export function MetricsTab() {
  const { mode, months } = useV();
  const r = useReport('company');
  const [q, setQ] = useState('');
  const list = METRICS.filter((m) => (mode === 'pro' || m.simple || r.metrics[m.key] != null)
    && (!q || `${m.name} ${m.abbr ?? ''} ${m.def}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-4">
      <Panel className="!p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input className="min-w-[240px] flex-1" placeholder="Find a metric: CAC, margin, runway…" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
          <span className="text-2 text-[13px]">{periodLabel(months)} · {mode === 'pro' ? `all ${METRICS.length} metrics with formulas` : 'the key ones in plain words (Pro shows all)'}</span>
        </div>
      </Panel>
      {METRIC_GROUPS.map((g) => {
        const rows = list.filter((m) => m.group === g);
        if (!rows.length) return null;
        return (
          <Panel key={g}>
            <PanelHeader title={g} />
            <div className="divide-y divide-[color:var(--hairline,rgba(127,127,127,.15))]">
              {rows.map((m) => {
                const v = r.metrics[m.key];
                return (
                  <div key={m.key} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14.5px] font-bold">{m.name}</span>
                        {m.abbr && <Pill tone="iris">{m.abbr}</Pill>}
                      </div>
                      <div className="text-2 mt-0.5 text-[13.5px] leading-snug">{m.def}</div>
                      {mode === 'pro' && <div className="text-3 mt-1 font-mono text-[12px]">= {m.formula}</div>}
                      {m.good && <div className="mt-1 text-[12px] font-semibold text-ok">Benchmark: {m.good}</div>}
                      {v == null && m.needs && <div className="text-3 mt-1 text-[12px]">Fill in to see it: {m.needs}</div>}
                    </div>
                    <div className={clsx('tabular self-center font-display text-[22px] font-extrabold sm:text-right', v != null && v < 0 && m.fmt === 'usd' && 'text-bad', v == null && 'text-3')}>
                      {fmtValue(v, m.fmt)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

export function Glossary() {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const metricGroup = { group: 'Metrics in this vault', terms: METRICS.map((m) => ({ term: m.name, abbr: m.abbr, def: `${m.def} (${m.formula})` })) };
    const all = [metricGroup, ...TERMS];
    if (!q) return all;
    const s = q.toLowerCase();
    return all.map((g) => ({ ...g, terms: g.terms.filter((t) => `${t.term} ${t.abbr ?? ''} ${t.def}`.toLowerCase().includes(s)) })).filter((g) => g.terms.length);
  }, [q]);
  const total = METRICS.length + TERMS.reduce((a, g) => a + g.terms.length, 0);
  return (
    <div className="space-y-4">
      <Panel className="!p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input className="min-w-[240px] flex-1" placeholder="Look up any term: EBITDA, waterfall, indemnification…" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
          <span className="text-2 text-[13px]">{total} terms, each in one line</span>
        </div>
      </Panel>
      {groups.map((g) => (
        <Panel key={g.group}>
          <PanelHeader title={g.group} sub={`${g.terms.length} terms`} />
          <dl className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {g.terms.map((t) => (
              <div key={t.term}>
                <dt className="text-[14px] font-bold">{t.term}{t.abbr && <span className="text-3 ml-1.5 font-semibold">({t.abbr})</span>}</dt>
                <dd className="text-2 text-[13.5px] leading-snug">{t.def}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      ))}
    </div>
  );
}
