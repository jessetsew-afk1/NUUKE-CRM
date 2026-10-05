/**
 * Checkers (American rules): 8×8, men move diagonally forward, kings both ways,
 * captures are compulsory and chain, reaching the far row crowns a man (and ends
 * the turn). Seat 0 plays from the bottom and goes first.
 * Board squares 0–63, row = i / 8 from the top. 'a'/'A' = seat 0 man/king, 'b'/'B' = seat 1.
 */
export type CkPiece = '' | 'a' | 'A' | 'b' | 'B';
export interface CkState {
  board: CkPiece[];
  turn: 0 | 1;
  /** mid-chain: the piece that must keep jumping */
  chain: number | null;
  last: [number, number] | null;
  /** moves since the last capture or man move, for the draw rule */
  quiet: number;
}
export interface CkMove { from: number; to: number; capture: number | null }

const row = (i: number) => Math.floor(i / 8);
const col = (i: number) => i % 8;
const at = (r: number, c: number) => (r < 0 || r > 7 || c < 0 || c > 7 ? -1 : r * 8 + c);
export const ckOwner = (p: CkPiece): 0 | 1 | null => (p === 'a' || p === 'A' ? 0 : p === 'b' || p === 'B' ? 1 : null);
export const ckIsKing = (p: CkPiece) => p === 'A' || p === 'B';

export function ckInit(): CkState {
  const board: CkPiece[] = Array(64).fill('');
  for (let i = 0; i < 64; i++) {
    if ((row(i) + col(i)) % 2 === 0) continue;
    if (row(i) <= 2) board[i] = 'b';
    if (row(i) >= 5) board[i] = 'a';
  }
  return { board, turn: 0, chain: null, last: null, quiet: 0 };
}

function pieceMoves(s: CkState, i: number): CkMove[] {
  const p = s.board[i];
  const me = ckOwner(p);
  if (me === null) return [];
  const dirs = ckIsKing(p) ? [-1, 1] : [me === 0 ? -1 : 1];
  const out: CkMove[] = [];
  for (const dr of dirs) {
    for (const dc of [-1, 1]) {
      const n = at(row(i) + dr, col(i) + dc);
      if (n < 0) continue;
      if (s.board[n] === '') out.push({ from: i, to: n, capture: null });
      else if (ckOwner(s.board[n]) === 1 - me) {
        const j = at(row(i) + 2 * dr, col(i) + 2 * dc);
        if (j >= 0 && s.board[j] === '') out.push({ from: i, to: j, capture: n });
      }
    }
  }
  return out;
}

/** Every legal move for the side to play. Captures are compulsory. */
export function ckMoves(s: CkState): CkMove[] {
  if (s.chain !== null) return pieceMoves(s, s.chain).filter((m) => m.capture !== null);
  const all: CkMove[] = [];
  for (let i = 0; i < 64; i++) if (ckOwner(s.board[i]) === s.turn) all.push(...pieceMoves(s, i));
  const caps = all.filter((m) => m.capture !== null);
  return caps.length ? caps : all;
}

/** Applies a move. `again` is true when the same player must keep jumping. */
export function ckApply(s: CkState, m: CkMove): { state: CkState; again: boolean } {
  const board = [...s.board];
  const p = board[m.from];
  board[m.from] = '';
  if (m.capture !== null) board[m.capture] = '';
  let piece = p;
  const crowned = (p === 'a' && row(m.to) === 0) || (p === 'b' && row(m.to) === 7);
  if (crowned) piece = p === 'a' ? 'A' : 'B';
  board[m.to] = piece;
  const quiet = m.capture !== null || !ckIsKing(p) ? 0 : s.quiet + 1;
  const next: CkState = { board, turn: s.turn, chain: null, last: [m.from, m.to], quiet };
  if (m.capture !== null && !crowned) {
    const more = pieceMoves(next, m.to).some((x) => x.capture !== null);
    if (more) return { state: { ...next, chain: m.to }, again: true };
  }
  return { state: { ...next, turn: (1 - s.turn) as 0 | 1 }, again: false };
}

/** The winner once the side to move has no pieces or no moves; 'draw' after 40 quiet king moves each. */
export function ckOutcome(s: CkState): { winner: 0 | 1 } | 'draw' | null {
  if (s.quiet >= 80) return 'draw';
  if (ckMoves(s).length === 0) return { winner: (1 - s.turn) as 0 | 1 };
  return null;
}
