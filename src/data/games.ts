import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { useAttendance } from '@/app/attendance';
import { liveChannel, must, rpc, supabase } from '@/lib/supabase';
import type { Game, GamePlayer } from '@/lib/types';

export type GameKind = 'tictactoe' | 'checkers' | 'chess' | 'ludo';
export type GameWithPlayers = Game & { game_players: GamePlayer[] };

export const GAME_INFO: Record<GameKind, { label: string; players: string; blurb: string; max: number }> = {
  tictactoe: { label: 'Tic-Tac-Toe', players: '2 players', blurb: 'Three in a row. Over in a minute.', max: 1 },
  checkers: { label: 'Checkers', players: '2 players', blurb: 'Jump their pieces, crown your kings.', max: 1 },
  chess: { label: 'Chess', players: '2 players', blurb: 'The classic. Picks up where you left off.', max: 1 },
  ludo: { label: 'Ludo', players: '2 to 4 players', blurb: 'Roll a 6 to get out, race everyone home.', max: 3 },
};

/**
 * Break time is game time. Admins, and anyone whose attendance isn't tracked, have no
 * breaks to wait for, so they can always play.
 */
export function useCanPlay() {
  const { profile, tracksAttendance } = useAuth();
  const { state, loading } = useAttendance();
  const admin = profile?.role === 'admin';
  const alwaysOpen = admin || !tracksAttendance;
  return {
    canPlay: alwaysOpen || !!state?.on_break,
    loading: !alwaysOpen && loading,
    alwaysOpen,
    admin,
    clockedIn: !!state?.clocked_in,
    tracksAttendance,
  };
}

/** Every game you're part of (admins only see their own here too). */
export function useMyGames(enabled = true) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['games', uid],
    enabled: enabled && !!uid,
    refetchInterval: 15_000,
    queryFn: async () => {
      const rows = must(await supabase.from('games').select('*, game_players(*)').order('updated_at', { ascending: false }).limit(80)) as GameWithPlayers[];
      return rows.filter((g) => g.game_players.some((p) => p.user_id === uid));
    },
  });
  useEffect(() => {
    if (!enabled || !uid) return;
    const channel = liveChannel(`games:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => qc.invalidateQueries({ queryKey: ['games', uid] }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, uid, qc]);
  return q;
}

/** One game, kept fresh: live where Realtime is on, polling every few seconds otherwise. */
export function useGame(id: number | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['game', id],
    enabled: !!id,
    refetchInterval: (query) => ((query.state.data as GameWithPlayers | undefined)?.status === 'active' || (query.state.data as GameWithPlayers | undefined)?.status === 'waiting' ? 3_000 : false),
    queryFn: async () => must(await supabase.from('games').select('*, game_players(*)').eq('id', id!).single()) as GameWithPlayers,
  });
  useEffect(() => {
    if (!id) return;
    const channel = liveChannel(`game:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ['game', id] }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, qc]);
  return q;
}

/** Teammates free to play right now: on a break, or not on the attendance clock at all. */
export function useOnBreak(enabled = true) {
  return useQuery({
    queryKey: ['on-break'],
    enabled,
    refetchInterval: 20_000,
    queryFn: async () => new Set(((await rpc<string[] | { players_on_break: string }[]>('players_on_break')) ?? [])
      .map((x) => (typeof x === 'string' ? x : x.players_on_break))),
  });
}

/** Games where something is waiting on you: an invite, or your move. */
export function gamesNeedingMe(games: GameWithPlayers[] | undefined, uid: string | undefined) {
  if (!games || !uid) return { invites: 0, myTurn: 0 };
  let invites = 0;
  let myTurn = 0;
  for (const g of games) {
    const me = g.game_players.find((p) => p.user_id === uid);
    if (g.status === 'waiting' && me?.status === 'invited') invites++;
    if (g.status === 'active' && g.turn_user === uid) myTurn++;
  }
  return { invites, myTurn };
}

export const gameApi = {
  create: (kind: GameKind, invitees: string[], state: unknown) =>
    rpc<number>('game_create', { p_kind: kind, p_invitees: invitees, p_state: state as never }),
  respond: (id: number, accept: boolean) => rpc<Game>('game_respond', { p_game_id: id, p_accept: accept }),
  start: (id: number, state: unknown) => rpc<Game>('game_start', { p_game_id: id, p_state: state as never }),
  roll: (id: number) => rpc<Game>('game_roll', { p_game_id: id }),
  move: (id: number, version: number, state: unknown, next: string | null, result?: 'win' | 'draw', winner?: string | null) =>
    rpc<Game>('game_move', {
      p_game_id: id, p_version: version, p_state: state as never, p_next_user: next as string,
      ...(result ? { p_result: result } : {}), ...(winner ? { p_winner: winner } : {}),
    }),
  leave: (id: number) => rpc<Game>('game_leave', { p_game_id: id }),
};
