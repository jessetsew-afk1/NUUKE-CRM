/** Tic-Tac-Toe. Seat 0 is X and goes first. */
export interface TTTState { board: (0 | 1 | null)[] }

export const tttInit = (): TTTState => ({ board: Array(9).fill(null) });

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function tttOutcome(s: TTTState): { winner: 0 | 1; line: number[] } | 'draw' | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const v = s.board[a];
    if (v !== null && v === s.board[b] && v === s.board[c]) return { winner: v, line };
  }
  return s.board.every((x) => x !== null) ? 'draw' : null;
}

/** Whose turn it is, from the number of marks on the board. */
export const tttTurn = (s: TTTState): 0 | 1 => (s.board.filter((x) => x !== null).length % 2 === 0 ? 0 : 1);

export function tttMove(s: TTTState, idx: number, seat: 0 | 1): TTTState | null {
  if (s.board[idx] !== null || tttOutcome(s) || tttTurn(s) !== seat) return null;
  const board = [...s.board];
  board[idx] = seat;
  return { board };
}
