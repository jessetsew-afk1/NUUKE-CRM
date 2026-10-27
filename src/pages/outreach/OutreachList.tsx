/** The setter's whole list, searchable, with where each person stands. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { READY, STATUS, useProspects, type Prospect } from '@/data/outreach';
import { ProspectSheet } from '@/outreach/ProspectSheet';
import { Empty, Input, PageHeader, Pill, Skeleton } from '@/ui/kit';
import { useScriptContext } from './OutreachPage';

export function ProspectRows({ rows, onOpen, meta, showStatus = true }: {
  rows: Prospect[]; onOpen: (id: number) => void; meta?: (p: Prospect) => string; showStatus?: boolean;
}) {
  if (!rows.length) return <p className="text-3 px-3 py-4 text-[13.5px]">Nobody here.</p>;
  return (
    <ul className="divide-y divide-[var(--hairline)]">
      {rows.map((p) => (
        <li key={p.id}>
          <button onClick={() => onOpen(p.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[var(--fill)]">
            <span className="text-3 tabular w-6 shrink-0 text-right text-[12px]">{p.position}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p.name}</div>
              <div className="text-2 truncate text-[12.5px]">{meta ? meta(p) : (p.instagram ? `@${p.instagram}` : p.practice)}</div>
            </div>
            {showStatus && (
              <Pill tone={p.status === 'not_sent' ? READY[p.ready].tone : STATUS[p.status].tone}>
                {p.status === 'not_sent' ? READY[p.ready].label : STATUS[p.status].label}
              </Pill>
            )}
            <ChevronRight className="text-3 size-4 shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  );
}

const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'todo', label: 'Not sent', test: (p: Prospect) => p.status === 'not_sent' },
  { key: 'live', label: 'In progress', test: (p: Prospect) => ['sent', 'info', 'replied', 'booked', 'no_show'].includes(p.status) },
  { key: 'won', label: 'Held', test: (p: Prospect) => p.status === 'held' },
  { key: 'done', label: 'Closed', test: (p: Prospect) => ['no', 'no_reply', 'no_ig'].includes(p.status) },
] as const;

export default function OutreachList() {
  const { profile } = useAuth();
  const rows = useProspects();
  const ctx = useScriptContext();
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('p')) || null;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const f = FILTERS.find((x) => x.key === filter)!;
  const term = q.trim().toLowerCase();
  const shown = (rows.data ?? []).filter((p) => f.test(p)
    && (!term || `${p.name} ${p.full_name ?? ''} ${p.instagram ?? ''} ${p.practice ?? ''}`.toLowerCase().includes(term)));
  const open = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('p', String(id)); else next.delete('p');
    setParams(next, { replace: true });
  };
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="My prospects" sub={`${rows.data?.length ?? 0} people, in the order to message them.`} />
      <Input placeholder="Search name, @handle or practice" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scroll-x my-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((x) => (
          <button key={x.key} onClick={() => setFilter(x.key)}
            className={clsx('h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold', filter === x.key ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'fill')}>
            {x.label} <span className="opacity-60">{(rows.data ?? []).filter(x.test).length}</span>
          </button>
        ))}
      </div>
      <div className="glass rounded-[var(--radius-glass)] p-2">
        {rows.isLoading ? <Skeleton className="h-40" /> : shown.length ? <ProspectRows rows={shown} onOpen={open} /> : <Empty title="Nobody matches" />}
      </div>
      <ProspectSheet prospect={(rows.data ?? []).find((p) => p.id === openId) ?? null} ctx={ctx}
        runs={profile?.role === 'admin'} onClose={() => open(null)} />
    </div>
  );
}
