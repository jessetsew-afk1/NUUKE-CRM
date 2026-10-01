import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import clsx from 'clsx';
import { startOfWeek, format } from 'date-fns';
import { Crown, Flame, Medal } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useLeaderboard } from '@/data/sales';
import { Agent } from '@/agent/Agent';
import { normaliseAgent } from '@/agent/catalog';
import { Empty, PageHeader, Panel, Segmented, Skeleton } from '@/ui/kit';
import { celebrate } from '@/lib/celebrate';
import { count, firstName, localISO, payPeriod, usd } from '@/lib/format';
import type { LeaderRow } from '@/lib/types';

type Metric = 'meetings' | 'won_usd' | 'prospects' | 'dials' | 'connected';
type Period = 'today' | 'week' | 'month' | 'period';

const METRICS: { value: Metric; label: string; unit: (n: number) => string; noun: string }[] = [
  { value: 'meetings', label: 'Appointments', unit: (n) => count(n), noun: 'appointments' },
  { value: 'won_usd', label: 'Closed $', unit: (n) => usd(n), noun: 'closed' },
  { value: 'prospects', label: 'Prospects', unit: (n) => count(n), noun: 'prospects' },
  { value: 'dials', label: 'Dials', unit: (n) => count(n), noun: 'dials' },
  { value: 'connected', label: 'Connects', unit: (n) => count(n), noun: 'connects' },
];

const PODIUM = [
  { place: 2, h: 128, color: 'linear-gradient(180deg,#E9ECF5,#C3C8D8)', ring: '#B9C0D3', label: '2nd' },
  { place: 1, h: 172, color: 'linear-gradient(180deg,#FFE58A,#F5B91F)', ring: '#F5B91F', label: '1st' },
  { place: 3, h: 104, color: 'linear-gradient(180deg,#F6C8A4,#D98D57)', ring: '#D98D57', label: '3rd' },
];

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const [metric, setMetric] = useState<Metric>('meetings');
  const [period, setPeriod] = useState<Period>('month');
  const today = localISO();
  const range = useMemo(() => {
    switch (period) {
      case 'today': return [today, today];
      case 'week': return [format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), today];
      case 'month': return [`${today.slice(0, 7)}-01`, today];
      default: return [payPeriod(today).start, today];
    }
  }, [period, today]);
  const board = useLeaderboard(range[0], range[1]);
  const m = METRICS.find((x) => x.value === metric)!;

  const ranked = useMemo(
    () => [...(board.data ?? [])].sort((a, b) => Number(b[metric]) - Number(a[metric]) || Number(b.won_usd) - Number(a.won_usd)),
    [board.data, metric],
  );
  const leader = Number(ranked[0]?.[metric] ?? 0);
  const myIndex = ranked.findIndex((r) => r.profile_id === profile?.id);
  const me = ranked[myIndex];

  // A little party if you are on top.
  const celebrated = useRef('');
  useEffect(() => {
    const key = `${metric}-${period}`;
    if (myIndex === 0 && leader > 0 && celebrated.current !== key) {
      celebrated.current = key;
      window.setTimeout(() => celebrate('small'), 500);
    }
  }, [myIndex, leader, metric, period]);

  const nudge = (() => {
    if (!me || myIndex < 0) return null;
    if (myIndex === 0) return leader > 0 ? `You're #1 for ${m.noun}. Keep the crown 👑` : null;
    const ahead = ranked[myIndex - 1];
    const gap = Number(ahead[metric]) - Number(me[metric]);
    return `${m.unit(gap + 1)} more ${m.noun} to pass ${firstName(ahead.full_name)} for #${myIndex}`;
  })();

  return (
    <>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-1.5"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-bad opacity-70" /><span className="relative size-2 rounded-full bg-bad" /></span>Live</span>}
        title="Leaderboard"
        sub="Friendly competition across the sales floor. Totals only — nobody sees anyone else's leads."
      />

      <Panel className="mb-5 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={metric} onChange={setMetric} options={METRICS.map((x) => ({ value: x.value, label: x.label }))} />
          <Segmented value={period} onChange={setPeriod} options={[
            { value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'period', label: 'Pay period' },
          ]} />
          {nudge && (
            <motion.div key={nudge} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="ml-auto flex items-center gap-2 rounded-full bg-iris/12 px-3.5 py-2 text-[13px] font-bold text-iris">
              <Flame className="size-4" />{nudge}
            </motion.div>
          )}
        </div>
      </Panel>

      {board.isLoading ? (
        <Skeleton className="h-[420px] rounded-[30px]" />
      ) : ranked.length === 0 ? (
        <Panel><Empty title="No reps yet" body="Once sales reps are added, they'll battle it out here." /></Panel>
      ) : (
        <LayoutGroup>
          <Panel strong className="relative mb-5 overflow-hidden !px-4 !pb-0 !pt-8">
            <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-lemon/25 to-transparent" />
            <div className="relative mx-auto flex max-w-[720px] items-end justify-center gap-3 sm:gap-6">
              {PODIUM.map((p) => {
                const r = ranked[p.place - 1];
                return (
                  <div key={p.place} className="flex w-[30%] max-w-[210px] flex-col items-center">
                    <AnimatePresence mode="popLayout">
                      {r ? (
                        <motion.div
                          key={r.profile_id}
                          layoutId={`podium-${r.profile_id}`}
                          initial={{ opacity: 0, y: 40, scale: 0.8 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ type: 'spring', stiffness: 220, damping: 20, delay: p.place * 0.08 }}
                          className="flex flex-col items-center text-center"
                        >
                          {p.place === 1 && (
                            <motion.div animate={{ y: [0, -4, 0], rotate: [-4, 4, -4] }} transition={{ duration: 2.4, repeat: Infinity }}>
                              <Crown className="size-8 fill-lemon text-[#E0A800]" />
                            </motion.div>
                          )}
                          <div className="rounded-full p-1" style={{ boxShadow: `0 0 0 3px ${p.ring}, 0 12px 30px -10px ${p.ring}` }}>
                            <Agent config={normaliseAgent(r.avatar, r.profile_id)} size={p.place === 1 ? 112 : 88} mood={p.place === 1 && leader > 0 ? 'celebrate' : 'happy'} />
                          </div>
                          <div className="mt-2 max-w-full truncate text-[15px] font-extrabold">
                            {firstName(r.full_name)}{r.profile_id === profile?.id && <span className="ml-1 text-iris">(you)</span>}
                          </div>
                          <div className="tabular font-display text-[20px] font-black leading-tight">{m.unit(Number(r[metric]))}</div>
                        </motion.div>
                      ) : <div className="h-40" />}
                    </AnimatePresence>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: p.h }}
                      transition={{ type: 'spring', stiffness: 160, damping: 20, delay: 0.1 * p.place }}
                      className="mt-3 grid w-full place-items-start justify-center rounded-t-[20px] pt-3 shadow-[inset_0_2px_0_rgba(255,255,255,.6)]"
                      style={{ background: p.color }}
                    >
                      <span className="font-display text-[28px] font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,.25)]">{p.place}</span>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel padded={false} className="overflow-hidden">
            {ranked.map((r, i) => <Row key={r.profile_id} r={r} rank={i + 1} metric={metric} leader={leader} me={r.profile_id === profile?.id} unit={m.unit} />)}
          </Panel>
        </LayoutGroup>
      )}
    </>
  );
}

function Row({ r, rank, metric, leader, me, unit }: { r: LeaderRow; rank: number; metric: Metric; leader: number; me: boolean; unit: (n: number) => string }) {
  const v = Number(r[metric]);
  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={clsx('flex items-center gap-4 border-b border-[var(--hairline)] px-5 py-3 last:border-b-0', me && 'bg-iris/8')}
    >
      <div className="grid w-8 shrink-0 place-items-center">
        {rank <= 3 ? <Medal className="size-6" style={{ color: ['#F5B91F', '#AAB1C6', '#D98D57'][rank - 1] }} /> : <span className="text-3 tabular text-[15px] font-extrabold">{rank}</span>}
      </div>
      <Agent config={normaliseAgent(r.avatar, r.profile_id)} size={46} animated={false} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold">{r.full_name}{me && <span className="ml-1.5 rounded-full bg-iris px-2 py-0.5 text-[11px] font-bold text-white">You</span>}</div>
        <div className="mt-1.5 flex items-center gap-3">
          <div className="fill h-2 max-w-[360px] flex-1 overflow-hidden rounded-full">
            <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${leader ? (v / leader) * 100 : 0}%` }} transition={{ type: 'spring', stiffness: 160, damping: 24 }} style={{ background: rank === 1 ? 'linear-gradient(90deg,#F5B91F,#FFD54A)' : 'var(--viz-1)' }} />
          </div>
          <span className="text-3 hidden text-[12px] md:inline">{count(r.dials)} dials · {count(r.connected)} connects · {count(r.meetings)} appts · {usd(r.won_usd)}</span>
        </div>
      </div>
      <div className="tabular w-[110px] shrink-0 text-right font-display text-[20px] font-black">{unit(v)}</div>
    </motion.div>
  );
}
