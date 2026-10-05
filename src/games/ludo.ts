/**
 * Ludo for 2–4 players. Each player has four tokens:
 *   -1        still in the yard (a 6 brings one out)
 *   0 … 50    on the shared track, counted from the player's own start square
 *   51 … 55   in their coloured home column
 *   56        home
 * Rolling a 6 or knocking someone back to their yard earns another roll. Start
 * squares and star squares are safe. You need the exact number to get home.
 * First to bring all four home wins. The dice are rolled by the database.
 */
export interface LudoState {
  /** seats in play order */
  seats: number[];
  /** which colour each seat plays: 0 red, 1 green, 2 yellow, 3 blue */
  colors: Record<string, number>;
  tokens: Record<string, number[]>;
  last: { seat: number; roll: number; token: number | null; from: number; to: number; captured: number | null } | null;
}

export const LUDO_COLORS = [
  { name: 'Red', hex: '#FF453A', soft: '#FFD9D6' },
  { name: 'Green', hex: '#30C46C', soft: '#D3F3E0' },
  { name: 'Yellow', hex: '#F5B400', soft: '#FFF0C2' },
  { name: 'Blue', hex: '#0A84FF', soft: '#D3E8FF' },
];
export const START = [0, 13, 26, 39];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const HOME = 56;

export function ludoInit(seats: number[]): LudoState {
  const order = [...seats].sort((a, b) => a - b);
  // two players sit opposite each other, like on a real board
  const palette = order.length === 2 ? [0, 2] : [0, 1, 2, 3];
  const colors: Record<string, number> = {};
  const tokens: Record<string, number[]> = {};
  order.forEach((s, i) => { colors[s] = palette[i]; tokens[s] = [-1, -1, -1, -1]; });
  return { seats: order, colors, tokens, last: null };
}

/** Where a token sits on the shared 52-square track, or null when it's off it. */
export function trackIndex(color: number, pos: number): number | null {
  if (pos < 0 || pos > 50) return null;
  return (START[color] + pos) % 52;
}

/** Tokens the seat can move with this roll. */
export function ludoMovable(s: LudoState, seat: number, roll: number): number[] {
  return (s.tokens[seat] ?? []).flatMap((p, i) => {
    if (p === HOME) return [];
    if (p === -1) return roll === 6 ? [i] : [];
    return p + roll <= HOME ? [i] : [];
  });
}

export function ludoMove(s: LudoState, seat: number, token: number, roll: number): { state: LudoState; again: boolean; won: boolean } {
  const from = s.tokens[seat][token];
  const to = from === -1 ? 0 : from + roll;
  const tokens: Record<string, number[]> = Object.fromEntries(Object.entries(s.tokens).map(([k, v]) => [k, [...v]]));
  tokens[seat][token] = to;
  let captured: number | null = null;
  const idx = trackIndex(s.colors[seat], to);
  if (idx !== null && !SAFE.has(idx)) {
    for (const other of s.seats) {
      if (other === seat) continue;
      tokens[other] = tokens[other].map((p) => {
        if (trackIndex(s.colors[other], p) === idx) { captured = other; return -1; }
        return p;
      });
    }
  }
  const won = tokens[seat].every((p) => p === HOME);
  return {
    state: { ...s, tokens, last: { seat, roll, token, from, to, captured } },
    again: !won && (roll === 6 || captured !== null),
    won,
  };
}

/** Records a roll with nothing to move. */
export const ludoPass = (s: LudoState, seat: number, roll: number): LudoState =>
  ({ ...s, last: { seat, roll, token: null, from: -1, to: -1, captured: null } });

/** The next seat to play, skipping anyone who has left. */
export function ludoNext(s: LudoState, seat: number, active: (seat: number) => boolean): number {
  const i = s.seats.indexOf(seat);
  for (let k = 1; k <= s.seats.length; k++) {
    const n = s.seats[(i + k) % s.seats.length];
    if (active(n)) return n;
  }
  return seat;
}

/* ------------------------------------------------- board geometry (15 × 15) */
/** The 52 track squares as [row, col], starting at Red's start square and going clockwise. */
export const TRACK: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
];
/** Each colour's home column, five squares from the edge inwards. */
export const HOME_COLUMN: [number, number][][] = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
];
/** Top-left corner of each colour's yard. */
export const YARD: [number, number][] = [[0, 0], [0, 9], [9, 9], [9, 0]];
/** Where finished tokens gather, in the coloured triangle in the middle. */
export const FINISH: [number, number][] = [[7.5, 6.55], [6.55, 7.5], [7.5, 8.45], [8.45, 7.5]];
export const SAFE_SQUARES = SAFE;

/** Centre of a token in board units (1 unit = 1 square), as [x, y]. */
export function tokenSpot(color: number, pos: number, token: number): [number, number] {
  if (pos === -1) {
    const [r0, c0] = YARD[color];
    const dx = token % 2 === 0 ? 2 : 4;
    const dy = token < 2 ? 2 : 4;
    return [c0 + dx, r0 + dy];
  }
  if (pos === HOME) {
    const [y, x] = FINISH[color];
    return [x, y];
  }
  const [row, col] = pos <= 50 ? TRACK[trackIndex(color, pos)!] : HOME_COLUMN[color][pos - 51];
  return [col + 0.5, row + 0.5];
}
