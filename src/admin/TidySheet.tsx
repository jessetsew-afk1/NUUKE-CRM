import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, Eraser, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { rpc } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Chip, Sheet } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { count } from '@/lib/format';

interface Row { dialer: string; whole_sheet: boolean; leads: number; own_repeats: number; shared: number; after: number }
interface Report { applied: boolean; dialers: Row[]; own_repeats: number; shared: number; do_not_call_elsewhere: number; meeting_elsewhere: number }

const KEY = 'nuuke-whole-sheet-dialers';
const n = (x: number, one: string, many = `${one}s`) => `${count(x)} ${x === 1 ? one : many}`;

/**
 * One card per client. Each dialer keeps a single card for each client (their call
 * history merged in), and a client held by several dialers stays with one of them,
 * except the dialers picked here, who each keep the whole sheet.
 */
export function TidySheet({ open, onClose, reps }: { open: boolean; onClose: () => void; reps: Profile[] }) {
  const [whole, setWhole] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } });
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(whole)); } catch { /* ignore */ } }, [whole]);
  useEffect(() => { setReport(null); }, [whole, open]);

  const run = async (apply: boolean) => {
    setBusy(apply ? 'apply' : 'preview');
    try {
      const r = await rpc<Report>('tidy_repeat_leads', { p_whole_sheet: whole, p_apply: apply });
      setReport(r);
      if (apply) {
        toast({ title: `${n(r.own_repeats + r.shared, 'repeated card')} removed`, body: 'Every client now shows once per dialer.', tone: 'success' });
        void qc.invalidateQueries();
      }
    } catch (e) {
      toast({ title: 'That didn\'t work', body: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const total = report ? report.own_repeats + report.shared : 0;

  return (
    <Sheet open={open} onClose={onClose} width={680} title={<span className="flex items-center gap-2"><Eraser className="size-5 text-iris" />Remove repeats</span>}
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="glass" icon={<Search className="size-4" />} loading={busy === 'preview'} disabled={!!busy} onClick={() => run(false)}>Preview</Button>
          <Button variant="primary" icon={<Check className="size-4" />} loading={busy === 'apply'}
            disabled={!!busy || !report || report.applied || total + report.do_not_call_elsewhere + report.meeting_elsewhere === 0}
            onClick={() => { if (window.confirm(`Remove ${n(total, 'repeated card')}? Their call history moves onto the card that stays. This can't be undone.`)) void run(true); }}>
            {report && !report.applied ? `Remove ${n(total, 'repeat')}` : 'Remove repeats'}
          </Button>
        </div>
      )}>
      <div className="space-y-4 text-[14px]">
        <ul className="text-2 list-disc space-y-1 pl-5 text-[13.5px]">
          <li>Each dialer keeps <b>one card per client</b>, matched by phone number (or email when there's no phone).</li>
          <li>A client held by more than one dialer <b>stays with one of them</b>: whoever got furthest (a meeting, then the most calls).</li>
          <li>Call history, meetings and deals move onto the card that stays. A client marked Do not call by anyone, or with a meeting set, comes off everyone else's cards.</li>
        </ul>

        <div>
          <div className="label mb-2">Dialers who each keep the whole sheet</div>
          <div className="flex flex-wrap gap-2">
            {reps.map((r) => (
              <Chip key={r.id} active={whole.includes(r.id)} onClick={() => setWhole((w) => (w.includes(r.id) ? w.filter((x) => x !== r.id) : [...w, r.id]))}>
                <AgentAvatar who={r} size={22} />{r.full_name}
              </Chip>
            ))}
          </div>
          <p className="text-3 mt-2 text-[12.5px]">Everyone else shares clients: each client with exactly one of them.</p>
        </div>

        {report && (
          <div className={clsx('rounded-[20px] p-4', report.applied ? 'bg-ok/10 ring-1 ring-ok/30' : 'fill')}>
            <div className="mb-3 text-[14px] font-bold">
              {report.applied ? 'Done. ' : ''}{n(report.own_repeats, 'repeat')} inside a dialer's own cards, {n(report.shared, 'client')} shared between dialers
              {report.do_not_call_elsewhere ? `, ${n(report.do_not_call_elsewhere, 'card')} for clients marked Do not call elsewhere` : ''}
              {report.meeting_elsewhere ? `, ${n(report.meeting_elsewhere, 'card')} for clients with a meeting set elsewhere` : ''}.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-[13px]">
                <thead className="text-3 text-left text-[11px] uppercase tracking-[0.1em]">
                  <tr><th className="pb-2 font-bold">Dialer</th><th className="pb-2 text-right font-bold">Cards now</th><th className="pb-2 text-right font-bold">Repeats</th><th className="pb-2 text-right font-bold">Shared</th><th className="pb-2 text-right font-bold">{report.applied ? 'Cards left' : 'Cards after'}</th></tr>
                </thead>
                <tbody>
                  {report.dialers.map((d) => (
                    <tr key={d.dialer} className="border-t border-[var(--hairline)]">
                      <td className="py-1.5 font-semibold">{d.dialer}{d.whole_sheet && <span className="text-3 ml-1.5 text-[11px] font-bold">WHOLE SHEET</span>}</td>
                      <td className="tabular py-1.5 text-right">{count(d.leads)}</td>
                      <td className="tabular py-1.5 text-right">{d.own_repeats ? `−${count(d.own_repeats)}` : '0'}</td>
                      <td className="tabular py-1.5 text-right">{d.shared ? `−${count(d.shared)}` : '0'}</td>
                      <td className="tabular py-1.5 text-right font-bold">{count(d.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
