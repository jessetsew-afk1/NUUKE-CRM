import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Check, Coffee, Crown, Flag, Gamepad2, Hourglass, LogOut, Play, Plus, RotateCcw, Swords, Users, X } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useAttendance } from '@/app/attendance';
import { usePeople } from '@/data/common';
import { GAME_INFO, gameApi, gamesNeedingMe, useCanPlay, useGame, useMyGames, useOnBreak, type GameKind, type GameWithPlayers } from '@/data/games';
import { normaliseAgent } from '@/agent/catalog';
import { Agent } from '@/agent/Agent';
import type { Profile } from '@/lib/types';
import { ago } from '@/lib/format';
import { useToast } from '@/ui/toast';
import { Button, Empty, PageHeader, Panel, PanelHeader, Pill, Sheet, Skeleton, Spinner } from '@/ui/kit';
import { celebrate } from '@/lib/celebrate';
import { CheckersBoard, ChessBoard, LudoBoard, TicTacToeBoard, type MoveResult } from '@/games/Boards';
import { tttInit, type TTTState } from '@/games/tictactoe';
import { ckInit, type CkState } from '@/games/checkers';
import { chessInit, inCheck, type ChessState } from '@/games/chess';
import { ludoInit, LUDO_COLORS, type LudoState } from '@/games/ludo';

const KINDS: GameKind[] = ['tictactoe', 'checkers', 'chess', 'ludo'];
const initialState = (kind: GameKind): unknown => (kind === 'tictactoe' ? tttInit() : kind === 'checkers' ? ckInit() : kind === 'chess' ? chessInit() : {});
const firstName = (p?: Pick<Profile, 'full_name'> | null) => p?.full_name.split(' ')[0] ?? 'Someone';

/** Simple 2D art for each game's card. */
function GameArt({ kind, className }: { kind: GameKind; className?: string }) {
  if (kind === 'tictactoe') {
    return (
      <svg viewBox="0 0 60 60" className={className}>
        <path d="M22 8v44M38 8v44M8 22h44M8 38h44" stroke="currentColor" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" />
        <path d="M11 11l7 7M18 11l-7 7" stroke="#7C5CFF" strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="30" cy="30" r="4.5" fill="none" stroke="#FF8A5B" strokeWidth="3.2" />
        <path d="M42 42l7 7M49 42l-7 7" stroke="#7C5CFF" strokeWidth="3.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'checkers' || kind === 'chess') {
    return (
      <svg viewBox="0 0 60 60" className={className}>
        {Array.from({ length: 16 }, (_, i) => (
          <rect key={i} x={6 + (i % 4) * 12} y={6 + Math.floor(i / 4) * 12} width="12" height="12" rx="1.5"
            fill={(Math.floor(i / 4) + i) % 2 ? (kind === 'chess' ? '#7B9A62' : '#8B6B4A') : (kind === 'chess' ? '#EEEED2' : '#EAD9BF')} />
        ))}
        {kind === 'checkers' ? (
          <>
            <circle cx="24" cy="12" r="4.3" fill="#2A2533" /><circle cx="48" cy="12" r="4.3" fill="#2A2533" />
            <circle cx="12" cy="48" r="4.3" fill="#E5483B" /><circle cx="36" cy="48" r="4.3" fill="#E5483B" /><circle cx="36" cy="24" r="4.3" fill="#E5483B" />
          </>
        ) : (
          <>
            <text x="24" y="16.5" textAnchor="middle" fontSize="11" fill="#1D1A2B">♛</text>
            <text x="36" y="52.5" textAnchor="middle" fontSize="11" fill="#fff" stroke="#1D1A2B" strokeWidth=".5">♔</text>
            <text x="48" y="28.5" textAnchor="middle" fontSize="11" fill="#1D1A2B">♞</text>
          </>
        )}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 60 60" className={className}>
      <rect x="6" y="6" width="22" height="22" rx="3" fill={LUDO_COLORS[0].hex} />
      <rect x="32" y="6" width="22" height="22" rx="3" fill={LUDO_COLORS[1].hex} />
      <rect x="32" y="32" width="22" height="22" rx="3" fill={LUDO_COLORS[2].hex} />
      <rect x="6" y="32" width="22" height="22" rx="3" fill={LUDO_COLORS[3].hex} />
      <rect x="20" y="20" width="20" height="20" rx="4" fill="#fff" stroke="#1D1A2B" strokeOpacity=".15" />
      {[[25, 25], [35, 35], [30, 30], [25, 35], [35, 25]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="#1D1A2B" />)}
    </svg>
  );
}

export default function GamesPage() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const play = useCanPlay();
  const games = useMyGames();
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('game')) || null;
  const open = (id: number | null) => setParams(id ? { game: String(id) } : {}, { replace: false });

  if (play.loading) return <Skeleton className="h-[520px] rounded-[28px]" />;
  if (!play.canPlay) return <Locked games={games.data} uid={uid} />;
  if (openId) return <GameView id={openId} onBack={() => open(null)} onOpen={open} />;
  return <Lobby games={games.data} loading={games.isLoading} uid={uid} onOpen={open} admin={play.admin} />;
}

/* ================================================================ locked */
function Locked({ games, uid }: { games?: GameWithPlayers[]; uid: string }) {
  const { agent, tracksAttendance } = useAuth();
  const { state, startBreak } = useAttendance();
  const toast = useToast();
  const { invites, myTurn } = gamesNeedingMe(games, uid);
  const waiting = [invites && `${invites} invite${invites > 1 ? 's' : ''}`, myTurn && `${myTurn} game${myTurn > 1 ? 's' : ''} where it's your move`].filter(Boolean).join(' and ');
  return (
    <>
      <PageHeader title="Mini Games" sub="Quick board games with the team: Tic-Tac-Toe, Checkers, Chess and Ludo." />
      <Panel>
        <Empty art={<Agent config={agent} size={140} mood="sleepy" />}
          title="Games open on your break"
          body={!tracksAttendance
            ? 'Your account isn\'t on the attendance clock, so there\'s no break time to play in. Ask your admin if you think that\'s wrong.'
            : `Take a break and the games unlock. Every game waits for you between breaks${waiting ? `, and right now you have ${waiting}` : ''}.`}
          action={tracksAttendance && (state?.clocked_in
            ? <Button variant="iris" size="lg" icon={<Coffee className="size-5" />} loading={startBreak.isPending}
                onClick={() => startBreak.mutate(undefined, { onError: (e) => toast({ title: 'Could not start your break', body: (e as Error).message, tone: 'danger' }) })}>
                Start my break
              </Button>
            : <p className="text-2 text-[13px] font-semibold">Sign in to your shift first, then start a break.</p>)} />
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3 pb-4 sm:grid-cols-4">
          {KINDS.map((k) => (
            <div key={k} className="fill rounded-[20px] p-3 text-center opacity-70">
              <GameArt kind={k} className="mx-auto size-14" />
              <div className="mt-1.5 text-[13px] font-bold">{GAME_INFO[k].label}</div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

/* ================================================================= lobby */
function Lobby({ games, loading, uid, onOpen, admin }: { games?: GameWithPlayers[]; loading: boolean; uid: string; onOpen: (id: number) => void; admin: boolean }) {
  const people = usePeople();
  const byId = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);
  const onBreak = useOnBreak();
  const [pick, setPick] = useState<GameKind | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const all = games ?? [];
  const invites = all.filter((g) => g.status === 'waiting' && g.game_players.find((p) => p.user_id === uid)?.status === 'invited');
  const active = all.filter((g) => g.status === 'active' && g.game_players.find((p) => p.user_id === uid)?.status === 'joined')
    .sort((a, b) => Number(b.turn_user === uid) - Number(a.turn_user === uid));
  const lobbies = all.filter((g) => g.status === 'waiting' && g.game_players.find((p) => p.user_id === uid)?.status === 'joined');
  const done = all.filter((g) => g.status === 'finished').slice(0, 8);

  const act = async (id: number, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(id);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['games'] });
      after?.();
    } catch (e) {
      toast({ title: 'That didn\'t work', body: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Mini Games" sub="You're on your break, so the games are open. Invite anyone on the team; they can join on their break."
        right={<Pill tone="good" solid><span className="inline-flex items-center gap-1"><Coffee className="size-3.5" />{admin ? 'Always open for admins' : 'On break'}</span></Pill>} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KINDS.map((k, i) => (
          <motion.button key={k} type="button" onClick={() => setPick(k)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}
            className="glass group rounded-[26px] p-4 text-left">
            <GameArt kind={k} className="size-16" />
            <div className="mt-3 text-[17px] font-extrabold">{GAME_INFO[k].label}</div>
            <div className="text-2 text-[12.5px]">{GAME_INFO[k].blurb}</div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-3 whitespace-nowrap text-[12px] font-bold">{GAME_INFO[k].players}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-iris px-2.5 py-1 text-[12px] font-bold text-white"><Plus className="size-3.5" />Play</span>
            </div>
          </motion.button>
        ))}
      </div>

      {loading ? <Skeleton className="h-48 rounded-[28px]" /> : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {invites.length > 0 && (
            <Panel className="lg:col-span-2">
              <PanelHeader title="Invites for you" sub="Join now, while you're on your break." />
              <div className="grid gap-3 md:grid-cols-2">
                {invites.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-[20px] bg-iris/10 p-3.5 ring-1 ring-iris/25">
                    <GameArt kind={g.kind as GameKind} className="size-12 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-extrabold">{GAME_INFO[g.kind as GameKind].label}</div>
                      <div className="text-2 truncate text-[12.5px]">from {firstName(byId.get(g.host_id))} · {ago(g.created_at)}</div>
                    </div>
                    <Button size="sm" variant="ghost" icon={<X className="size-4" />} disabled={busy === g.id}
                      onClick={() => act(g.id, () => gameApi.respond(g.id, false))}>No</Button>
                    <Button size="sm" variant="iris" icon={<Check className="size-4" />} loading={busy === g.id}
                      onClick={() => act(g.id, () => gameApi.respond(g.id, true), () => onOpen(g.id))}>Join</Button>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel>
            <PanelHeader title="Your games" sub="They wait for you between breaks." />
            {active.length + lobbies.length === 0 ? (
              <p className="text-2 py-6 text-center text-[13.5px]">No games going. Pick one above and invite someone.</p>
            ) : (
              <div className="space-y-2">
                {active.map((g) => <GameRow key={g.id} g={g} uid={uid} byId={byId} onOpen={onOpen} />)}
                {lobbies.map((g) => <GameRow key={g.id} g={g} uid={uid} byId={byId} onOpen={onOpen} />)}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recent results" />
            {done.length === 0 ? <p className="text-2 py-6 text-center text-[13.5px]">Finished games show up here.</p> : (
              <div className="space-y-2">{done.map((g) => <GameRow key={g.id} g={g} uid={uid} byId={byId} onOpen={onOpen} />)}</div>
            )}
          </Panel>
        </div>
      )}

      <NewGameSheet kind={pick} onClose={() => setPick(null)} people={people.data ?? []} onBreak={onBreak.data} uid={uid}
        onCreated={(id) => { setPick(null); void qc.invalidateQueries({ queryKey: ['games'] }); onOpen(id); }} />
    </>
  );
}

function GameRow({ g, uid, byId, onOpen }: { g: GameWithPlayers; uid: string; byId: Map<string, Profile>; onOpen: (id: number) => void }) {
  const others = g.game_players.filter((p) => p.user_id !== uid && p.status !== 'declined').map((p) => byId.get(p.user_id)).filter(Boolean) as Profile[];
  const vs = others.map((p) => firstName(p)).join(', ') || 'nobody yet';
  const status = g.status === 'active'
    ? g.turn_user === uid ? <Pill tone="iris" solid>Your move</Pill> : <Pill tone="neutral">{firstName(byId.get(g.turn_user ?? ''))}'s move</Pill>
    : g.status === 'waiting' ? <Pill tone="warn">Waiting to start</Pill>
    : g.result === 'draw' ? <Pill tone="neutral">Draw</Pill>
    : g.winner_id === uid ? <Pill tone="good" solid>You won</Pill>
    : g.result === 'abandoned' ? <Pill tone="neutral">Timed out</Pill>
    : <Pill tone="bad">{firstName(byId.get(g.winner_id ?? ''))} won</Pill>;
  return (
    <button type="button" onClick={() => onOpen(g.id)} className="fill flex w-full items-center gap-3 rounded-[18px] p-3 text-left transition-colors hover:bg-[var(--fill-2)]">
      <GameArt kind={g.kind as GameKind} className="size-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold">{GAME_INFO[g.kind as GameKind].label} <span className="text-2 font-semibold">vs {vs}</span></div>
        <div className="text-3 text-[12px]">{g.status === 'finished' ? `ended ${ago(g.finished_at ?? g.updated_at)}` : `updated ${ago(g.updated_at)}`}</div>
      </div>
      <div className="flex -space-x-2">
        {others.slice(0, 3).map((p) => <Agent key={p.id} config={normaliseAgent(p.avatar, p.id)} size={30} animated={false} className="ring-2 ring-[var(--canvas)] rounded-full" />)}
      </div>
      {status}
    </button>
  );
}

/* ============================================================ new game */
function NewGameSheet({ kind, onClose, people, onBreak, uid, onCreated }: {
  kind: GameKind | null; onClose: () => void; people: Profile[]; onBreak?: Set<string>; uid: string; onCreated: (id: number) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const max = kind ? GAME_INFO[kind].max : 1;
  const team = people.filter((p) => p.id !== uid && p.is_active && p.role !== 'client')
    .sort((a, b) => Number(onBreak?.has(b.id)) - Number(onBreak?.has(a.id)) || a.full_name.localeCompare(b.full_name));
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : max === 1 ? [id] : c.length >= max ? c : [...c, id]));
  const close = () => { setChosen([]); onClose(); };

  return (
    <Sheet open={!!kind} onClose={close} width={520}
      title={kind && <span className="flex items-center gap-2"><GameArt kind={kind} className="size-7" />{GAME_INFO[kind].label}</span>}
      footer={(
        <div className="flex items-center justify-between gap-3">
          <span className="text-2 text-[13px]">{max === 1 ? 'Pick one teammate' : `Pick up to ${max} teammates`}</span>
          <Button variant="iris" icon={<Swords className="size-4" />} loading={busy} disabled={!chosen.length}
            onClick={async () => {
              if (!kind) return;
              setBusy(true);
              try {
                const id = await gameApi.create(kind, chosen, initialState(kind));
                setChosen([]);
                toast({ title: 'Invite sent', body: 'They\'ll get a notification and can join on their break.', tone: 'success' });
                onCreated(id);
              } catch (e) {
                toast({ title: 'Could not start the game', body: (e as Error).message, tone: 'danger' });
              } finally {
                setBusy(false);
              }
            }}>
            Send invite{chosen.length > 1 ? 's' : ''}
          </Button>
        </div>
      )}>
      <p className="text-2 mb-3 text-[13px]">People on a break right now are at the top. Anyone else gets the invite and can join when their break starts.</p>
      <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
        {team.map((p) => {
          const on = chosen.includes(p.id);
          const free = onBreak?.has(p.id);
          return (
            <button key={p.id} type="button" onClick={() => toggle(p.id)}
              className={clsx('flex w-full items-center gap-3 rounded-[18px] p-2.5 text-left transition-colors', on ? 'bg-iris/12 ring-2 ring-iris/50' : 'hover:bg-[var(--fill)]')}>
              <Agent config={normaliseAgent(p.avatar, p.id)} size={40} animated={false} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold">{p.full_name}</div>
                <div className="text-3 truncate text-[12px]">{p.title || p.role}</div>
              </div>
              {free ? <Pill tone="good"><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-ok" />On break</span></Pill> : <span className="text-3 shrink-0 text-[12px] font-semibold">Not on break</span>}
              <span className={clsx('grid size-6 place-items-center rounded-full', on ? 'bg-iris text-white' : 'ring-1 ring-[var(--hairline)]')}>{on && <Check className="size-3.5" />}</span>
            </button>
          );
        })}
        {team.length === 0 && <p className="text-2 py-6 text-center text-[13px]">No teammates to invite yet.</p>}
      </div>
    </Sheet>
  );
}

/* ============================================================ game view */
function GameView({ id, onBack, onOpen }: { id: number; onBack: () => void; onOpen: (id: number) => void }) {
  const { session } = useAuth();
  const uid = session!.user.id;
  const game = useGame(id);
  const people = usePeople();
  const onBreak = useOnBreak();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);
  const g = game.data;

  const players = useMemo(() => (g?.game_players ?? []).filter((p) => p.status !== 'declined').sort((a, b) => a.seat - b.seat), [g]);
  const me = players.find((p) => p.user_id === uid);
  const userAt = useCallback((seat: number | null) => players.find((p) => p.seat === seat)?.user_id ?? null, [players]);
  const isActiveSeat = useCallback((seat: number) => players.find((p) => p.seat === seat)?.status === 'joined', [players]);
  const myTurn = g?.status === 'active' && g.turn_user === uid;

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && typeof res === 'object' && 'id' in (res as object)) {
        qc.setQueryData(['game', id], (old: GameWithPlayers | undefined) => (old ? { ...old, ...(res as object) } : old));
      }
      await qc.invalidateQueries({ queryKey: ['game', id] });
      void qc.invalidateQueries({ queryKey: ['games'] });
    } catch (e) {
      toast({ title: 'That didn\'t work', body: (e as Error).message, tone: 'danger' });
      await qc.invalidateQueries({ queryKey: ['game', id] });
    } finally {
      setBusy(false);
    }
  }, [id, qc, toast]);

  const onMove = useCallback((m: MoveResult) => {
    if (!g) return;
    void run(async () => {
      const res = await gameApi.move(g.id, g.version, m.state, m.nextSeat === null ? null : userAt(m.nextSeat), m.result, m.winnerSeat === undefined ? null : userAt(m.winnerSeat));
      if (m.result === 'win' && userAt(m.winnerSeat ?? -1) === uid) celebrate('big');
      return res;
    });
  }, [g, run, userAt, uid]);

  if (game.isLoading) return <Skeleton className="h-[620px] rounded-[28px]" />;
  if (!g || !me) {
    return (
      <Panel><Empty title="Game not found" body="It may have been cancelled, or you're not in it." action={<Button onClick={onBack} icon={<ArrowLeft className="size-4" />}>All games</Button>} /></Panel>
    );
  }

  const kind = g.kind as GameKind;
  const info = GAME_INFO[kind];
  const turnName = firstName(byId.get(g.turn_user ?? ''));
  const opponentOnBreak = g.turn_user && g.turn_user !== uid ? onBreak.data?.has(g.turn_user) || byId.get(g.turn_user)?.role === 'admin' : true;
  const winner = byId.get(g.winner_id ?? '');
  const joined = players.filter((p) => p.status === 'joined');

  let headline: ReactNode;
  if (g.status === 'waiting') headline = me.seat === 0 ? (kind === 'ludo' ? `${joined.length - 1} of ${players.length - 1} joined. Start when you're ready.` : 'Waiting for them to join…') : 'Waiting for the host to start…';
  else if (g.status === 'active') headline = myTurn ? (kind === 'chess' && inCheck(g.state as unknown as ChessState) ? 'Your move. You\'re in check!' : 'Your move') : `${turnName}'s move${opponentOnBreak ? '' : `. ${turnName} isn't on a break right now, so it'll wait.`}`;
  else if (g.status === 'cancelled') headline = 'This game was cancelled';
  else if (g.result === 'draw') headline = 'It\'s a draw';
  else if (g.result === 'abandoned') headline = 'Nobody moved for a week, so the game ended';
  else headline = g.winner_id === uid ? (g.result === 'resigned' ? 'They left the game. You win!' : 'You won!') : `${firstName(winner)} won${g.result === 'resigned' ? ' (someone left)' : ''}`;

  const boardProps = { mySeat: me.seat, canAct: myTurn && me.status === 'joined', busy, onMove };
  const state = g.state as unknown;
  const rematch = async () => {
    const others = players.filter((p) => p.user_id !== uid && p.status !== 'left').map((p) => p.user_id);
    if (!others.length) return;
    setBusy(true);
    try {
      const newId = await gameApi.create(kind, others.slice(0, info.max), initialState(kind));
      void qc.invalidateQueries({ queryKey: ['games'] });
      onOpen(newId);
    } catch (e) {
      toast({ title: 'Could not start a rematch', body: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="glass" size="sm" icon={<ArrowLeft className="size-4" />} onClick={onBack}>All games</Button>
        <h1 className="flex items-center gap-2 text-[26px] font-extrabold"><GameArt kind={kind} className="size-8" />{info.label}</h1>
        <div className="ml-auto flex gap-2">
          {g.status === 'finished' && <Button size="sm" variant="iris" icon={<RotateCcw className="size-4" />} loading={busy} onClick={rematch}>Rematch</Button>}
          {(g.status === 'active' || g.status === 'waiting') && me.status !== 'left' && (
            <Button size="sm" variant="ghost" className="text-bad" icon={g.status === 'active' ? <Flag className="size-4" /> : <LogOut className="size-4" />} disabled={busy}
              onClick={() => {
                const msg = g.status === 'active' ? (players.length > 2 ? 'Leave this game? The others carry on without you.' : 'Resign? Your opponent wins.') : me.seat === 0 ? 'Cancel this game?' : 'Leave this game?';
                if (window.confirm(msg)) void run(() => gameApi.leave(g.id));
              }}>
              {g.status === 'active' ? (players.length > 2 ? 'Leave' : 'Resign') : me.seat === 0 ? 'Cancel' : 'Leave'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <Panel className="!p-4 sm:!p-6">
          <div className={clsx('mb-4 flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-center text-[15px] font-bold',
            g.status === 'active' && myTurn ? 'bg-iris/12 text-iris' : g.status === 'finished' && g.winner_id === uid ? 'bg-ok/12 text-ok' : 'fill')}>
            {g.status === 'active' && !myTurn && <Hourglass className="size-4 shrink-0" />}
            {g.status === 'finished' && g.winner_id === uid && <Crown className="size-4 shrink-0" />}
            {headline}
          </div>

          {g.status === 'waiting' ? (
            <div className="grid place-items-center py-10 text-center">
              <GameArt kind={kind} className="size-28" />
              <p className="text-2 mt-3 max-w-sm text-[13.5px]">The board opens as soon as the game starts. Invites lapse after 3 hours.</p>
              {kind === 'ludo' && me.seat === 0 && (
                <Button className="mt-4" variant="iris" icon={<Play className="size-4" />} loading={busy} disabled={joined.length < 2}
                  onClick={() => void run(() => gameApi.start(g.id, ludoInit(joined.map((p) => p.seat))))}>
                  Start Ludo with {joined.length} player{joined.length === 1 ? '' : 's'}
                </Button>
              )}
            </div>
          ) : g.status === 'cancelled' ? (
            <p className="text-2 py-12 text-center text-[14px]">Nothing to see here.</p>
          ) : kind === 'tictactoe' ? <TicTacToeBoard {...boardProps} state={state as TTTState} />
            : kind === 'checkers' ? <CheckersBoard {...boardProps} state={state as CkState} />
            : kind === 'chess' ? <ChessBoard {...boardProps} state={state as ChessState} />
            : <LudoBoard {...boardProps} state={state as LudoState} roll={myTurn ? g.last_roll : null} isActive={isActiveSeat}
                onRoll={() => void run(() => gameApi.roll(g.id))} />}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Players" right={<Users className="text-3 size-4" />} />
            <div className="space-y-2">
              {players.map((p) => {
                const prof = byId.get(p.user_id);
                const turn = g.status === 'active' && g.turn_user === p.user_id;
                const free = onBreak.data?.has(p.user_id) || prof?.role === 'admin';
                return (
                  <div key={p.user_id} className={clsx('flex items-center gap-3 rounded-[18px] p-2.5 transition-colors', turn ? 'bg-iris/12 ring-2 ring-iris/40' : 'fill', p.status === 'left' && 'opacity-50')}>
                    {prof ? <Agent config={normaliseAgent(prof.avatar, prof.id)} size={40} animated={turn} /> : <Spinner />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-bold">{p.user_id === uid ? 'You' : prof?.full_name ?? '…'}</div>
                      <div className="text-3 flex items-center gap-1.5 text-[12px] font-semibold">
                        <Mark kind={kind} seat={p.seat} state={g.state as unknown} />
                        {p.status === 'invited' ? 'invited' : p.status === 'left' ? 'left' : free ? <span className="text-ok">on break</span> : 'not on break'}
                      </div>
                    </div>
                    {turn && <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.2, repeat: Infinity }}><Gamepad2 className="size-4 text-iris" /></motion.span>}
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="How it works" />
            <ul className="text-2 list-disc space-y-1.5 pl-4 text-[13px]">
              {kind === 'tictactoe' && <li>Three in a row wins. X goes first.</li>}
              {kind === 'checkers' && <><li>Red goes first. Move diagonally forward; kings move both ways.</li><li>If you can jump, you must, and keep jumping while you can.</li></>}
              {kind === 'chess' && <><li>White goes first. Tap a piece to see where it can go.</li><li>Checkmate wins. Stalemate and repeated positions are draws.</li></>}
              {kind === 'ludo' && <><li>Roll a 6 to bring a token out. A 6 or a knock-out earns another roll.</li><li>Stars and start squares are safe. Get all four home to win.</li></>}
              <li>Moves only count on your break. The game waits for you in between.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

/** The little marker for a player's side: X/O, colour, or white/black. */
function Mark({ kind, seat, state }: { kind: GameKind; seat: number; state: unknown }) {
  const dot = (c: string, label: string) => <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-full ring-1 ring-black/20" style={{ background: c }} />{label} ·</span>;
  if (kind === 'tictactoe') return <span className={seat === 0 ? 'text-iris' : 'text-[#FF8A5B]'}>{seat === 0 ? 'X ·' : 'O ·'}</span>;
  if (kind === 'checkers') return dot(seat === 0 ? '#E5483B' : '#2A2533', seat === 0 ? 'Red' : 'Black');
  if (kind === 'chess') return dot(seat === 0 ? '#fff' : '#1D1A2B', seat === 0 ? 'White' : 'Black');
  const color = (state as LudoState)?.colors?.[seat];
  return color === undefined ? null : dot(LUDO_COLORS[color].hex, LUDO_COLORS[color].name);
}

