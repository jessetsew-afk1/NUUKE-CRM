import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eraser, Recycle, Search, Shuffle, Trash2, Upload, UserMinus, X } from 'lucide-react';
import { useImports } from '@/data/admin';
import { OUTCOME_TONE, outcomeMap, useOutcomes } from '@/data/sales';
import { usePeople } from '@/data/common';
import { must, rpc, supabase } from '@/lib/supabase';
import type { Lead } from '@/lib/types';
import { ImportWizard } from '@/admin/ImportWizard';
import { TidySheet } from '@/admin/TidySheet';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Chip, Input, PageHeader, Panel, Picker, Pill, Sheet, Skeleton } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { ago, count, dayShort } from '@/lib/format';
import { LeadCard } from '@/sales/LeadCard';

interface Filter {
  q: string; service: string | null; platform: string | null; stage: string | null; assigned: string | null; import_id: string | null;
}
const PAGE = 50;

export default function AdminLeads() {
  const [f, setF] = useState<Filter>({ q: '', service: null, platform: null, stage: null, assigned: null, import_id: null });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [tidying, setTidying] = useState(false);
  const [open, setOpen] = useState<Lead | null>(null);
  const people = usePeople();
  const reps = (people.data ?? []).filter((p) => p.role === 'sales' && p.is_active);
  const byId = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);
  const outcomes = useOutcomes();
  const omap = useMemo(() => outcomeMap(outcomes.data), [outcomes.data]);
  const imports = useImports();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => { const t = window.setTimeout(() => setF((c) => ({ ...c, q })), 250); return () => window.clearTimeout(t); }, [q]);
  useEffect(() => { setPage(0); setSelected(new Set()); setAllMatching(false); }, [f]);

  const options = useQuery({
    queryKey: ['admin-lead-options'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await rpc<{ services: { value: string; count: number }[]; platforms: { value: string; count: number }[] }>('admin_lead_facets');
      return { services: r.services.map((x) => x.value), platforms: r.platforms.map((x) => x.value) };
    },
  });

  const list = useQuery({
    queryKey: ['admin-leads', f, page],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let qb = supabase.from('leads').select('*', { count: 'exact' });
      if (f.q.trim()) {
        const t = f.q.trim().replace(/[%,()]/g, ' ');
        qb = qb.or(`name.ilike.%${t}%,phone.ilike.%${t}%,personal_email.ilike.%${t}%`);
      }
      if (f.service) qb = qb.eq('service', f.service);
      if (f.platform) qb = qb.eq('platform', f.platform);
      if (f.stage === 'exhausted') qb = qb.eq('closed_reason', 'exhausted');
      else if (f.stage) qb = qb.eq('stage', f.stage);
      if (f.assigned === 'unassigned') qb = qb.is('assigned_to', null);
      else if (f.assigned) qb = qb.eq('assigned_to', f.assigned);
      if (f.import_id) qb = qb.eq('import_id', Number(f.import_id));
      const res = await qb.order('lead_date', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      return { rows: must(res) as Lead[], total: res.count ?? 0 };
    },
  });

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const pageIds = rows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selCount = allMatching ? total : selected.size;

  const rpcFilter = () => {
    const out: Record<string, string> = {};
    if (f.q.trim()) out.q = f.q.trim();
    if (f.service) out.service = f.service;
    if (f.platform) out.platform = f.platform;
    if (f.stage && f.stage !== 'exhausted') out.stage = f.stage;
    if (f.stage === 'exhausted') out.stage = 'closed';
    if (f.assigned) out.assigned = f.assigned;
    if (f.import_id) out.import_id = f.import_id;
    return out;
  };
  const ids = async () => (allMatching ? await rpc<number[]>('admin_lead_ids', { p_filter: rpcFilter() }) : [...selected]);

  const after = (title: string) => {
    toast({ title, tone: 'success' });
    setSelected(new Set());
    setAllMatching(false);
    void qc.invalidateQueries({ queryKey: ['admin-leads'] });
    void qc.invalidateQueries({ queryKey: ['lead-health'] });
  };

  const assign = async (repIds: string[]) => {
    const n = await rpc<number>('assign_leads', { p_lead_ids: await ids(), p_reps: repIds });
    setAssigning(false);
    after(repIds.length ? `${count(n)} leads assigned` : `${count(n)} leads unassigned`);
  };
  const recycle = async () => after(`${count(await rpc<number>('recycle_leads', { p_lead_ids: await ids() }))} leads back in the queue`);
  const remove = async () => {
    const list = await ids();
    for (let i = 0; i < list.length; i += 1000) {
      const { error } = await supabase.from('leads').delete().in('id', list.slice(i, i + 1000));
      if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    }
    after(`${count(list.length)} leads deleted`);
  };

  return (
    <>
      <PageHeader title="Leads & import" sub="Upload the lead sheet, hand leads to reps, and keep the pipeline fed."
        right={<>
          <Button variant="glass" icon={<Eraser className="size-4" />} onClick={() => setTidying(true)}>Remove repeats</Button>
          <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>Import a sheet</Button>
        </>} />

      {imports.data && imports.data.length > 0 && (
        <div className="scroll-x no-scrollbar -mx-1 mb-4 flex gap-2 px-1">
          {imports.data.slice(0, 6).map((im) => (
            <button key={im.id} type="button" onClick={() => setF((c) => ({ ...c, import_id: c.import_id === String(im.id) ? null : String(im.id) }))}
              className={clsx('glass shrink-0 rounded-2xl px-3.5 py-2 text-left text-[12px]', f.import_id === String(im.id) && 'ring-2 ring-iris')}>
              <div className="max-w-[220px] truncate text-[13px] font-bold">{im.file_name}</div>
              <div className="text-3">{count(im.inserted)} imported · {count(im.duplicates)} dupes · {ago(im.created_at)}</div>
            </button>
          ))}
        </div>
      )}

      <Panel className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="min-w-[220px] flex-1" placeholder="Search name, number or email" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
          <Picker className="w-[190px]" value={f.assigned ?? '__all'} onChange={(v) => setF({ ...f, assigned: v === '__all' ? null : v })}
            options={[{ value: '__all', label: 'Anyone' }, { value: 'unassigned', label: 'Unassigned' }, ...reps.map((r) => ({ value: r.id, label: r.full_name }))]} />
          <Picker className="w-[170px]" value={f.stage ?? '__all'} onChange={(v) => setF({ ...f, stage: v === '__all' ? null : v })}
            options={[{ value: '__all', label: 'Any stage' }, { value: 'queue', label: 'In the queue' }, { value: 'pipeline', label: 'In a pipeline' }, { value: 'closed', label: 'Closed' }, { value: 'exhausted', label: 'Exhausted (4 tries)' }]} />
          <Picker className="w-[200px]" value={f.service ?? '__all'} onChange={(v) => setF({ ...f, service: v === '__all' ? null : v })}
            options={[{ value: '__all', label: 'All services' }, ...(options.data?.services ?? []).map((s) => ({ value: s, label: s }))]} />
          <Picker className="w-[160px]" align="right" value={f.platform ?? '__all'} onChange={(v) => setF({ ...f, platform: v === '__all' ? null : v })}
            options={[{ value: '__all', label: 'All platforms' }, ...(options.data?.platforms ?? []).map((s) => ({ value: s, label: s }))]} />
        </div>
      </Panel>

      <AnimatePresence>
        {allPageSelected && !allMatching && total > rows.length && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 overflow-hidden">
            <div className="fill rounded-2xl px-4 py-2.5 text-center text-[13px]">
              All {rows.length} on this page are selected. <button type="button" className="font-bold text-iris" onClick={() => setAllMatching(true)}>Select all {count(total)} matching leads</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Panel padded={false} className="overflow-hidden">
        <div className="scroll-x">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead className="text-3 text-[11px] font-bold uppercase tracking-wide">
              <tr className="border-b border-[var(--hairline)]">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" className="size-4 accent-[#7C5CFF]" checked={allPageSelected || allMatching}
                    onChange={() => { setAllMatching(false); setSelected(allPageSelected ? new Set() : new Set(pageIds)); }} aria-label="Select page" />
                </th>
                <th className="px-2 py-3">Lead</th><th className="px-2 py-3">Phone</th><th className="px-2 py-3">Service</th>
                <th className="px-2 py-3">Platform</th><th className="px-2 py-3">Date</th><th className="px-2 py-3">Rep</th>
                <th className="px-2 py-3">Status</th><th className="px-4 py-3 text-right">Calls</th>
              </tr>
            </thead>
            <tbody className={clsx(list.isFetching && 'opacity-60 transition-opacity')}>
              {list.isLoading && Array.from({ length: 10 }, (_, i) => (
                <tr key={i}><td colSpan={9} className="px-4 py-2"><Skeleton className="h-8" /></td></tr>
              ))}
              {rows.map((l) => {
                const rep = l.assigned_to ? byId.get(l.assigned_to) : null;
                const o = omap.get(l.status);
                const checked = allMatching || selected.has(l.id);
                return (
                  <tr key={l.id} className={clsx('cursor-pointer border-b border-[var(--hairline)] last:border-b-0 hover:bg-[var(--fill)]', checked && 'bg-iris/6')} onClick={() => setOpen(l)}>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="size-4 accent-[#7C5CFF]" checked={checked} aria-label={`Select ${l.name}`}
                        onChange={() => { setAllMatching(false); setSelected((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; }); }} />
                    </td>
                    <td className="max-w-[200px] truncate px-2 py-2.5 font-bold">{l.name || '—'}</td>
                    <td className="tabular px-2 py-2.5 font-mono">{l.phone ?? '—'}</td>
                    <td className="max-w-[170px] truncate px-2 py-2.5">{l.service ?? '—'}</td>
                    <td className="px-2 py-2.5">{l.platform ?? '—'}</td>
                    <td className="tabular px-2 py-2.5">{dayShort(l.lead_date)}</td>
                    <td className="px-2 py-2.5">{rep ? <span className="inline-flex items-center gap-1.5"><AgentAvatar who={rep} size={22} />{rep.full_name.split(' ')[0]}</span> : <span className="text-3">Unassigned</span>}</td>
                    <td className="px-2 py-2.5">{l.status === 'new' ? <Pill tone="iris">New</Pill> : <Pill tone={OUTCOME_TONE[o?.tone ?? 'neutral']}>{l.closed_reason === 'exhausted' ? 'Exhausted' : o?.short_label ?? l.status}</Pill>}</td>
                    <td className="tabular px-4 py-2.5 text-right">{l.attempts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--hairline)] px-4 py-3 text-[13px]">
          <span className="text-2">{total ? `${count(page * PAGE + 1)}–${count(Math.min(total, page * PAGE + PAGE))} of ${count(total)}` : 'No leads match'}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="glass" disabled={page === 0} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="size-4" />}>Prev</Button>
            <Button size="sm" variant="glass" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)} iconRight={<ChevronRight className="size-4" />}>Next</Button>
          </div>
        </div>
      </Panel>

      {/* bulk bar */}
      <AnimatePresence>
        {selCount > 0 && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="glass-strong fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-[24px] px-4 py-3 lg:bottom-6 lg:ml-[144px]">
            <span className="tabular px-1 text-[14px] font-extrabold">{count(selCount)} selected</span>
            <Button size="sm" variant="primary" icon={<Shuffle className="size-4" />} onClick={() => setAssigning(true)}>Assign</Button>
            <Button size="sm" variant="glass" icon={<UserMinus className="size-4" />} onClick={() => void assign([])}>Unassign</Button>
            <Button size="sm" variant="glass" icon={<Recycle className="size-4" />} onClick={() => void recycle()}>Recycle</Button>
            <Button size="sm" variant="ghost" className="text-bad" icon={<Trash2 className="size-4" />} onClick={() => { if (window.confirm(`Delete ${selCount} leads and their call history? This cannot be undone.`)) void remove(); }}>Delete</Button>
            <button type="button" aria-label="Clear selection" onClick={() => { setSelected(new Set()); setAllMatching(false); }} className="text-3 ml-1 hover:text-[color:var(--text)]"><X className="size-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <AssignSheet open={assigning} onClose={() => setAssigning(false)} reps={reps} count={selCount} onAssign={assign} />
      <ImportWizard open={importing} onClose={() => setImporting(false)} reps={reps} />
      <TidySheet open={tidying} onClose={() => setTidying(false)} reps={reps} />
      <Sheet open={!!open} onClose={() => setOpen(null)} width={760} title={open?.name || 'Lead'}>
        {open && <LeadCard lead={open} outcomes={omap} maxAttempts={4} compact onEdited={(l) => { setOpen(l); void qc.invalidateQueries({ queryKey: ['admin-leads'] }); }} />}
      </Sheet>
    </>
  );
}

function AssignSheet({ open, onClose, reps, count: n, onAssign }: { open: boolean; onClose: () => void; reps: { id: string; full_name: string; avatar: unknown }[]; count: number; onAssign: (ids: string[]) => Promise<void> }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={`Assign ${count(n)} leads`} width={520}
      footer={<><Button variant="glass" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!picked.length} loading={busy} onClick={async () => { setBusy(true); try { await onAssign(picked); } finally { setBusy(false); setPicked([]); } }}>
          {picked.length > 1 ? `Split between ${picked.length}` : 'Assign'}
        </Button></>}>
      <p className="text-2 mb-4 text-[14px]">Pick one rep, or several to split them evenly (round-robin). Each rep gets a notification.</p>
      <div className="flex flex-wrap gap-2">
        {reps.map((r) => (
          <Chip key={r.id} active={picked.includes(r.id)} onClick={() => setPicked((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))}>
            <AgentAvatar who={r} size={22} />{r.full_name}
          </Chip>
        ))}
      </div>
      {picked.length > 1 && <p className="text-3 mt-4 text-[13px]">About {count(Math.ceil(n / picked.length))} each.</p>}
    </Sheet>
  );
}
