import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { CalendarClock, Plus, Trash2, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { STAGES, stageMeta, useDeals } from '@/data/sales';
import { must, supabase } from '@/lib/supabase';
import type { Deal, DealStage } from '@/lib/types';
import { Button, Input, PageHeader, Picker, Sheet, Skeleton, Stat, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { dayShort, friendly, localISO, toLocalInput, usd, usdShort } from '@/lib/format';

export default function PipelinePage() {
  const { profile } = useAuth();
  const deals = useDeals();
  const qc = useQueryClient();
  const toast = useToast();
  const [dragging, setDragging] = useState<Deal | null>(null);
  const [editing, setEditing] = useState<Deal | 'new' | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  const byStage = useMemo(() => {
    const m = new Map<DealStage, Deal[]>(STAGES.map((s) => [s.key, []]));
    for (const d of deals.data ?? []) m.get(d.stage as DealStage)?.push(d);
    return m;
  }, [deals.data]);

  const open = (deals.data ?? []).filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  const openValue = open.reduce((s, d) => s + Number(d.amount_usd), 0);
  const weighted = open.reduce((s, d) => s + (Number(d.amount_usd) * d.probability) / 100, 0);
  const monthStart = `${localISO().slice(0, 7)}-01`;
  const wonMonth = (deals.data ?? []).filter((d) => d.stage === 'won' && (d.won_on ?? '') >= monthStart);
  const closed = (deals.data ?? []).filter((d) => d.stage === 'won' || d.stage === 'lost');
  const winRate = closed.length ? (closed.filter((d) => d.stage === 'won').length / closed.length) * 100 : 0;

  const move = async (deal: Deal, stage: DealStage) => {
    if (deal.stage === stage) return;
    const key = ['deals', profile?.id];
    const prev = qc.getQueryData<Deal[]>(key);
    qc.setQueryData<Deal[]>(key, (xs) => xs?.map((d) => (d.id === deal.id ? { ...d, stage, position: Date.now() / 1000 } : d)));
    const { error } = await supabase.from('deals').update({ stage, position: Date.now() / 1000 }).eq('id', deal.id);
    if (error) {
      qc.setQueryData(key, prev);
      toast({ title: error.message, tone: 'danger' });
      return;
    }
    if (stage === 'won') {
      celebrate('big');
      toast({ title: 'Closed won! 🏆', body: `${deal.title} — ${usd(deal.amount_usd)}`, tone: 'celebrate' });
    }
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['sales-stats'] });
  };

  const onDragStart = (e: DragStartEvent) => setDragging((deals.data ?? []).find((d) => d.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const deal = (deals.data ?? []).find((d) => d.id === e.active.id);
    if (deal && e.over) void move(deal, e.over.id as DealStage);
  };

  return (
    <>
      <PageHeader
        title="Pipeline"
        sub="Drag a deal to move it along. Everything here is yours alone."
        right={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>New deal</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open pipeline" value={usdShort(openValue)} sub={`${open.length} live deals`} icon={<Wallet className="size-4" />} accent="#7C5CFF" />
        <Stat label="Weighted" value={usdShort(weighted)} sub="by likelihood to close" icon={<TrendingUp className="size-4" />} accent="#5AB8FF" />
        <Stat label="Won this month" value={usdShort(wonMonth.reduce((s, d) => s + Number(d.amount_usd), 0))} sub={`${wonMonth.length} deals`} icon={<Trophy className="size-4" />} accent="#30C46C" />
        <Stat label="Win rate" value={`${winRate.toFixed(0)}%`} sub={`${closed.length} decided deals`} icon={<CalendarClock className="size-4" />} accent="#FF9A6B" />
      </div>

      {deals.isLoading ? (
        <div className="flex gap-4 overflow-hidden">{STAGES.map((s) => <Skeleton key={s.key} className="h-[540px] w-[290px] shrink-0 rounded-[26px]" />)}</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="scroll-x -mx-4 flex gap-4 px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            {STAGES.map((s) => (
              <Column key={s.key} stage={s.key} deals={byStage.get(s.key) ?? []} onOpen={setEditing} />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.32,0.72,0,1)' }}>
            {dragging && <DealCard deal={dragging} overlay />}
          </DragOverlay>
        </DndContext>
      )}

      <DealSheet deal={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function Column({ stage, deals, onOpen }: { stage: DealStage; deals: Deal[]; onOpen: (d: Deal) => void }) {
  const meta = stageMeta(stage);
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = deals.reduce((s, d) => s + Number(d.amount_usd), 0);
  const [limit, setLimit] = useState(25);
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'glass flex max-h-[calc(100dvh-300px)] min-h-[420px] w-[290px] shrink-0 flex-col rounded-[26px] p-3 transition-[box-shadow,background] duration-200',
        isOver && 'bg-[var(--glass-strong)]',
      )}
      style={isOver ? { boxShadow: `0 0 0 2px ${meta.color}, var(--shadow-lift)` } : undefined}
    >
      <div className="mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} />
          <h3 className="text-[14px] font-extrabold">{meta.label}</h3>
          <span className="fill tabular rounded-full px-2 text-[12px] font-bold">{deals.length}</span>
          <span className="tabular ml-auto text-[13px] font-bold">{usdShort(total)}</span>
        </div>
        <div className="text-3 mt-0.5 text-[12px]">{meta.hint}</div>
      </div>
      <div className="scroll-y -mx-1 flex-1 space-y-2 px-1 pb-1">
        {deals.slice(0, limit).map((d) => <DraggableDeal key={d.id} deal={d} onOpen={() => onOpen(d)} />)}
        {deals.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + 25)} className="text-2 w-full py-2 text-[13px] font-bold hover:text-[var(--text)]">
            Show {Math.min(25, deals.length - limit)} more
          </button>
        )}
        {deals.length === 0 && <div className="text-3 grid h-24 place-items-center rounded-2xl border border-dashed border-[var(--hairline)] text-[13px]">Drop deals here</div>}
      </div>
    </div>
  );
}

function DraggableDeal({ deal, onOpen }: { deal: Deal; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen} className={clsx('touch-manipulation', isDragging && 'opacity-30')}>
      <DealCard deal={deal} />
    </div>
  );
}

function DealCard({ deal, overlay }: { deal: Deal; overlay?: boolean }) {
  const meta = stageMeta(deal.stage);
  const overdue = deal.next_step_at && Date.parse(deal.next_step_at) < Date.now() && deal.stage !== 'won' && deal.stage !== 'lost';
  return (
    <motion.div
      layout={!overlay}
      initial={false}
      animate={overlay ? { rotate: 3, scale: 1.04 } : { rotate: 0, scale: 1 }}
      className={clsx('glass-strong cursor-grab rounded-[18px] p-3.5 active:cursor-grabbing', overlay && 'shadow-2xl')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold">{deal.contact_name || deal.title}</div>
          <div className="text-3 truncate text-[12px]">{deal.service ?? deal.title}</div>
        </div>
        <div className="tabular shrink-0 text-[15px] font-extrabold">{usdShort(deal.amount_usd)}</div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <div className="fill h-1.5 flex-1 overflow-hidden rounded-full">
          <div className="h-full rounded-full" style={{ width: `${deal.probability}%`, background: meta.color }} />
        </div>
        <span className="text-3 tabular text-[11px] font-bold">{deal.probability}%</span>
      </div>
      {(deal.next_step || deal.expected_close) && (
        <div className="text-2 mt-2 space-y-0.5 text-[12px]">
          {deal.next_step && (
            <div className={clsx('truncate', overdue && 'font-semibold text-bad')}>
              → {deal.next_step}{deal.next_step_at && <span className="text-3"> · {friendly(deal.next_step_at)}</span>}
            </div>
          )}
          {deal.expected_close && deal.stage !== 'won' && deal.stage !== 'lost' && <div className="text-3">Expected close {dayShort(deal.expected_close)}</div>}
          {deal.stage === 'won' && deal.won_on && <div className="font-semibold text-ok">Won {dayShort(deal.won_on)}</div>}
        </div>
      )}
    </motion.div>
  );
}

/* ================================================================ editor */
interface Form {
  title: string; contact_name: string; company: string; email: string; phone: string; service: string;
  amount_usd: string; probability: number; stage: DealStage; expected_close: string; next_step: string;
  next_step_at: string; notes: string; lost_reason: string;
}

const blank: Form = {
  title: '', contact_name: '', company: '', email: '', phone: '', service: '', amount_usd: '', probability: 10,
  stage: 'prospect', expected_close: '', next_step: '', next_step_at: '', notes: '', lost_reason: '',
};

function DealSheet({ deal, onClose }: { deal: Deal | 'new' | null; onClose: () => void }) {
  const isNew = deal === 'new';
  const d = deal && deal !== 'new' ? deal : null;
  const [form, setForm] = useState<Form>(blank);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const { profile } = useAuth();
  const [lastId, setLastId] = useState<number | 'new' | null>(null);

  const currentId = d?.id ?? (isNew ? 'new' : null);
  if (currentId !== lastId) {
    setLastId(currentId);
    setConfirm(false);
    setForm(d ? {
      title: d.title, contact_name: d.contact_name ?? '', company: d.company ?? '', email: d.email ?? '', phone: d.phone ?? '',
      service: d.service ?? '', amount_usd: String(d.amount_usd ?? ''), probability: d.probability, stage: d.stage as DealStage,
      expected_close: d.expected_close ?? '', next_step: d.next_step ?? '',
      next_step_at: d.next_step_at ? toLocalInput(new Date(d.next_step_at)) : '', notes: d.notes ?? '', lost_reason: d.lost_reason ?? '',
    } : blank);
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim() && !form.contact_name.trim()) { toast({ title: 'Give the deal a name', tone: 'warning' }); return; }
    setBusy(true);
    const row = {
      title: form.title.trim() || `${form.contact_name.trim()}${form.service ? ` — ${form.service}` : ''}`,
      contact_name: form.contact_name.trim() || null, company: form.company.trim() || null, email: form.email.trim() || null,
      phone: form.phone.trim() || null, service: form.service.trim() || null,
      amount_usd: Number(form.amount_usd.replace(/[^\d.]/g, '')) || 0, probability: form.probability, stage: form.stage,
      expected_close: form.expected_close || null, next_step: form.next_step.trim() || null,
      next_step_at: form.next_step_at ? new Date(form.next_step_at).toISOString() : null,
      notes: form.notes.trim() || null, lost_reason: form.stage === 'lost' ? form.lost_reason.trim() || null : null,
    };
    try {
      if (d) must(await supabase.from('deals').update(row).eq('id', d.id).select());
      else must(await supabase.from('deals').insert({ ...row, owner_id: profile!.id }).select());
      if (row.stage === 'won' && d?.stage !== 'won') celebrate('big');
      toast({ title: d ? 'Deal updated' : 'Deal added', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['deals'] });
      void qc.invalidateQueries({ queryKey: ['sales-stats'] });
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!d) return;
    setBusy(true);
    const { error } = await supabase.from('deals').delete().eq('id', d.id);
    setBusy(false);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    toast({ title: 'Deal deleted', tone: 'success' });
    void qc.invalidateQueries({ queryKey: ['deals'] });
    onClose();
  };

  return (
    <Sheet
      open={!!deal}
      onClose={onClose}
      title={isNew ? 'New deal' : 'Deal'}
      width={640}
      footer={
        <>
          {d && (confirm
            ? <Button variant="danger" loading={busy} onClick={remove} icon={<Trash2 className="size-4" />}>Really delete</Button>
            : <Button variant="ghost" className="mr-auto text-bad" onClick={() => setConfirm(true)} icon={<Trash2 className="size-4" />}>Delete</Button>)}
          <Button variant="glass" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>{isNew ? 'Add deal' : 'Save'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Deal name" placeholder="e.g. Halcyon — patient app" value={form.title} onChange={(e) => set('title', e.target.value)} />
        <Input label="Contact" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
        <Input label="Company" value={form.company} onChange={(e) => set('company', e.target.value)} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <Input label="Service" value={form.service} onChange={(e) => set('service', e.target.value)} />
        <Input label="Deal value (USD)" inputMode="decimal" leading={<span className="text-[13px] font-bold">$</span>} value={form.amount_usd} onChange={(e) => set('amount_usd', e.target.value)} />
        <Picker
          label="Stage"
          value={form.stage}
          onChange={(v) => setForm((f) => ({ ...f, stage: v, probability: { prospect: 10, meeting: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 }[v] }))}
          options={STAGES.map((s) => ({ value: s.key, label: s.label, dot: s.color, hint: s.hint }))}
        />
        <div>
          <label className="label flex justify-between"><span>Likelihood to close</span><span className="tabular text-[var(--text)]">{form.probability}%</span></label>
          <input type="range" min={0} max={100} step={5} value={form.probability} onChange={(e) => set('probability', Number(e.target.value))} className="mt-2 w-full accent-[#7C5CFF]" />
        </div>
        <Input label="Expected close" type="date" value={form.expected_close} onChange={(e) => set('expected_close', e.target.value)} />
        {form.stage === 'lost' && <Input label="Why was it lost?" value={form.lost_reason} onChange={(e) => set('lost_reason', e.target.value)} />}
        <Input label="Next step" placeholder="e.g. Send revised quote" value={form.next_step} onChange={(e) => set('next_step', e.target.value)} />
        <Input label="Next step due" type="datetime-local" value={form.next_step_at} onChange={(e) => set('next_step_at', e.target.value)} />
        <Textarea className="sm:col-span-2" label="Notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
    </Sheet>
  );
}
