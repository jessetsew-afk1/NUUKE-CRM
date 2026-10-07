import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Info } from 'lucide-react';
import type { Profile } from '@/lib/types';
import { handOverWork, type PersonWork } from '@/data/admin';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Chip, Sheet, Skeleton } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { count, firstName } from '@/lib/format';

const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/**
 * Hands everything a salesperson is working on to one or more colleagues: each client
 * to one person (whoever already has that client, else shared out evenly), with their
 * open deals and booked meetings. Their history stays in their name.
 */
export function HandOverSheet({ person, work, reps, onClose }: {
  person: Profile | null;
  work: PersonWork | undefined;
  reps: Profile[];
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const others = reps.filter((r) => r.id !== person?.id && r.is_active && r.role === 'sales');
  const first = firstName(person?.full_name);

  useEffect(() => { setPicked([]); }, [person?.id]);

  const plan = useQuery({
    queryKey: ['hand-over-plan', person?.id, [...picked].sort()],
    enabled: !!person && picked.length > 0,
    placeholderData: (prev) => prev,
    queryFn: () => handOverWork(person!.id, picked, false),
  });
  const p = picked.length ? plan.data : undefined;

  const run = async () => {
    if (!person || !p) return;
    if (!window.confirm(`Hand ${first}'s work to ${picked.length === 1 ? others.find((r) => r.id === picked[0])?.full_name : `${picked.length} people`}? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await handOverWork(person.id, picked, true);
      toast({
        title: `${first}'s work has been handed over`,
        body: `${plural(res.clients, 'client')}, ${plural(res.deals, 'open deal')} and ${plural(res.meetings, 'meeting')}. Everyone who got something has been told.`,
        tone: 'success',
      });
      void qc.invalidateQueries();
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!person} onClose={onClose} width={720} title={`Hand over ${first}'s work`}
      footer={<>
        <Button variant="glass" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={<ArrowRightLeft className="size-4" />} loading={busy} disabled={!p || plan.isFetching || !picked.length} onClick={() => void run()}>
          {picked.length > 1 ? `Hand over to ${picked.length} people` : picked.length ? `Hand over to ${firstName(others.find((r) => r.id === picked[0])?.full_name)}` : 'Hand over'}
        </Button>
      </>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ['Leads still open', work?.open_leads ?? 0, '#7C5CFF'],
            ['All their leads', work?.leads ?? 0, '#8E8AA0'],
            ['Open deals', work?.deals ?? 0, '#FF9F0A'],
            ['Booked meetings', work?.meetings ?? 0, '#30C46C'],
          ] as const).map(([label, n, color]) => (
            <div key={label} className="fill rounded-2xl px-3 py-2.5">
              <div className="text-[11px] font-bold" style={{ color }}>{label}</div>
              <div className="tabular text-[22px] font-extrabold">{count(n)}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="label">Give it to · {picked.length > 1 ? 'shared out evenly, each client to one person' : picked.length ? 'everything to one person' : 'pick one or more'}</div>
          <div className="flex flex-wrap gap-2">
            {others.map((r) => (
              <Chip key={r.id} active={picked.includes(r.id)} onClick={() => setPicked((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))}>
                <AgentAvatar who={r} size={22} />{r.full_name}
              </Chip>
            ))}
            {others.length > 1 && <button type="button" className="text-[13px] font-bold text-iris" onClick={() => setPicked(others.map((r) => r.id))}>Everyone</button>}
            {others.length === 0 && <p className="text-3 text-[13px]">There's no other active salesperson to hand it to.</p>}
          </div>
        </div>

        {picked.length > 0 && (plan.isLoading && !p ? <Skeleton className="h-28 w-full" /> : p && (
          <div className="fill overflow-hidden rounded-[20px]">
            <div className="scroll-x">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead className="text-3 text-[11px] font-bold uppercase tracking-wide">
                  <tr className="border-b border-[var(--hairline)]">
                    <th className="px-4 py-2.5">Goes to</th><th className="px-2 py-2.5 text-right">Clients</th><th className="px-2 py-2.5 text-right">Open</th>
                    <th className="px-2 py-2.5 text-right">Pipeline</th><th className="px-2 py-2.5 text-right">Deals</th><th className="px-4 py-2.5 text-right">Meetings</th>
                  </tr>
                </thead>
                <tbody>
                  {p.people.map((x) => {
                    const r = others.find((o) => o.id === x.id);
                    return (
                      <tr key={x.id} className="border-b border-[var(--hairline)] last:border-b-0">
                        <td className="px-4 py-2.5 font-bold"><span className="inline-flex items-center gap-2">{r && <AgentAvatar who={r} size={22} />}{x.name}</span></td>
                        <td className="tabular px-2 py-2.5 text-right">
                          {count(x.clients)}{x.already_had > 0 && <span className="text-3 block text-[11px]">{count(x.already_had)} they already had</span>}
                        </td>
                        <td className="tabular px-2 py-2.5 text-right">{count(x.open)}</td>
                        <td className="tabular px-2 py-2.5 text-right">{count(x.pipeline)}</td>
                        <td className="tabular px-2 py-2.5 text-right">{count(x.deals)}</td>
                        <td className="tabular px-4 py-2.5 text-right">{count(x.meetings)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <div className="flex items-start gap-3 rounded-[20px] bg-iris/8 p-4 text-[13px] leading-relaxed ring-1 ring-iris/20">
          <Info className="mt-0.5 size-4 shrink-0 text-iris" />
          <div className="space-y-1.5">
            <p>Each client goes to one person. Someone who already has that client keeps it, and the two cards become one with both call histories. The rest are shared out evenly.</p>
            <p>Their leads keep their place: call-backs, 2-day repeats, Do not call and meetings carry on as they were. Open deals and booked meetings go with the client.</p>
            <p className="text-2">Won and lost deals, past meetings and every call {first} made stay in {first}'s name, so pay, stats and the leaderboard don't change.</p>
            {(p?.back_to_sheet ?? 0) > 0 && <p className="text-2">{plural(p!.back_to_sheet, 'cold-sheet business', 'cold-sheet businesses')} {first} hadn't called yet go back on the sheet for the others on it.</p>}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
