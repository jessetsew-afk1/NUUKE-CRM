import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Crown, Dices } from 'lucide-react';
import { Button } from '@/ui/kit';
import { tttMove, tttOutcome, type TTTState } from './tictactoe';
import { ckApply, ckIsKing, ckMoves, ckOutcome, ckOwner, type CkState } from './checkers';
import { chessApply, chessMoves, chessOutcome, colorOf, GLYPH, inCheck, kingSquare, needsPromotion, type ChessMove, type ChessState } from './chess';
import { HOME, LUDO_COLORS, ludoMovable, ludoMove, ludoNext, ludoPass, SAFE_SQUARES, START, tokenSpot, TRACK, HOME_COLUMN, YARD, type LudoState } from './ludo';

/** What a board hands back after a move: the new state, who plays next, and the result if it's over. */
export interface MoveResult { state: unknown; nextSeat: number | null; result?: 'win' | 'draw'; winnerSeat?: number }
export interface BoardProps<S> {
  state: S;
  mySeat: number;
  /** it's my turn and I'm allowed to play */
  canAct: boolean;
  busy: boolean;
  onMove: (m: MoveResult) => void;
}

const IRIS = '#7C5CFF';
const PEACH = '#FF8A5B';

/* ============================================================ Tic-Tac-Toe */
export function TicTacToeBoard({ state, mySeat, canAct, busy, onMove }: BoardProps<TTTState>) {
  const out = tttOutcome(state);
  const line = out && out !== 'draw' ? out.line : [];
  return (
    <div className="mx-auto grid aspect-square w-full max-w-[420px] grid-cols-3 gap-2.5">
      {state.board.map((v, i) => {
        const can = canAct && !busy && v === null && !out;
        return (
          <motion.button key={i} type="button" disabled={!can} whileTap={can ? { scale: 0.94 } : undefined}
            aria-label={`Square ${i + 1}${v === null ? '' : v === 0 ? ', X' : ', O'}`}
            onClick={() => {
              const next = tttMove(state, i, mySeat as 0 | 1);
              if (!next) return;
              const o = tttOutcome(next);
              onMove(o === 'draw' ? { state: next, nextSeat: null, result: 'draw' }
                : o ? { state: next, nextSeat: null, result: 'win', winnerSeat: o.winner }
                : { state: next, nextSeat: 1 - mySeat });
            }}
            className={clsx('glass grid place-items-center rounded-[22px] transition-colors',
              can && 'hover:bg-[var(--glass-strong)]', line.includes(i) && 'ring-4 ring-ok/60')}>
            {v !== null && (
              <motion.span initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                className="select-none text-[clamp(44px,12vw,92px)] font-black leading-none" style={{ color: v === 0 ? IRIS : PEACH }}>
                {v === 0 ? '✕' : '◯'}
              </motion.span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ================================================================ Checkers */
export function CheckersBoard({ state, mySeat, canAct, busy, onMove }: BoardProps<CkState>) {
  const [sel, setSel] = useState<number | null>(null);
  const flip = mySeat === 1;
  const moves = useMemo(() => (canAct ? ckMoves(state) : []), [state, canAct]);
  const from = state.chain ?? sel;
  const targets = from === null ? [] : moves.filter((m) => m.from === from);
  const movable = new Set(moves.map((m) => m.from));
  useEffect(() => setSel(null), [state]);

  const click = (i: number) => {
    if (!canAct || busy) return;
    const m = targets.find((t) => t.to === i);
    if (m) {
      const { state: next, again } = ckApply(state, m);
      const o = ckOutcome(next);
      onMove(o === 'draw' ? { state: next, nextSeat: null, result: 'draw' }
        : o ? { state: next, nextSeat: null, result: 'win', winnerSeat: o.winner }
        : { state: next, nextSeat: again ? mySeat : 1 - mySeat });
      return;
    }
    if (state.chain === null && movable.has(i)) setSel(i);
  };

  return (
    <div className="mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded-[22px] shadow-[0_18px_50px_-24px_rgba(0,0,0,0.5)] ring-1 ring-[var(--hairline)]">
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {Array.from({ length: 64 }, (_, k) => {
          const i = flip ? 63 - k : k;
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const p = state.board[i];
          const owner = ckOwner(p);
          const isTarget = targets.some((t) => t.to === i);
          const last = state.last?.includes(i);
          return (
            <button key={i} type="button" onClick={() => click(i)} aria-label={`Square ${i}`}
              className={clsx('relative grid place-items-center', dark ? 'bg-[#8B6B4A]' : 'bg-[#EAD9BF]')}>
              {last && dark && <span className="absolute inset-0 bg-[#FFD60A]/25" />}
              {isTarget && <span className="absolute size-[30%] rounded-full bg-ok/70" />}
              {owner !== null && (
                <motion.span layout layoutId={`ck-${i}`}
                  className={clsx('relative grid size-[78%] place-items-center rounded-full shadow-[inset_0_-4px_0_rgba(0,0,0,0.25),0_3px_8px_rgba(0,0,0,0.35)]',
                    (from === i) && 'ring-4 ring-iris', canAct && movable.has(i) && from === null && 'ring-2 ring-white/70')}
                  style={{ background: owner === 0 ? '#E5483B' : '#2A2533' }}>
                  {ckIsKing(p) && <Crown className="size-[45%] text-[#FFD60A]" strokeWidth={2.4} />}
                </motion.span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =================================================================== Chess */
export function ChessBoard({ state, mySeat, canAct, busy, onMove }: BoardProps<ChessState>) {
  const [sel, setSel] = useState<number | null>(null);
  const [promo, setPromo] = useState<ChessMove | null>(null);
  const myColor = mySeat === 0 ? 'w' : 'b';
  const flip = myColor === 'b';
  const mine = canAct && state.turn === myColor;
  const targets = useMemo(() => (mine && sel !== null ? chessMoves(state, sel) : []), [mine, sel, state]);
  const check = inCheck(state) ? kingSquare(state.board, state.turn) : -1;
  useEffect(() => { setSel(null); setPromo(null); }, [state]);

  const play = (m: ChessMove) => {
    const next = chessApply(state, m);
    const o = chessOutcome(next);
    onMove(!o ? { state: next, nextSeat: 1 - mySeat }
      : o.kind === 'checkmate' ? { state: next, nextSeat: null, result: 'win', winnerSeat: o.winner === 'w' ? 0 : 1 }
      : { state: next, nextSeat: null, result: 'draw' });
  };
  const click = (i: number) => {
    if (!mine || busy) return;
    const m = targets.find((t) => t.to === i);
    if (m) {
      if (needsPromotion(state, m)) setPromo(m);
      else play(m);
      return;
    }
    setSel(colorOf(state.board[i]) === myColor ? i : null);
  };

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded-[22px] shadow-[0_18px_50px_-24px_rgba(0,0,0,0.5)] ring-1 ring-[var(--hairline)]">
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {Array.from({ length: 64 }, (_, k) => {
          const i = flip ? 63 - k : k;
          const R = Math.floor(i / 8);
          const F = i % 8;
          const dark = (R + F) % 2 === 1;
          const p = state.board[i];
          const t = targets.some((x) => x.to === i);
          const showRank = flip ? F === 7 : F === 0;
          const showFile = flip ? R === 0 : R === 7;
          return (
            <button key={i} type="button" onClick={() => click(i)} aria-label={`${'abcdefgh'[F]}${8 - R}${p ? ` ${p}` : ''}`}
              className={clsx('relative grid place-items-center', dark ? 'bg-[#7B9A62]' : 'bg-[#EEEED2]')}>
              {state.last?.includes(i) && <span className="absolute inset-0 bg-[#FFD60A]/40" />}
              {sel === i && <span className="absolute inset-0 bg-iris/35" />}
              {i === check && <span className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,59,48,0.85),rgba(255,59,48,0)_70%)]" />}
              {t && (p
                ? <span className="absolute inset-[4%] rounded-full border-[5px] border-black/25" />
                : <span className="absolute size-[28%] rounded-full bg-black/25" />)}
              {p && (
                <span className={clsx('relative select-none text-[clamp(26px,8.6vw,56px)] leading-none',
                  colorOf(p) === 'w' ? 'text-white [text-shadow:0_0_2px_#000,0_1px_2px_#000,0_0_1px_#000]' : 'text-[#1D1A2B] [text-shadow:0_1px_0_rgba(255,255,255,0.35)]')}>
                  {GLYPH[p.toLowerCase()]}
                </span>
              )}
              {showRank && <span className={clsx('absolute left-1 top-0.5 text-[10px] font-bold', dark ? 'text-[#EEEED2]' : 'text-[#7B9A62]')}>{8 - R}</span>}
              {showFile && <span className={clsx('absolute bottom-0.5 right-1 text-[10px] font-bold', dark ? 'text-[#EEEED2]' : 'text-[#7B9A62]')}>{'abcdefgh'[F]}</span>}
            </button>
          );
        })}
      </div>
      {promo && (
        <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-[2px]">
          <div className="glass rounded-[22px] p-4 text-center">
            <div className="mb-3 text-[14px] font-bold">Promote your pawn to</div>
            <div className="flex gap-2">
              {(['q', 'r', 'b', 'n'] as const).map((x) => (
                <button key={x} type="button" onClick={() => play({ ...promo, promo: x })}
                  className="grid size-16 place-items-center rounded-2xl bg-[var(--glass-strong)] text-[44px] leading-none ring-1 ring-[var(--hairline)] hover:ring-iris">
                  {GLYPH[x]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================================================================== Ludo */
export function LudoBoard({ state, mySeat, canAct, busy, onMove, roll, onRoll, isActive }: BoardProps<LudoState> & {
  roll: number | null;
  onRoll: () => void;
  /** is this seat still in the game */
  isActive: (seat: number) => boolean;
}) {
  const movable = useMemo(() => (canAct && roll ? ludoMovable(state, mySeat, roll) : []), [state, mySeat, roll, canAct]);
  const passed = useRef<string | null>(null);

  // Nothing to move with that roll: show the dice for a moment, then pass.
  useEffect(() => {
    if (!canAct || !roll || busy || movable.length) return;
    const k = `${roll}-${JSON.stringify(state.tokens[mySeat])}-${state.last?.roll}-${state.last?.seat}`;
    if (passed.current === k) return;
    const t = window.setTimeout(() => {
      passed.current = k;
      onMove({ state: ludoPass(state, mySeat, roll), nextSeat: ludoNext(state, mySeat, isActive) });
    }, 1300);
    return () => window.clearTimeout(t);
  }, [canAct, roll, busy, movable.length, state, mySeat, onMove, isActive]);

  const move = (token: number) => {
    if (!roll || busy || !movable.includes(token)) return;
    const r = ludoMove(state, mySeat, token, roll);
    onMove(r.won ? { state: r.state, nextSeat: null, result: 'win', winnerSeat: mySeat }
      : { state: r.state, nextSeat: r.again ? mySeat : ludoNext(r.state, mySeat, isActive) });
  };

  // stack tokens that share a square so they stay visible
  const spots = new Map<string, number>();
  const tokens = state.seats.flatMap((seat) => (state.tokens[seat] ?? []).map((pos, t) => {
    const color = state.colors[seat];
    const [x, y] = tokenSpot(color, pos, t);
    const k = `${x.toFixed(2)},${y.toFixed(2)}`;
    const n = spots.get(k) ?? 0;
    spots.set(k, n + 1);
    return { seat, t, pos, color, x: x + (pos === -1 ? 0 : n * 0.18), y: y - (pos === -1 ? 0 : n * 0.18) };
  }));

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <svg viewBox="0 0 15 15" className="aspect-square w-full overflow-hidden rounded-[22px] shadow-[0_18px_50px_-24px_rgba(0,0,0,0.5)]">
        <rect width="15" height="15" fill="#FBFAF7" />
        {YARD.map(([r0, c0], color) => (
          <g key={color}>
            <rect x={c0} y={r0} width="6" height="6" fill={LUDO_COLORS[color].hex} />
            <rect x={c0 + 1} y={r0 + 1} width="4" height="4" rx="0.5" fill="#fff" />
            {[[2, 2], [4, 2], [2, 4], [4, 4]].map(([dx, dy]) => (
              <circle key={`${dx}${dy}`} cx={c0 + dx} cy={r0 + dy} r="0.62" fill={LUDO_COLORS[color].soft} stroke={LUDO_COLORS[color].hex} strokeWidth="0.06" />
            ))}
          </g>
        ))}
        {TRACK.map(([r, c], i) => {
          const startOf = START.indexOf(i);
          return (
            <g key={i}>
              <rect x={c} y={r} width="1" height="1" fill={startOf >= 0 ? LUDO_COLORS[startOf].hex : '#fff'} stroke="#D8D4CC" strokeWidth="0.03" />
              {SAFE_SQUARES.has(i) && startOf < 0 && <text x={c + 0.5} y={r + 0.72} textAnchor="middle" fontSize="0.62" fill="#B8B2A6">★</text>}
            </g>
          );
        })}
        {HOME_COLUMN.map((cells, color) => cells.map(([r, c]) => (
          <rect key={`${color}-${r}-${c}`} x={c} y={r} width="1" height="1" fill={LUDO_COLORS[color].hex} stroke="#fff" strokeWidth="0.03" />
        )))}
        {/* the four home triangles in the middle */}
        <polygon points="6,6 7.5,7.5 6,9" fill={LUDO_COLORS[0].hex} />
        <polygon points="6,6 9,6 7.5,7.5" fill={LUDO_COLORS[1].hex} />
        <polygon points="9,6 9,9 7.5,7.5" fill={LUDO_COLORS[2].hex} />
        <polygon points="6,9 7.5,7.5 9,9" fill={LUDO_COLORS[3].hex} />
        {tokens.map(({ seat, t, pos, color, x, y }) => {
          const can = seat === mySeat && movable.includes(t) && !busy;
          const out = !isActive(seat);
          return (
            <motion.g key={`${seat}-${t}`} initial={false} animate={{ x, y }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              onClick={() => can && move(t)} style={{ cursor: can ? 'pointer' : 'default' }} opacity={out ? 0.35 : 1}>
              {can && (
                <circle r="0.55" fill="none" stroke="#1D1A2B" strokeWidth="0.08">
                  <animate attributeName="r" values="0.45;0.64;0.45" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0.35;1" dur="1s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r="0.36" fill={LUDO_COLORS[color].hex} stroke="#fff" strokeWidth="0.09" />
              <circle r="0.14" fill="#fff" opacity="0.85" />
              {pos === HOME && <title>Home</title>}
            </motion.g>
          );
        })}
      </svg>
      <div className="mt-4 flex items-center justify-center gap-4">
        <Die value={roll ?? state.last?.roll ?? null} color={LUDO_COLORS[state.colors[canAct ? mySeat : state.last?.seat ?? mySeat] ?? 0].hex} rolling={busy && canAct && !roll} />
        {canAct && !roll && (
          <Button variant="iris" size="lg" icon={<Dices className="size-5" />} loading={busy} onClick={onRoll}>Roll the dice</Button>
        )}
        {canAct && roll && movable.length > 0 && <span className="text-[14px] font-bold">You rolled {roll}. Tap a glowing token.</span>}
        {canAct && roll && movable.length === 0 && <span className="text-2 text-[14px] font-semibold">You rolled {roll}. Nothing can move, passing…</span>}
      </div>
    </div>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]],
  5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
};
function Die({ value, color, rolling }: { value: number | null; color: string; rolling?: boolean }) {
  return (
    <motion.svg viewBox="0 0 4 4" className="size-14 drop-shadow-md" animate={rolling ? { rotate: [0, 90, 180, 270, 360] } : { rotate: 0 }}
      transition={rolling ? { duration: 0.6, repeat: Infinity, ease: 'linear' } : { type: 'spring' }}>
      <rect x="0.1" y="0.1" width="3.8" height="3.8" rx="0.8" fill="#fff" stroke={color} strokeWidth="0.18" />
      {(value ? PIPS[value] : []).map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="0.36" fill={color} />)}
      {!value && <text x="2" y="2.55" textAnchor="middle" fontSize="1.6" fill={color} fontWeight="800">?</text>}
    </motion.svg>
  );
}
