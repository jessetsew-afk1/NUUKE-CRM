import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowUpRight, Coffee, FileSpreadsheet, Headphones, PhoneIncoming, Trophy, UserX, Users, Wallet,
} from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useNotifications } from '@/app/notifications';
import { useAttendanceBoard, useAudit, usePayrollOverview, useTeamOverview } from '@/data/admin';
import { supabase } from '@/lib/supabase';
import { Agent } from '@/agent/Agent';
import { normaliseAgent } from '@/agent/catalog';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, PageHeader, Panel, PanelHeader, Skeleton, Stat } from '@/ui/kit';
import { ago, count, firstName, greeting, localISO, payPeriod, pkr, time, usd, usdShort } from '@/lib/format';
import { describeAudit } from './AdminAudit';

const STATE: Record<string, { label: string; color: string }> = {
  online: { label: 'Online', color: '#30C46C' },
  break: { label: 'On break', color: '#FF9F0A' },
  absent: { label: 'Not signed in', color: '#FF453A' },
  not_started: { label: 'Shift not started', color: '#8E8AA0' },
  signed_out: { label: 'Signed out', color: '#5AB8FF' },
  day_off: { label: 'Day off', color: '#B9B5C9' },
};

const headCount = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
const leadsHead = () => supabase.from('leads').select('*', { count: 'exact', head: true });

export default function AdminHome() {
  const { profile, agent } = useAuth();
  const navigate = useNavigate();
  const today = localISO();
  const period = payPeriod(today);
  const board = useAttendanceBoard();
  const team = useTeamOverview(today, today);
  const teamMonth = useTeamOverview(period.start, today);
  const payroll = usePayrollOverview(period.start);
  const audit = useAudit({});
  const { items } = useNotifications();

  const leads = useQuery({
    queryKey: ['lead-health'],
    queryFn: async () => {
      const [total, unassigned, queue, pipeline, exhausted] = await Promise.all([
        headCount(leadsHead()),
        headCount(leadsHead().is('assigned_to', null)),
        headCount(leadsHead().eq('stage', 'queue').not('assigned_to', 'is', null)),
        headCount(leadsHead().eq('stage', 'pipeline')),
        headCount(leadsHead().eq('closed_reason', 'exhausted')),
      ]);
      return { total, unassigned, queue, pipeline, exhausted };
    },
  });

  const states = useMemo(() => {
    const g = new Map<string, NonNullable<typeof board.data>>();
    for (const r of board.data ?? []) g.set(r.state, [...(g.get(r.state) ?? []), r]);
    return g;
  }, [board.data]);
  const lateToday = (board.data ?? []).filter((r) => r.first_in && r.late_minutes >= 15);

  const t = team.data ?? [];
  const sum = (k: 'dials' | 'connected' | 'meetings' | 'won_usd') => t.reduce((s, r) => s + Number(r[k]), 0);
  const m = teamMonth.data ?? [];
  const wonPeriod = m.reduce((s, r) => s + Number(r.won_usd), 0);
  const pipelineOpen = m.reduce((s, r) => s + Number(r.open_pipeline_usd), 0);
  const alerts = items.filter((n) => n.tone === 'danger' || n.tone === 'warning').slice(0, 7);
  const payrollTotal = (payroll.data ?? []).reduce((s, p) => s + Number(p.net_pkr), 0);

  return (
    <>
      <PageHeader
        eyebrow={greeting()}
        title={`Hi ${firstName(profile?.full_name)} — here's NUUKE today`}
        sub={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Karachi' })}
        right={<div className="hidden sm:block"><Agent config={agent} size={72} mood="wave" /></div>}
      />

      {/* who's here */}
      <Panel strong className="mb-5">
        <PanelHeader title="Right now" sub="Live attendance across the team" right={<Button size="sm" variant="glass" iconRight={<ArrowUpRight className="size-3.5" />} onClick={() => navigate('/admin/attendance')}>Attendance</Button>} />
        {board.isLoading ? <Skeleton className="h-24" /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {['online', 'break', 'absent', 'not_started'].map((s) => {
              const people = states.get(s) ?? [];
              return (
                <div key={s} className="fill rounded-[20px] p-4">
                  <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide" style={{ color: STATE[s].color }}>
                    <span className="size-2 rounded-full" style={{ background: STATE[s].color, boxShadow: `0 0 8px ${STATE[s].color}` }} />
                    {STATE[s].label}
                  </div>
                  <div className="tabular mt-1 font-display text-[30px] font-black leading-none">{people.length}</div>
                  <div className="mt-3 flex -space-x-2">
                    {people.slice(0, 7).map((p) => (
                      <motion.span key={p.profile_id} whileHover={{ y: -4, zIndex: 2 }} className="relative" title={`${p.full_name}${p.first_in ? ` · in ${time(p.first_in)}` : ''}`}>
                        <AgentAvatar who={{ id: p.profile_id, avatar: p.avatar, full_name: p.full_name }} size={34} ring="var(--canvas)" />
                      </motion.span>
                    ))}
                    {people.length > 7 && <span className="fill-2 relative grid size-[34px] place-items-center rounded-full text-[11px] font-bold">+{people.length - 7}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {lateToday.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-2 font-semibold">Late today:</span>
            {lateToday.map((r) => (
              <span key={r.profile_id} className="rounded-full bg-warn/15 px-2.5 py-1 font-semibold text-warn">{firstName(r.full_name)} · {r.late_minutes}m</span>
            ))}
          </div>
        )}
      </Panel>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Dials today" value={count(sum('dials'))} sub={`${t.length} reps on the floor`} icon={<Headphones className="size-4" />} accent="#7C5CFF" />
        <Stat label="Connected today" value={count(sum('connected'))} sub={sum('dials') ? `${Math.round((sum('connected') / sum('dials')) * 100)}% pick-up` : '—'} icon={<PhoneIncoming className="size-4" />} accent="#2FB98C" />
        <Stat label="Closed this period" value={usdShort(wonPeriod)} sub={`since ${period.start.slice(8)} ${new Date(period.start).toLocaleString('en', { month: 'short' })}`} icon={<Trophy className="size-4" />} accent="#30C46C" />
        <Stat label="Open pipeline" value={usdShort(pipelineOpen)} sub="across all reps" icon={<ArrowUpRight className="size-4" />} accent="#5AB8FF" />
        <Stat label="Payroll estimate" value={pkr(payrollTotal)} sub="this period so far" icon={<Wallet className="size-4" />} accent="#F08A4B" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel>
          <PanelHeader title="Needs your attention" sub="Late arrivals, no-shows, missed sign-outs and long breaks" />
          {alerts.length === 0 ? (
            <p className="text-3 py-8 text-center text-[13px]">All quiet. 🌿</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((n) => (
                <button key={n.id} type="button" onClick={() => n.link && navigate(n.link)}
                  className="fill flex w-full items-start gap-3 rounded-2xl px-3.5 py-3 text-left hover:bg-[var(--fill-2)]">
                  <span className={clsx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl', n.tone === 'danger' ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn')}>
                    {n.kind.includes('break') ? <Coffee className="size-4" /> : n.kind.includes('no_show') ? <UserX className="size-4" /> : <AlertTriangle className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold">{n.title}</span>
                    {n.body && <span className="text-2 block text-[13px]">{n.body}</span>}
                  </span>
                  <span className="text-3 shrink-0 text-[12px]">{ago(n.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Top closers this period" right={<Button size="sm" variant="glass" iconRight={<ArrowUpRight className="size-3.5" />} onClick={() => navigate('/admin/sales')}>Sales floor</Button>} />
          {teamMonth.isLoading ? <Skeleton className="h-48" /> : (
            <div className="space-y-2">
              {[...m].sort((a, b) => Number(b.won_usd) - Number(a.won_usd)).slice(0, 5).map((r, i) => {
                const ratio = r.target_usd ? Number(r.won_usd) / Number(r.target_usd) : 0;
                return (
                  <div key={r.profile_id} className="flex items-center gap-3">
                    <span className="text-3 tabular w-4 text-[13px] font-extrabold">{i + 1}</span>
                    <Agent config={normaliseAgent(r.avatar, r.profile_id)} size={38} animated={false} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14px] font-bold">{r.full_name}</span>
                        <span className="tabular text-[14px] font-extrabold">{usd(r.won_usd)}</span>
                      </div>
                      <div className="fill mt-1 h-1.5 overflow-hidden rounded-full">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratio >= 1 ? '#30C46C' : ratio <= 0.3 ? '#FF9F0A' : 'var(--viz-1)' }} />
                      </div>
                      <div className="text-3 mt-0.5 text-[11px]">{Math.round(ratio * 100)}% of {usdShort(r.target_usd)} target</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Lead health" right={<Button size="sm" variant="primary" icon={<FileSpreadsheet className="size-3.5" />} onClick={() => navigate('/admin/leads')}>Import / assign</Button>} />
          {!leads.data ? <Skeleton className="h-24" /> : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ['Total', leads.data.total, '#7C5CFF'],
                ['Unassigned', leads.data.unassigned, '#FF9F0A'],
                ['Being dialled', leads.data.queue, '#5AB8FF'],
                ['In pipelines', leads.data.pipeline, '#30C46C'],
                ['Exhausted', leads.data.exhausted, '#8E8AA0'],
              ].map(([label, v, c]) => (
                <div key={label as string} className="fill rounded-2xl px-3 py-2.5">
                  <div className="text-[11px] font-bold" style={{ color: c as string }}>{label}</div>
                  <div className="tabular text-[20px] font-extrabold">{count(v as number)}</div>
                </div>
              ))}
            </div>
          )}
          {leads.data && leads.data.unassigned > 0 && (
            <p className="text-2 mt-3 text-[13px]"><b>{count(leads.data.unassigned)}</b> leads are waiting to be assigned to a rep.</p>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Latest changes" right={<Button size="sm" variant="glass" iconRight={<ArrowUpRight className="size-3.5" />} onClick={() => navigate('/admin/audit')}>Activity log</Button>} />
          <AuditPreview entries={audit.data?.slice(0, 7) ?? []} />
        </Panel>
      </div>
    </>
  );
}

function AuditPreview({ entries }: { entries: NonNullable<ReturnType<typeof useAudit>['data']> }) {
  const people = useQuery({
    queryKey: ['people-min'],
    queryFn: async () => (await supabase.from('profiles').select('id, full_name, avatar')).data ?? [],
  });
  const byId = new Map((people.data ?? []).map((p) => [p.id, p]));
  if (!entries.length) return <p className="text-3 py-6 text-center text-[13px]">Nothing yet.</p>;
  return (
    <div className="space-y-2.5">
      {entries.map((e) => {
        const who = e.actor_id ? byId.get(e.actor_id) : null;
        return (
          <div key={e.id} className="flex items-start gap-3 text-[13px]">
            {who ? <AgentAvatar who={who} size={28} /> : <span className="fill grid size-7 place-items-center rounded-full"><Users className="size-3.5" /></span>}
            <div className="min-w-0 flex-1">
              <span className="font-bold">{who?.full_name ?? 'System'}</span> <span className="text-2">{describeAudit(e)}</span>
            </div>
            <span className="text-3 shrink-0 text-[12px]">{ago(e.created_at)}</span>
          </div>
        );
      })}
    </div>
  );
}
