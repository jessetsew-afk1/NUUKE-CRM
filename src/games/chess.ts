/**
 * Chess with the full rules: checks, castling, en passant, promotion, checkmate,
 * stalemate, the 50-move rule, threefold repetition and too-little-material draws.
 * Squares 0–63: 0 = a8 (top left from White's side), 63 = h1.
 * White pieces are upper case (PNBRQK), black lower case. Seat 0 plays White.
 */
export type Color = 'w' | 'b';
export interface ChessState {
  board: string[];
  turn: Color;
  /** castling rights still available, e.g. "KQkq" */
  castle: string;
  /** the square a pawn just skipped over, for en passant */
  ep: number | null;
  half: number;
  full: number;
  last: [number, number] | null;
  /** position keys since the last capture or pawn move, for threefold repetition */
  seen: string[];
}
export interface ChessMove { from: number; to: number; promo?: 'q' | 'r' | 'b' | 'n' }

const START = 'rnbqkbnrpppppppp' + ' '.repeat(32) + 'PPPPPPPPRNBQKBNR';
const r = (i: number) => Math.floor(i / 8);
const f = (i: number) => i % 8;
const sq = (rank: number, file: number) => (rank < 0 || rank > 7 || file < 0 || file > 7 ? -1 : rank * 8 + file);
export const colorOf = (p: string): Color | null => (!p ? null : p === p.toUpperCase() ? 'w' : 'b');
const enemy = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const squareName = (i: number) => `${'abcdefgh'[f(i)]}${8 - r(i)}`;

const key = (s: Pick<ChessState, 'board' | 'turn' | 'castle' | 'ep'>) => `${s.board.map((p) => p || '.').join('')}${s.turn}${s.castle}${s.ep ?? '-'}`;

export function chessInit(): ChessState {
  const board = START.split('').map((c) => (c === ' ' ? '' : c));
  const s = { board, turn: 'w' as Color, castle: 'KQkq', ep: null, half: 0, full: 1, last: null, seen: [] as string[] };
  return { ...s, seen: [key(s)] };
}

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const LINE = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Is square `i` attacked by side `by`? */
export function attacked(board: string[], i: number, by: Color): boolean {
  const R = r(i);
  const F = f(i);
  const is = (j: number, p: string) => j >= 0 && board[j] === (by === 'w' ? p.toUpperCase() : p);
  // pawns attack diagonally forward (white pawns sit below the square they attack)
  const pr = by === 'w' ? R + 1 : R - 1;
  if (is(sq(pr, F - 1), 'p') || is(sq(pr, F + 1), 'p')) return true;
  for (const [dr, df] of KNIGHT) if (is(sq(R + dr, F + df), 'n')) return true;
  for (const [dr, df] of KING) if (is(sq(R + dr, F + df), 'k')) return true;
  const slide = (dirs: number[][], pieces: string[]) => {
    for (const [dr, df] of dirs) {
      let k = 1;
      for (;;) {
        const j = sq(R + dr * k, F + df * k);
        if (j < 0) break;
        if (board[j]) {
          if (pieces.some((p) => is(j, p))) return true;
          break;
        }
        k++;
      }
    }
    return false;
  };
  return slide(DIAG, ['b', 'q']) || slide(LINE, ['r', 'q']);
}

export const kingSquare = (board: string[], c: Color) => board.indexOf(c === 'w' ? 'K' : 'k');
export const inCheck = (s: Pick<ChessState, 'board' | 'turn'>) => attacked(s.board, kingSquare(s.board, s.turn), enemy(s.turn));

function pseudo(s: ChessState): ChessMove[] {
  const out: ChessMove[] = [];
  const me = s.turn;
  const b = s.board;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (colorOf(p) !== me) continue;
    const t = p.toLowerCase();
    const R = r(i);
    const F = f(i);
    const add = (j: number) => {
      if (j < 0 || colorOf(b[j]) === me) return false;
      out.push({ from: i, to: j });
      return !b[j];
    };
    if (t === 'p') {
      const dir = me === 'w' ? -1 : 1;
      const home = me === 'w' ? 6 : 1;
      const one = sq(R + dir, F);
      if (one >= 0 && !b[one]) {
        out.push({ from: i, to: one });
        const two = sq(R + 2 * dir, F);
        if (R === home && !b[two]) out.push({ from: i, to: two });
      }
      for (const df of [-1, 1]) {
        const j = sq(R + dir, F + df);
        if (j < 0) continue;
        if ((b[j] && colorOf(b[j]) !== me) || j === s.ep) out.push({ from: i, to: j });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, df] of t === 'n' ? KNIGHT : KING) add(sq(R + dr, F + df));
      if (t === 'k') {
        // castling: rights, empty path, and the king never passes through check
        const rank = me === 'w' ? 7 : 0;
        const [kSide, qSide] = me === 'w' ? ['K', 'Q'] : ['k', 'q'];
        const them = enemy(me);
        if (i === sq(rank, 4) && !attacked(b, i, them)) {
          if (s.castle.includes(kSide) && !b[sq(rank, 5)] && !b[sq(rank, 6)]
              && !attacked(b, sq(rank, 5), them) && !attacked(b, sq(rank, 6), them)) out.push({ from: i, to: sq(rank, 6) });
          if (s.castle.includes(qSide) && !b[sq(rank, 3)] && !b[sq(rank, 2)] && !b[sq(rank, 1)]
              && !attacked(b, sq(rank, 3), them) && !attacked(b, sq(rank, 2), them)) out.push({ from: i, to: sq(rank, 2) });
        }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? LINE : [...DIAG, ...LINE];
      for (const [dr, df] of dirs) {
        let k = 1;
        while (add(sq(R + dr * k, F + df * k))) k++;
      }
    }
  }
  return out;
}

/** Plays a move without checking it's legal. */
export function chessApply(s: ChessState, m: ChessMove): ChessState {
  const b = [...s.board];
  const p = b[m.from];
  const t = p.toLowerCase();
  const me = s.turn;
  const capture = !!b[m.to] || (t === 'p' && m.to === s.ep);
  b[m.to] = p;
  b[m.from] = '';
  if (t === 'p' && m.to === s.ep) b[m.to + (me === 'w' ? 8 : -8)] = '';
  if (t === 'p' && (r(m.to) === 0 || r(m.to) === 7)) {
    const promo = m.promo ?? 'q';
    b[m.to] = me === 'w' ? promo.toUpperCase() : promo;
  }
  if (t === 'k' && Math.abs(m.to - m.from) === 2) {
    const rank = r(m.from);
    if (f(m.to) === 6) { b[sq(rank, 5)] = b[sq(rank, 7)]; b[sq(rank, 7)] = ''; }
    else { b[sq(rank, 3)] = b[sq(rank, 0)]; b[sq(rank, 0)] = ''; }
  }
  let castle = s.castle;
  const strip = (chars: string) => { for (const c of chars) castle = castle.replace(c, ''); };
  if (p === 'K') strip('KQ');
  if (p === 'k') strip('kq');
  for (const i of [m.from, m.to]) {
    if (i === 63) strip('K');
    if (i === 56) strip('Q');
    if (i === 7) strip('k');
    if (i === 0) strip('q');
  }
  const ep = t === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : null;
  const half = t === 'p' || capture ? 0 : s.half + 1;
  const next = { board: b, turn: enemy(me), castle, ep, half, full: s.full + (me === 'b' ? 1 : 0), last: [m.from, m.to] as [number, number] };
  return { ...next, seen: [...(half === 0 ? [] : s.seen), key(next)].slice(-120) };
}

/** Legal moves for the side to play, optionally from one square. */
export function chessMoves(s: ChessState, from?: number): ChessMove[] {
  return pseudo(s)
    .filter((m) => from === undefined || m.from === from)
    .filter((m) => {
      const n = chessApply(s, m);
      return !attacked(n.board, kingSquare(n.board, s.turn), n.turn);
    });
}

export const needsPromotion = (s: ChessState, m: ChessMove) =>
  s.board[m.from].toLowerCase() === 'p' && (r(m.to) === 0 || r(m.to) === 7);

function insufficient(b: string[]) {
  const pieces = b.map((p, i) => ({ p, i })).filter((x) => x.p && x.p.toLowerCase() !== 'k');
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && /[nbNB]/.test(pieces[0].p)) return true;
  // bishops only, all on the same colour of square
  if (pieces.every((x) => /[bB]/.test(x.p))) {
    const shade = new Set(pieces.map((x) => (r(x.i) + f(x.i)) % 2));
    return shade.size === 1;
  }
  return false;
}

export type ChessOutcome =
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' | 'fifty' | 'repetition' | 'material' };

export function chessOutcome(s: ChessState): ChessOutcome | null {
  if (chessMoves(s).length === 0) return inCheck(s) ? { kind: 'checkmate', winner: enemy(s.turn) } : { kind: 'stalemate' };
  if (s.half >= 100) return { kind: 'fifty' };
  if (insufficient(s.board)) return { kind: 'material' };
  const k = s.seen[s.seen.length - 1];
  if (k && s.seen.filter((x) => x === k).length >= 3) return { kind: 'repetition' };
  return null;
}

export const GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};
