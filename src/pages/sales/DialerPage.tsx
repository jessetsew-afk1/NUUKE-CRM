import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  CalendarClock, Filter, Flame, Headphones, Inbox, Play, Repeat, RotateCcw, SkipForward, Sparkles, Square, Timer, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/auth';
import { useSettings } from '@/data/common';
import {
  emptyFilters, fetchNextLeads, logLeadAction, outcomeMap, useFilterOptions, useOutcomes, useQueueSummary, useSalesRefresh,
  useToday, type QueueFilters,
} from '@/data/sales';
import type { Lead, TodayStats } from '@/lib/types';
import { Agent } from '@/agent/Agent';
import type { Mood } from '@/agent/catalog';
import { Button, Chip, Empty, Input, Kbd, PageHeader, Panel, ProgressBar, Ring, Skeleton } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { LeadCard } from '@/sales/LeadCard';
import { OutcomeForm, type OutcomePayload } from '@/sales/OutcomeForm';
import { celebrate } from '@/lib/celebrate';
import { addDaysISO, clock, count, firstName, greeting, localISO } from '@/lib/format';

const FILTER_KEY = 'nuuke-dialer-filters';

function loadFilters(): QueueFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) return { ...emptyFilters, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return emptyFilters;
}

export default function DialerPage() {
  const [filters, setFilters] = useState<QueueFilters>(loadFilters);
  const [session, setSession] = useState<null | { startedAt: number; done: number; skipped: number }>(null);

  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);

  return (
    <AnimatePresence mode="wait">
      {session ? (
        <motion.div key="dial" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}>
          <DialSession filters={filters} session={session} setSession={setSession} onEnd={() => setSession(null)} />
        </motion.div>
      ) : (
        <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}>
          <Setup filters={filters} setFilters={setFilters} onStart={() => setSession({ startedAt: Date.now(), done: 0, skipped: 0 })} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ===================================================================== setup */
function Setup({ filters, setFilters, onStart }: { filters: QueueFilters; setFilters: (f: QueueFilters) => void; onStart: () => void }) {
  const { profile, agent } = useAuth();
  const today = useToday();
  const options = useFilterOptions();
  const summary = useQueueSummary(filters);
  const navigate = useNavigate();
  const t = today.data;
  const ready = summary.data ? summary.data.due_followups + summary.data.fresh + summary.data.skipped : 0;
  const activeFilters = filters.services.length + filters.platforms.length + (filters.from || filters.to ? 1 : 0);

  const toggle = (key: 'services' | 'platforms', v: string) =>
    setFilters({ ...filters, [key]: filters[key].includes(v) ? filters[key].filter((x) => x !== v) : [...filters[key], v] });

  const todayISO = localISO();
  const presets = [
    { label: 'Last 7 days', from: addDaysISO(todayISO, -6), to: todayISO },
    { label: 'Last 30 days', from: addDaysISO(todayISO, -29), to: todayISO },
    { label: 'Last 90 days', from: addDaysISO(todayISO, -89), to: todayISO },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'INPUT' && ready > 0) onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, onStart]);

  return (
    <>
      <PageHeader eyebrow={greeting()} title={`Let's dial, ${firstName(profile?.full_name)}`} sub="Pick what you want to work on, press Start, and take it one card at a time." />

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Panel strong className="relative overflow-hidden !p-7">
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-iris/25 blur-3xl" />
          <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <Ring value={t?.dials ?? 0} max={t?.target ?? 250} size={176} stroke={14}>
              <div>
                <div className="tabular font-display text-[40px] font-black leading-none">{t?.dials ?? '–'}</div>
                <div className="text-3 mt-1 text-[12px] font-bold uppercase tracking-wider">of {t?.target ?? 250} today</div>
              </div>
            </Ring>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center gap-3 sm:justify-start">
                <Agent config={agent} size={64} mood={t && t.dials >= t.target ? 'celebrate' : 'focus'} />
                <div>
                  <div className="text-[20px] font-extrabold leading-tight">
                    {!t ? 'Loading…' : t.dials >= t.target ? 'Target smashed! 🎉' : t.dials === 0 ? 'Fresh start' : `${t.target - t.dials} to go`}
                  </div>
                  <div className="text-2 text-[13px]">
                    {t ? `${t.connected} connected · ${t.prospects} prospects · ${t.skips} skipped` : ' '}
                  </div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <QueueTile icon={<Repeat className="size-4" />} label="Follow-ups due" value={summary.data?.due_followups} color="#FF9F0A" />
                <QueueTile icon={<Sparkles className="size-4" />} label="Fresh leads" value={summary.data?.fresh} color="#7C5CFF" />
                <QueueTile icon={<SkipForward className="size-4" />} label="Skipped" value={summary.data?.skipped} color="#8E8AA0" />
              </div>
              {summary.data && summary.data.scheduled_later > 0 && (
                <p className="text-3 mt-3 text-[12px]">
                  <CalendarClock className="mr-1 inline size-3.5" />{count(summary.data.scheduled_later)} more come back later as follow-ups and call-backs.
                </p>
              )}
            </div>
          </div>

          <div className="relative mt-7 flex flex-col items-center gap-3 sm:flex-row">
            <Button
              variant="primary"
              size="xl"
              className="w-full sm:w-auto sm:min-w-[260px]"
              icon={<Play className="size-5" />}
              disabled={!summary.data || ready === 0}
              onClick={onStart}
            >
              {ready === 0 && summary.data ? 'Nothing to dial' : 'Start dialing'}
            </Button>
            <div className="text-2 text-[13px]">
              {summary.isLoading ? 'Counting cards…' : <><b className="text-[color:var(--text)]">{count(ready)}</b> cards ready{activeFilters ? ' with these filters' : ''} · <Kbd>↵</Kbd> to start</>}
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-bold"><Filter className="size-4" /> Filter your cards</h3>
            {activeFilters > 0 && (
              <button type="button" className="text-[13px] font-bold text-iris" onClick={() => setFilters(emptyFilters)}>Clear all</button>
            )}
          </div>

          <div className="space-y-5">
            <FilterBlock label="Service">
              {options.isLoading && <Skeleton className="h-9 w-full" />}
              {options.data?.services.map((s) => (
                <Chip key={s.value} active={filters.services.includes(s.value)} onClick={() => toggle('services', s.value)} count={s.count}>{s.value}</Chip>
              ))}
            </FilterBlock>
            <FilterBlock label="Lead platform">
              {options.data?.platforms.map((s) => (
                <Chip key={s.value} active={filters.platforms.includes(s.value)} onClick={() => toggle('platforms', s.value)} count={s.count}>{s.value}</Chip>
              ))}
            </FilterBlock>
            <FilterBlock label="Enquiry date">
              {presets.map((p) => (
                <Chip key={p.label} active={filters.from === p.from && filters.to === p.to} onClick={() => setFilters({ ...filters, from: p.from, to: p.to })}>{p.label}</Chip>
              ))}
              <Chip active={!filters.from && !filters.to} onClick={() => setFilters({ ...filters, from: null, to: null })}>Any time</Chip>
              <div className="mt-1 grid w-full grid-cols-2 gap-2">
                <Input type="date" value={filters.from ?? ''} onChange={(e) => setFilters({ ...filters, from: e.target.value || null })} aria-label="From" />
                <Input type="date" value={filters.to ?? ''} onChange={(e) => setFilters({ ...filters, to: e.target.value || null })} aria-label="To" />
              </div>
            </FilterBlock>
          </div>

          <button type="button" onClick={() => navigate('/sales/leads')} className="text-2 mt-6 flex items-center gap-2 text-[13px] font-bold hover:text-[color:var(--text)]">
            <Inbox className="size-4" /> Browse all my leads instead
          </button>
        </Panel>
      </div>
    </>
  );
}

function QueueTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | undefined; color: string }) {
  return (
    <div className="fill rounded-2xl px-3 py-2.5 text-left">
      <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color }}>{icon}{label}</div>
      <div className="tabular mt-1 text-[22px] font-extrabold leading-none">{value === undefined ? '–' : count(value)}</div>
    </div>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/* =================================================================== dialing */
type Exit = { dir: 'done' | 'skip' };
type Stamp = { id: number; label: string; color: string } | null;
const beat = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function DialSession({
  filters, session, setSession, onEnd,
}: {
  filters: QueueFilters;
  session: { startedAt: number; done: number; skipped: number };
  setSession: React.Dispatch<React.SetStateAction<null | { startedAt: number; done: number; skipped: number }>>;
  onEnd: () => void;
}) {
  const { agent } = useAuth();
  const toast = useToast();
  const refresh = useSalesRefresh();
  const outcomes = useOutcomes();
  const settings = useSettings();
  const today = useToday();
  const [deck, setDeck] = useState<Lead[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [exit, setExit] = useState<Exit>({ dir: 'done' });
  const [stamp, setStamp] = useState<Stamp>(null);
  const [mood, setMood] = useState<Mood>('focus');
  const [now, setNow] = useState(Date.now());
  const moodTimer = useRef<number>();
  const map = useMemo(() => outcomeMap(outcomes.data), [outcomes.data]);
  const maxAttempts = settings.data?.max_attempts ?? 4;

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const load = useCallback(async (keep?: Lead) => {
    const next = await fetchNextLeads(filters, 4);
    setDeck(keep ? [keep, ...next.filter((l) => l.id !== keep.id)] : next);
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  const flash = (m: Mood, ms = 2200) => {
    window.clearTimeout(moodTimer.current);
    setMood(m);
    moodTimer.current = window.setTimeout(() => setMood('focus'), ms);
  };

  const current = deck?.[0];

  const afterAction = async (today?: TodayStats, prevDials?: number) => {
    refresh(today);
    if (today && prevDials !== undefined && prevDials < today.target && today.dials >= today.target) {
      celebrate('big');
      flash('celebrate', 4000);
      toast({ title: `${today.target}! Daily target hit`, body: 'Every dial from here is a bonus.', tone: 'celebrate' });
    }
  };

  const done = async (p: OutcomePayload) => {
    if (!current) return;
    const o = map.get(p.outcome);
    const color = o?.tone === 'bad' ? '#FF453A' : o?.tone === 'good' || o?.tone === 'great' ? '#30C46C' : o?.tone === 'info' ? '#0A84FF' : '#7C5CFF';
    setBusy(true);
    const prevDials = today.data?.dials;
    try {
      const res = await logLeadAction({ leadId: current.id, action: 'call', ...p });
      // Stamp the outcome on the card for a beat, then send it off.
      setStamp({ id: current.id, label: o?.short_label ?? 'Done', color });
      setExit({ dir: 'done' });
      await beat(320);
      const rest = deck!.slice(1);
      setDeck(rest);
      setSession((s) => s && { ...s, done: s.done + 1 });
      if (p.outcome === 'meeting_booked' || p.outcome === 'won') {
        celebrate(p.outcome === 'won' ? 'big' : 'small');
        flash('celebrate');
        toast({ title: p.outcome === 'won' ? 'Deal closed! 🏆' : 'Meeting booked!', body: 'Added to your pipeline.', tone: 'celebrate' });
      } else if (o?.effect === 'pipeline') {
        flash('happy');
      }
      await afterAction(res.today, prevDials);
      void load(rest[0]);
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const res = await logLeadAction({ leadId: current.id, action: 'skip' });
      setExit({ dir: 'skip' });
      const rest = deck!.slice(1);
      setDeck(rest);
      setSession((s) => s && { ...s, skipped: s.skipped + 1 });
      refresh(res.today);
      void load(rest[0]);
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const t = today.data;
  const elapsed = (now - session.startedAt) / 1000;
  const pace = session.done > 0 ? Math.round((session.done / Math.max(elapsed, 60)) * 3600) : 0;

  return (
    <>
      {/* progress strip */}
      <Panel className="mb-5 !p-4 sm:!p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Agent config={agent} size={56} mood={mood} />
          <div className="min-w-[220px] flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[13px] font-bold">
                <span className="tabular font-display text-[26px] font-black">{t?.dials ?? 0}</span>
                <span className="text-3"> / {t?.target ?? 250} numbers dialled today</span>
              </div>
              <div className="text-3 tabular hidden text-[12px] font-semibold sm:block">
                {t && t.dials < t.target ? `${t.target - t.dials} to go` : 'Target reached'}
              </div>
            </div>
            <ProgressBar value={t?.dials ?? 0} max={t?.target ?? 250} height={12} className="mt-2" />
          </div>
          <div className="flex items-center gap-2">
            <SessionStat icon={<Timer className="size-3.5" />} label="Session" value={clock(elapsed)} />
            <SessionStat icon={<Headphones className="size-3.5" />} label="Done" value={String(session.done)} />
            <SessionStat icon={<Flame className="size-3.5" />} label="Per hour" value={pace ? String(pace) : '–'} />
            <Button variant="glass" icon={<Square className="size-3.5" />} onClick={onEnd}>End</Button>
          </div>
        </div>
        <FilterSummary filters={filters} />
      </Panel>

      {/* the deck */}
      {!deck || outcomes.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <Skeleton className="h-[520px] rounded-[32px]" />
          <Skeleton className="h-[420px] rounded-[32px]" />
        </div>
      ) : !current ? (
        <Panel strong>
          <Empty
            art={<Agent config={agent} size={150} mood="celebrate" />}
            title="Queue cleared!"
            body="No more cards match these filters right now. Follow-ups and call-backs come back on their own when they are due."
            action={<Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={onEnd}>Change filters</Button>}
          />
        </Panel>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1.25fr_1fr]">
          <div className="relative">
            {/* the cards waiting behind */}
            {deck.slice(1, 3).map((l, i) => (
              <motion.div
                key={`ghost-${l.id}`}
                layout
                className="glass absolute inset-x-0 top-0 h-full rounded-[32px]"
                initial={false}
                animate={{ y: (i + 1) * 12, scale: 1 - (i + 1) * 0.035, opacity: 0.7 - i * 0.25 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{ zIndex: 0 }}
              />
            ))}
            <AnimatePresence mode="popLayout" custom={exit}>
              <motion.div
                key={current.id}
                custom={exit}
                variants={cardVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="glass-strong relative z-10 rounded-[32px] p-6 sm:p-8"
              >
                <AnimatePresence>
                  {stamp?.id === current.id && (
                    <motion.div
                      initial={{ scale: 1.8, opacity: 0, rotate: -14 }}
                      animate={{ scale: 1, opacity: 1, rotate: -8 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      className="pointer-events-none absolute right-6 top-6 z-20 rounded-2xl border-[3px] px-4 py-1.5 font-display text-[22px] font-black uppercase tracking-wider"
                      style={{ color: stamp.color, borderColor: stamp.color, background: 'var(--glass-strong)' }}
                    >
                      {stamp.label}
                    </motion.div>
                  )}
                </AnimatePresence>
                <LeadCard lead={current} outcomes={map} maxAttempts={maxAttempts} />
              </motion.div>
            </AnimatePresence>
          </div>

          <Panel strong className="lg:sticky lg:top-24">
            <OutcomeForm
              lead={current}
              outcomes={outcomes.data ?? []}
              maxAttempts={maxAttempts}
              busy={busy}
              onSubmit={done}
              onSkip={skip}
            />
            <div className="text-3 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              <span><Kbd>1</Kbd>–<Kbd>6</Kbd> status</span>
              <span><Kbd>S</Kbd> skip</span>
              <span><Kbd>⌘</Kbd><Kbd>↵</Kbd> done</span>
              <span className="ml-auto">{session.done} done · {session.skipped} skipped this session</span>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

const cardVariants = {
  enter: { opacity: 0, y: 40, scale: 0.94 },
  center: { opacity: 1, y: 0, scale: 1, x: 0, rotate: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 26 } },
  exit: (e: Exit) =>
    e.dir === 'skip'
      ? { opacity: 0, x: -360, rotate: -10, scale: 0.92, transition: { duration: 0.38, ease: [0.32, 0.72, 0, 1] } }
      : { opacity: 0, x: 420, y: -40, rotate: 9, scale: 0.92, transition: { duration: 0.42, ease: [0.32, 0.72, 0, 1] } },
};

function SessionStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="fill hidden rounded-2xl px-3 py-1.5 md:block">
      <div className="text-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">{icon}{label}</div>
      <div className="tabular text-[15px] font-extrabold">{value}</div>
    </div>
  );
}

function FilterSummary({ filters }: { filters: QueueFilters }) {
  const parts = [
    ...filters.services,
    ...filters.platforms,
    filters.from || filters.to ? `${filters.from ?? '…'} → ${filters.to ?? '…'}` : null,
  ].filter(Boolean) as string[];
  if (!parts.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <Filter className="text-3 size-3.5" />
      {parts.map((p) => (
        <span key={p} className={clsx('fill rounded-full px-2.5 py-1 text-[12px] font-semibold')}>{p}</span>
      ))}
      <span className="text-3 text-[12px]"><X className="inline size-3" /> End the session to change</span>
    </div>
  );
}

