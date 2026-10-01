import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { LogIn, LogOut, RotateCw } from 'lucide-react';
import { useAudit } from '@/data/admin';
import { must, supabase } from '@/lib/supabase';
import type { AuditEntry, Profile } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Empty, Input, PageHeader, Panel, Picker, Segmented, Skeleton } from '@/ui/kit';
import { addDaysISO, localISO, time } from '@/lib/format';

const ENTITY_LABEL: Record<string, string> = {
  profiles: 'profile', employment: 'pay & shift', settings: 'company rules', holidays: 'holidays', leads: 'leads',
  deals: 'deal', meetings: 'meeting', attendance_days: 'attendance', users: 'login', payroll: 'payroll',
};
const FIELD_LABEL: Record<string, string> = {
  stage: 'stage', amount_usd: 'value', probability: 'likelihood', monthly_salary_pkr: 'salary', shift_start: 'shift start',
  monthly_target_usd: 'monthly target', daily_dial_target: 'daily dial target', role: 'role', is_active: 'access',
  override_status: 'attendance status', full_name: 'name', title: 'title', department: 'department', status: 'status',
  expected_close: 'expected close', next_step: 'next step', starts_at: 'time', assigned_to: 'owner',
};

const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** A sentence for an audit row, e.g. "moved “Ethan — Web” to won". */
export function describeAudit(e: AuditEntry): string {
  if (e.summary) return e.summary.charAt(0).toLowerCase() + e.summary.slice(1);
  const what = ENTITY_LABEL[e.entity] ?? e.entity;
  const c = (e.changes ?? {}) as Record<string, unknown>;
  const name = (c.title ?? c.full_name ?? c.name) as string | undefined;
  if (e.action === 'insert') return `added a ${what}${name ? ` “${fmt(name)}”` : ''}`;
  if (e.action === 'delete') return `deleted a ${what}${name ? ` “${fmt(name)}”` : ''}`;
  const parts = Object.entries(c)
    .filter(([k]) => !['position', 'updated_at', 'won_on'].includes(k))
    .slice(0, 3)
    .map(([k, v]) => {
      const [from, to] = Array.isArray(v) ? v : [undefined, v];
      return `${FIELD_LABEL[k] ?? k.replace(/_/g, ' ')} ${fmt(from)} → ${fmt(to)}`;
    });
  return `changed ${what} #${e.entity_id ?? ''}: ${parts.join(', ') || 'details'}`;
}

export default function AdminAudit() {
  const [tab, setTab] = useState<'changes' | 'logins'>('changes');
  const [actor, setActor] = useState('__all');
  const [entity, setEntity] = useState('__all');
  const [from, setFrom] = useState(addDaysISO(localISO(), -6));
  const [to, setTo] = useState(localISO());
  const people = useQuery({ queryKey: ['people'], queryFn: async () => must(await supabase.from('profiles').select('*').order('full_name')) as Profile[] });
  const byId = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);
  const audit = useAudit({ actor: actor === '__all' ? null : actor, entity: entity === '__all' ? null : entity, from, to });
  const logins = useQuery({
    queryKey: ['logins', actor, from, to],
    enabled: tab === 'logins',
    queryFn: async () => {
      let q = supabase.from('login_events').select('*').gte('created_at', `${from}T00:00:00+05:00`).lte('created_at', `${to}T23:59:59+05:00`).order('created_at', { ascending: false }).limit(400);
      if (actor !== '__all') q = q.eq('user_id', actor);
      return must(await q) as { id: number; user_id: string; kind: string; user_agent: string | null; created_at: string }[];
    },
  });

  const rows = tab === 'changes' ? audit.data ?? [] : [];
  const grouped = useMemo(() => {
    const g = new Map<string, AuditEntry[]>();
    for (const r of rows) {
      const d = r.created_at.slice(0, 10);
      g.set(d, [...(g.get(d) ?? []), r]);
    }
    return [...g.entries()];
  }, [rows]);

  return (
    <>
      <PageHeader title="Activity log" sub="Who changed what and when — every edit, sign-in and sign-out." />
      <Panel className="mb-5 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'changes', label: 'Changes' }, { value: 'logins', label: 'Sign-ins' }]} />
          <Picker className="w-[200px]" value={actor} onChange={setActor} options={[{ value: '__all', label: 'Everyone' }, ...(people.data ?? []).map((p) => ({ value: p.id, label: p.full_name, hint: p.role }))]} />
          {tab === 'changes' && (
            <Picker className="w-[180px]" value={entity} onChange={setEntity} options={[{ value: '__all', label: 'Anything' }, ...Object.entries(ENTITY_LABEL).map(([k, v]) => ({ value: k, label: v.charAt(0).toUpperCase() + v.slice(1) }))]} />
          )}
          <Input type="date" className="w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <Input type="date" className="w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </div>
      </Panel>

      {tab === 'changes' ? (
        audit.isLoading ? <Skeleton className="h-96 rounded-[26px]" /> : grouped.length === 0 ? (
          <Panel><Empty title="No changes in this range" /></Panel>
        ) : (
          <div className="space-y-5">
            {grouped.map(([d, list]) => (
              <section key={d}>
                <div className="text-3 mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.12em]">{format(parseISO(d), 'EEEE d MMMM')}</div>
                <Panel padded={false} className="divide-y divide-[var(--hairline)]">
                  {list.map((e) => {
                    const who = e.actor_id ? byId.get(e.actor_id) : null;
                    return (
                      <div key={e.id} className="flex items-start gap-3 px-4 py-3 text-[13px]">
                        {who ? <AgentAvatar who={who} size={30} /> : <span className="fill grid size-[30px] place-items-center rounded-full text-[10px] font-bold">SYS</span>}
                        <div className="min-w-0 flex-1">
                          <span className="font-bold">{who?.full_name ?? 'System'}</span> <span className="text-2 break-words">{describeAudit(e)}</span>
                        </div>
                        <span className="text-3 tabular shrink-0 text-[12px]">{time(e.created_at)}</span>
                      </div>
                    );
                  })}
                </Panel>
              </section>
            ))}
          </div>
        )
      ) : logins.isLoading ? <Skeleton className="h-96 rounded-[26px]" /> : (
        <Panel padded={false} className="divide-y divide-[var(--hairline)]">
          {(logins.data ?? []).length === 0 && <Empty title="No sign-ins in this range" />}
          {(logins.data ?? []).map((l) => {
            const who = byId.get(l.user_id);
            return (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                <AgentAvatar who={who} size={30} />
                <span className="font-bold">{who?.full_name ?? 'Unknown'}</span>
                <span className="text-2 flex items-center gap-1.5">
                  {l.kind === 'login' ? <><LogIn className="size-3.5 text-ok" />signed in</> : l.kind === 'logout' ? <><LogOut className="size-3.5 text-bad" />signed out</> : <><RotateCw className="size-3.5" />came back</>}
                </span>
                <span className="text-3 hidden truncate md:inline">{l.user_agent?.match(/\(([^)]+)\)/)?.[1] ?? ''}</span>
                <span className="text-3 tabular ml-auto shrink-0">{format(parseISO(l.created_at), 'd MMM, h:mm a')}</span>
              </div>
            );
          })}
        </Panel>
      )}
    </>
  );
}
