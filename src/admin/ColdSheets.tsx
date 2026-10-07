import { useMemo, useState } from 'react';
import clsx from 'clsx';
import Papa from 'papaparse';
import { ChevronDown, Download, Filter, PhoneOutgoing, Trash2, Upload } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { must, rpc, supabase } from '@/lib/supabase';
import type { ColdDetails, Lead, LeadOutcome, Profile, SheetColumn } from '@/lib/types';
import { fillFieldsOf, useLeadSheets, type SheetWithMembers } from '@/data/sheets';
import { outcomeMap, useOutcomes } from '@/data/sales';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Chip, Empty, ProgressBar, Sheet, Skeleton, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { ago, count, localISO } from '@/lib/format';

type SheetLead = Pick<Lead, 'id' | 'name' | 'phone' | 'personal_email' | 'work_email' | 'assigned_to' | 'status' | 'stage' | 'attempts'
  | 'connected' | 'last_attempt_at' | 'next_action_at' | 'last_comment' | 'closed_reason' | 'details'>;

const COLS = 'id, name, phone, personal_email, work_email, assigned_to, status, stage, attempts, connected, last_attempt_at, next_action_at, last_comment, closed_reason, details';

async function sheetLeads(id: number) {
  const out: SheetLead[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await supabase.from('leads').select(COLS).eq('sheet_id', id).order('id').range(from, from + 999)) as SheetLead[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

const meetingSet = (l: SheetLead) => (l.stage === 'pipeline' && l.status !== 'interested') || l.status === 'won';

/** Admin: every cold call sheet, who dials it, how far they've got, and what they found out. */
export function ColdSheets({ open, onClose, reps, onImport, onShowLeads }: {
  open: boolean;
  onClose: () => void;
  reps: Profile[];
  onImport: () => void;
  onShowLeads: (sheetId: number) => void;
}) {
  const sheets = useLeadSheets(open);
  const [expanded, setExpanded] = useState<number | null>(null);
  const first = sheets.data?.[0]?.id ?? null;
  const shown = expanded ?? first;
  return (
    <Sheet open={open} onClose={onClose} title="Cold call sheets" width={900}
      footer={<><Button variant="glass" onClick={onClose}>Close</Button><Button variant="primary" icon={<Upload className="size-4" />} onClick={onImport}>Import a cold call sheet</Button></>}>
      {sheets.isLoading && <Skeleton className="h-40 w-full" />}
      {sheets.data?.length === 0 && (
        <Empty art={<PhoneOutgoing className="size-12 text-iris" />} title="No cold call sheets yet"
          body="Import a sheet of businesses to cold call and pick who dials it. It stays apart from your normal leads." />
      )}
      <div className="space-y-3">
        {sheets.data?.map((s) => (
          <SheetCard key={s.id} sheet={s} reps={reps} open={shown === s.id} onToggle={() => setExpanded(shown === s.id ? -1 : s.id)}
            onShowLeads={() => onShowLeads(s.id)} />
        ))}
      </div>
    </Sheet>
  );
}

function SheetCard({ sheet, reps, open, onToggle, onShowLeads }: {
  sheet: SheetWithMembers; reps: Profile[]; open: boolean; onToggle: () => void; onShowLeads: () => void;
}) {
  const leads = useQuery({ queryKey: ['sheet-leads', sheet.id], enabled: open, queryFn: () => sheetLeads(sheet.id) });
  const outcomes = useOutcomes();
  const omap = useMemo(() => outcomeMap(outcomes.data), [outcomes.data]);
  const saved = sheet.lead_sheet_members.map((m) => m.user_id);
  const [members, setMembers] = useState<string[]>(saved);
  const [notes, setNotes] = useState(sheet.instructions ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const byId = new Map(reps.map((r) => [r.id, r]));
  const changed = members.length !== saved.length || members.some((m) => !saved.includes(m));
  const fields = fillFieldsOf(sheet);

  const l = leads.data ?? [];
  const called = l.filter((x) => x.attempts > 0).length;
  const stats = [
    ['Not called yet', l.length - called, '#7C5CFF'],
    ['Called', called, '#0A84FF'],
    ['Reached someone', l.filter((x) => x.connected).length, '#30C46C'],
    ['Meetings', l.filter(meetingSet).length, '#FF9F0A'],
    ['Do not call', l.filter((x) => x.status === 'do_not_call').length, '#FF453A'],
  ] as const;
  const perRep = [...new Set(l.map((x) => x.assigned_to).filter(Boolean) as string[])].map((id) => ({
    id, businesses: l.filter((x) => x.assigned_to === id).length, calls: l.filter((x) => x.assigned_to === id).reduce((n, x) => n + x.attempts, 0),
  })).sort((a, b) => b.calls - a.calls);

  const answer = (x: SheetLead, label: string) => ((x.details ?? {}) as ColdDetails).answers?.[label] ?? '';

  const saveMembers = async () => {
    setBusy('members');
    try {
      await rpc('set_sheet_members', { p_sheet: sheet.id, p_members: members, p_notify: true });
      toast({ title: 'Saved who can dial it', body: 'Anyone added has been told. Anyone taken off handed back the businesses they hadn’t finished.', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['lead-sheets'] });
      void qc.invalidateQueries({ queryKey: ['sheet-leads', sheet.id] });
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(null); }
  };
  const saveNotes = async () => {
    setBusy('notes');
    try {
      must(await supabase.from('lead_sheets').update({ instructions: notes.trim() || null }).eq('id', sheet.id).select('id'));
      toast({ title: 'Saved', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['lead-sheets'] });
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${sheet.name} and its businesses? Ones that became a prospect, a meeting or a deal stay as ordinary leads. This cannot be undone.`)) return;
    setBusy('delete');
    try {
      const n = await rpc<number>('delete_lead_sheet', { p_sheet: sheet.id });
      toast({ title: `${sheet.name} deleted`, body: `${count(n)} businesses removed.`, tone: 'success' });
      void qc.invalidateQueries();
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(null); }
  };

  return (
    <div className="glass overflow-hidden rounded-[24px]">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-iris/15 text-iris"><PhoneOutgoing className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold">{sheet.name}</span>
          <span className="text-3 block text-[12.5px]">Uploaded {ago(sheet.created_at)} · {saved.length} {saved.length === 1 ? 'dialer' : 'dialers'}</span>
        </span>
        <span className="hidden -space-x-2 sm:flex">
          {saved.slice(0, 6).map((id) => byId.get(id) && <AgentAvatar key={id} who={byId.get(id)!} size={26} />)}
        </span>
        <ChevronDown className={clsx('size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-5 border-t border-[var(--hairline)] px-5 py-5">
          {leads.isLoading ? <Skeleton className="h-24 w-full" /> : (
            <>
              <div>
                <div className="mb-2 flex items-baseline justify-between text-[13px]">
                  <b>{count(called)} of {count(l.length)} businesses called</b>
                  <span className="text-3">{l.length ? Math.round((called / l.length) * 100) : 0}%</span>
                </div>
                <ProgressBar value={called} max={Math.max(l.length, 1)} height={10} />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {stats.map(([label, n, color]) => (
                    <div key={label} className="fill rounded-2xl px-3 py-2">
                      <div className="text-[11px] font-bold" style={{ color }}>{label}</div>
                      <div className="tabular text-[20px] font-extrabold">{count(n)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {perRep.length > 0 && (
                <div>
                  <div className="label">Who has called what</div>
                  <div className="flex flex-wrap gap-2">
                    {perRep.map((r) => {
                      const p = byId.get(r.id);
                      return (
                        <span key={r.id} className="fill inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[12.5px]">
                          {p && <AgentAvatar who={p} size={24} />}<b>{p?.full_name.split(' ')[0] ?? 'Someone'}</b>
                          <span className="text-3">{count(r.businesses)} {r.businesses === 1 ? 'business' : 'businesses'} · {count(r.calls)} {r.calls === 1 ? 'call' : 'calls'}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {fields.length > 0 && (
                <div>
                  <div className="label">What dialers filled in</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fields.map((f) => {
                      const vals = l.map((x) => answer(x, f.label)).filter(Boolean);
                      const nums = vals.map((v) => Number(v.replace(/[^\d.]/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
                      return (
                        <div key={f.label} className="fill rounded-2xl px-3.5 py-2.5">
                          <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                            <b className="truncate">{f.label}</b><span className="text-3 shrink-0">{count(vals.length)} answered</span>
                          </div>
                          <div className="text-2 mt-1 text-[12.5px]">
                            {f.options?.length
                              ? f.options.map((o) => ({ o, n: vals.filter((v) => v === o).length })).filter((x) => x.n).map((x) => `${x.o} ${x.n}`).join(' · ') || 'Nothing yet'
                              : nums.length ? `Average ${Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10}` : vals.length ? `Latest: ${vals[vals.length - 1]}` : 'Nothing yet'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <div className="label">Who can dial it</div>
            <div className="flex flex-wrap gap-2">
              {reps.map((r) => (
                <Chip key={r.id} active={members.includes(r.id)} onClick={() => setMembers((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))}>
                  <AgentAvatar who={r} size={22} />{r.full_name}
                </Chip>
              ))}
            </div>
            {changed && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button size="sm" variant="primary" loading={busy === 'members'} disabled={!members.length} onClick={() => void saveMembers()}>Save who can dial it</Button>
                <button type="button" className="text-2 text-[13px] font-bold" onClick={() => setMembers(saved)}>Undo</button>
                <span className="text-3 text-[12px]">Anyone taken off hands back the businesses they hadn't finished.</span>
              </div>
            )}
          </div>

          <div>
            <Textarea label="How to work this sheet" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} hint="Dialers see this next to the card." />
            {notes !== (sheet.instructions ?? '') && (
              <Button size="sm" variant="primary" className="mt-2" loading={busy === 'notes'} onClick={() => void saveNotes()}>Save</Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="glass" icon={<Download className="size-4" />} disabled={!leads.data} onClick={() => downloadSheet(sheet, l, omap, byId)}>Download with answers</Button>
            <Button size="sm" variant="glass" icon={<Filter className="size-4" />} onClick={onShowLeads}>Show its businesses</Button>
            <Button size="sm" variant="ghost" className="ml-auto text-bad" icon={<Trash2 className="size-4" />} loading={busy === 'delete'} onClick={() => void remove()}>Delete sheet</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The sheet back in its own columns, with what was found out filled in: the answers
 * typed on the cards, and the call date, outcome, notes and next step from NUUKE.
 */
function downloadSheet(sheet: SheetWithMembers, leads: SheetLead[], omap: Map<string, LeadOutcome>, byId: Map<string, Profile>) {
  const cols = (sheet.columns ?? []) as unknown as SheetColumn[];
  const date = (iso: string | null) => (iso ? localISO(new Date(iso)) : '');
  const nextStep = (l: SheetLead) => {
    if (l.status === 'do_not_call') return 'Do not call';
    if (l.status === 'won') return 'Closed - won';
    if (meetingSet(l)) return 'Meeting booked';
    if (l.stage === 'closed') return omap.get(l.status)?.label ?? 'Closed';
    return l.next_action_at ? `Call again ${date(l.next_action_at)}` : '';
  };
  const value = (l: SheetLead, c: SheetColumn) => {
    const d = (l.details ?? {}) as ColdDetails;
    switch (c.role) {
      case 'name': return l.name;
      case 'phone': return l.phone ?? '';
      case 'email': return l.work_email ?? l.personal_email ?? '';
      case 'contact': return d.contact ?? '';
      case 'priority': return d.priority ?? '';
      case 'ref': return d.ref ?? '';
      case 'show': return d.fields?.find((f) => f.label === c.label)?.value ?? '';
      case 'fill': return d.answers?.[c.label] ?? '';
      case 'logged':
        if (!l.attempts) return '';
        if (/date/i.test(c.label)) return date(l.last_attempt_at);
        if (/outcome|result/i.test(c.label)) return omap.get(l.status)?.label ?? l.status;
        if (/note|comment/i.test(c.label)) return l.last_comment ?? '';
        if (/next|follow/i.test(c.label)) return nextStep(l);
        return '';
      default: return '';
    }
  };
  const rows = [...leads].sort((a, b) => (((a.details ?? {}) as ColdDetails).row ?? 0) - (((b.details ?? {}) as ColdDetails).row ?? 0));
  const csv = Papa.unparse({
    fields: [...cols.map((c) => c.label), 'Dialer', 'Calls made', 'Status in NUUKE'],
    data: rows.map((l) => [...cols.map((c) => value(l, c)), l.assigned_to ? byId.get(l.assigned_to)?.full_name ?? '' : '', String(l.attempts),
      l.attempts ? omap.get(l.status)?.label ?? l.status : 'Not called yet']),
  });
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sheet.name.replace(/[^\w\- ]+/g, '').trim() || 'cold-call-sheet'} (NUUKE ${localISO()}).csv`;
  a.click();
  URL.revokeObjectURL(url);
}
