// Where the home page's live games' fields lie on the room's floor (see FloorFields): one for each game being played,
// laid on the floor in rows going back from its front — as many in a row as each other, or one more in the nearer
// rows (two games: one near, one far; three: two near, one far), a third row only for seven games or more. All the
// same size on the floor, so a row farther back shows smaller, as it would; as large as fits the nearest row across.

import { floorDepth, floorScale, floorY } from "./grid-room";

/** A field's length, end line to end line, and its width, sideline to sideline (yards). */
export const FIELD_LONG = 120;
export const FIELD_WIDE = 160 / 3;
/** The most fields the floor holds. */
export const MOST_FIELDS = 9;

/** The gap between rows (of a field's width) and between fields in a row (of a field's length). */
const ROW_GAP = 0.22;
const COLUMN_GAP = 0.12;

/** How many fields stand in each row, nearest first: as many as each other, the nearer rows one more where they can't be. */
export function fieldRows(count: number): number[] {
  const n = Math.max(0, Math.min(MOST_FIELDS, Math.floor(count)));
  if (n === 0) return [];
  const rows = n === 1 ? 1 : n <= 6 ? 2 : 3;
  const each = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, i) => each + (i < extra ? 1 : 0));
}

/** A field as it lies on the floor: across from the floor's middle (floor px) its middle, how far back its near sideline is,
 * and how many floor px a yard is. */
export interface FieldSpot {
  across: number;
  near: number;
  yard: number;
}

/** The floor a set of fields is laid on: screen px across between `left` and `right`, from screen y `front` back to `back`. */
export interface FieldFloor {
  width: number;
  height: number;
  share: number;
  left: number;
  right: number;
  front: number;
  back: number;
}

/** How far back a row of fields `yard` floor px a yard reaches. */
const rowDepth = (yard: number) => FIELD_WIDE * yard;

/**
 * `rows` of fields laid on `floor`, nearest first, the nearest from its front: the fields as large as fits every row
 * across (each at its own depth) and all of them back to the floor's back — no larger than `most` floor px a yard.
 * Each row's fields side by side across its middle. Null if there's no floor to lay them on.
 */
export function layRows(rows: number[], floor: FieldFloor, most = Infinity): FieldSpot[][] | null {
  const { width, height, share, left, right, front, back } = floor;
  const room = right - left;
  if (rows.length === 0 || room <= 0 || front <= back) return null;
  const nearest = floorDepth(front, height, share);
  const farthest = floorDepth(back, height, share);
  if (nearest - farthest <= 0) return null;
  // Each row's near sideline, for fields `yard` px a yard.
  const nears = (yard: number) => rows.map((_, i) => nearest - i * rowDepth(yard) * (1 + ROW_GAP));
  const fits = (yard: number) => {
    const at = nears(yard);
    if (at[at.length - 1] - rowDepth(yard) < farthest) return false;
    return rows.every((n, i) => (n * FIELD_LONG + (n - 1) * FIELD_LONG * COLUMN_GAP) * yard * floorScale(at[i]) <= room);
  };
  let [lo, hi] = [0, Math.min(most, room / FIELD_LONG)];
  if (!fits(1e-6)) return null;
  if (fits(hi)) lo = hi;
  else for (let k = 0; k < 40; k++) [lo, hi] = fits((lo + hi) / 2) ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
  const yard = lo;
  const middle = (left + right) / 2 - width / 2;
  return nears(yard).map((near, i) => {
    const n = rows[i];
    const step = FIELD_LONG * yard * (1 + COLUMN_GAP);
    const center = middle / floorScale(near);
    return Array.from({ length: n }, (_, k) => ({ across: center + (k - (n - 1) / 2) * step, near, yard }));
  });
}

/** Every field's spot, in order: the nearest row's first (left to right), then the next row's. */
export function layFields(count: number, floor: FieldFloor): FieldSpot[] {
  return layRows(fieldRows(count), floor)?.flat() ?? [];
}

/**
 * A phone's floor: the field in view (`count`'s first) across the whole of it at its front, the rest in rows behind
 * it (laid as on a wider screen, see fieldRows) — smaller than it, however many there are, and never changing its size.
 */
export function layFocused(count: number, floor: FieldFloor): FieldSpot[] {
  if (count <= 0) return [];
  const [main] = layRows([1], floor)?.[0] ?? [];
  if (!main) return [];
  const rest = Math.min(count, MOST_FIELDS) - 1;
  if (rest === 0) return [main];
  // Behind it, past a gap, as far back as the floor goes.
  const behind = main.near - rowDepth(main.yard) * (1 + ROW_GAP);
  const { height, share } = floor;
  const others = layRows(fieldRows(rest), { ...floor, front: floorY(behind, height, share) }, main.yard * 0.6)?.flat() ?? [];
  return [main, ...others];
}
