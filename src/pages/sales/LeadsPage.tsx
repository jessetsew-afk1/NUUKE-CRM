import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import clsx from 'clsx';
import { ChevronRight, Phone, Search } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useSettings } from '@/data/common';
import {
  logLeadAction, OUTCOME_TONE, outcomeMap, useFilterOptions, useLeadList, useOutcomes, useSalesRefresh, type LeadListFilters,
} from '@/data/sales';
import type { Lead } from '@/lib/types';
import { Agent } from '@/agent/Agent';
import { Empty, Input, PageHeader, Panel, Picker, Pill, Segmented, Sheet, Skeleton, Spinner, type Tone } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { LeadCard } from '@/sales/LeadCard';
import { OutcomeForm, type OutcomePayload } from '@/sales/OutcomeForm';
import { ago, count, dayShort, friendly } from '@/lib/format';
import { celebrate } from '@/lib/celebrate';

export default function LeadsPage() {
  const { agent } = useAuth();
  const [f, setF] = useState<LeadListFilters>({ q: '', stage: 'all', service: null, platform: null });
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Lead | null>(null);
  const list = useLeadList(f);
  const options = useFilterOptions();
  const outcomes = useOutcomes();
  const settings = useSettings();
  const map = useMemo(() => outcomeMap(outcomes.data), [outcomes.data]);
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const sentinel = useRef<HTMLDivElement>(null);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setF((cur) => ({ ...cur, q })), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list]);

  return (
    <>
      <PageHeader
        title="My leads"
        sub={list.isLoading ? 'Loading your leads…' : `${count(total)} leads${f.stage !== 'all' || f.service || f.platform || f.q ? ' match' : ' assigned to you'}. Tap one to open its card.`}
      />

      <Panel className="mb-5 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[220px] flex-1"
            placeholder="Search name, number, email or service"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            leading={<Search className="size-4" />}
          />
          <Segmented
            value={f.stage}
            onChange={(stage) => setF({ ...f, stage })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'due', label: 'Due now' },
              { value: 'queue', label: 'In queue' },
              { value: 'pipeline', label: 'Pipeline' },
              { value: 'closed', label: 'Closed' },
            ]}
          />
          <Picker
            className="w-[200px]"
            value={f.service ?? '__all'}
            onChange={(v) => setF({ ...f, service: v === '__all' ? null : v })}
            options={[{ value: '__all', label: 'All services' }, ...(options.data?.services ?? []).map((s) => ({ value: s.value, label: s.value, hint: `${s.count} leads` }))]}
          />
          <Picker
            className="w-[170px]"
            align="right"
            value={f.platform ?? '__all'}
            onChange={(v) => setF({ ...f, platform: v === '__all' ? null : v })}
            options={[{ value: '__all', label: 'All platforms' }, ...(options.data?.platforms ?? []).map((s) => ({ value: s.value, label: s.value, hint: `${s.count} leads` }))]}
          />
        </div>
      </Panel>

      <LayoutGroup>
        {list.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[72px] rounded-[22px]" />)}</div>
        ) : rows.length === 0 ? (
          <Panel><Empty art={<Agent config={agent} size={120} mood="sleepy" />} title="No leads here" body="Try another filter, or ask your admin to assign you more." /></Panel>
        ) : (
          <div className="space-y-2">
            {rows.map((l, i) => (
              <LeadRow key={l.id} lead={l} index={i} statusLabel={map.get(l.status)?.short_label} statusTone={OUTCOME_TONE[map.get(l.status)?.tone ?? 'neutral']} maxAttempts={settings.data?.max_attempts ?? 4} onOpen={() => setOpen(l)} />
            ))}
            <div ref={sentinel} className="grid place-items-center py-6">{list.isFetchingNextPage && <Spinner />}</div>
          </div>
        )}

        <Sheet open={!!open} onClose={() => setOpen(null)} layoutId={open ? `lead-${open.id}` : undefined} width={1040}>
          {open && <LeadDetail lead={open} onDone={() => setOpen(null)} />}
        </Sheet>
      </LayoutGroup>
    </>
  );
}

function LeadRow({
  lead, index, statusLabel, statusTone, maxAttempts, onOpen,
}: { lead: Lead; index: number; statusLabel?: string; statusTone?: Tone; maxAttempts: number; onOpen: () => void }) {
  const due = lead.next_action_at && Date.parse(lead.next_action_at) <= Date.now() && lead.stage !== 'closed';
  return (
    <motion.button
      layoutId={`lead-${lead.id}`}
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index % 40, 12) * 0.018 }}
      whileTap={{ scale: 0.985 }}
      className="glass flex w-full items-center gap-4 rounded-[22px] px-4 py-3 text-left hover:bg-[var(--glass-strong)]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-bold">{lead.name || 'Unnamed lead'}</span>
          {due && <Pill tone="warn" solid>Due</Pill>}
        </div>
        <div className="text-2 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
          {lead.phone && <span className="tabular inline-flex items-center gap-1 font-mono"><Phone className="size-3" />{lead.phone}</span>}
          {lead.service && <span>{lead.service}</span>}
          {lead.platform && <span className="text-3">{lead.platform}</span>}
          <span className="text-3">Enquired {dayShort(lead.lead_date)}</span>
        </div>
      </div>
      <div className="hidden w-[140px] shrink-0 sm:block">
        <AttemptDots n={lead.attempts} max={maxAttempts} />
        <div className="text-3 mt-1 text-[12px]">
          {lead.next_action_at && lead.stage !== 'closed' ? `Next: ${friendly(lead.next_action_at)}` : lead.last_attempt_at ? `Last call ${ago(lead.last_attempt_at)}` : 'Not called yet'}
        </div>
      </div>
      <div className="w-[120px] shrink-0 text-right">
        {lead.status === 'new' ? <Pill tone="iris">New</Pill> : <Pill tone={statusTone}>{statusLabel ?? lead.status}</Pill>}
      </div>
      <ChevronRight className="text-3 size-4 shrink-0" />
    </motion.button>
  );
}

export function AttemptDots({ n, max }: { n: number; max: number }) {
  return (
    <div className="flex items-center gap-1" title={`${n} of ${max} calls`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={clsx('h-1.5 flex-1 rounded-full', i < n ? 'bg-iris' : 'bg-[var(--fill-2)]')} />
      ))}
    </div>
  );
}

export function LeadDetail({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const outcomes = useOutcomes();
  const settings = useSettings();
  const refresh = useSalesRefresh();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const map = useMemo(() => outcomeMap(outcomes.data), [outcomes.data]);

  const submit = async (p: OutcomePayload) => {
    setBusy(true);
    try {
      const res = await logLeadAction({ leadId: lead.id, action: 'call', ...p });
      refresh(res.today);
      if (p.outcome === 'meeting_booked' || p.outcome === 'won') celebrate();
      toast({ title: 'Call logged', body: `${lead.name || 'Lead'} — ${map.get(p.outcome)?.label}`, tone: 'success' });
      onDone();
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 pt-4 lg:grid-cols-[1.2fr_1fr]">
      <LeadCard lead={lead} outcomes={map} maxAttempts={settings.data?.max_attempts ?? 4} compact />
      {lead.stage === 'closed' && !['contact_not_established', 'voicemail', 'contact_established'].includes(lead.status) ? (
        <div className="fill h-fit rounded-[24px] p-5 text-[14px]">
          <b>This lead is closed</b> ({map.get(lead.status)?.label ?? lead.closed_reason}).
          <p className="text-2 mt-1">Ask your admin to recycle it if it deserves another round.</p>
        </div>
      ) : (
        <div className="fill h-fit rounded-[24px] p-5">
          <h3 className="mb-4 text-[15px] font-bold">Log a call</h3>
          <OutcomeForm lead={lead} outcomes={outcomes.data ?? []} maxAttempts={settings.data?.max_attempts ?? 4} busy={busy} onSubmit={submit} submitLabel="Save call" autoFocusKeys={false} />
        </div>
      )}
    </div>
  );
}
