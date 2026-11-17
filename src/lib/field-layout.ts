// Where the home page's live games' fields lie on the room's floor (see FloorFields): one for each game being played,
// laid on the floor in rows going back from its front — as many in a row as each other, or one more in the nearer
// rows (two games: one near, one far; three: two near, one far), a third row only for seven games or more. All the
// same size on the floor, so a row farther back shows smaller, as it would; as large as fits the nearest row across.

import { FLOOR_TILT, floorDepth, floorScale, floorY } from "./grid-room";

/** A field's length, end line to end line, and its width, sideline to sideline (yards). */
export const FIELD_LONG = 120;
export const FIELD_WIDE = 160 / 3;
/** The most fields the floor holds. */
export const MOST_FIELDS = 9;

/** The gap between rows on the screen (px) — room for a field's play to be named over it (see FloorFields) clear of
 * the field behind — and between fields in a row (of a field's length). */
export const ROW_GAP_PX = 26;
/** On a phone's strip of floor, the rows behind the field in view just a little apart: room there is short. */
export const PHONE_ROW_GAP_PX = 6;
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
  /** The rows of fields centered on the floor, their nearest row as wide as it (see layCentered) — not laid from its
   * front. */
  centered?: boolean;
  /** How far the floor's laid back (see grid-room's FLOOR_TILT) — as it lies, unless given. */
  tilt?: number;
}

/** How far back a row of fields `yard` floor px a yard reaches. */
const rowDepth = (yard: number) => FIELD_WIDE * yard;

/**
 * `rows` of fields laid on `floor`, nearest first, the nearest from its front: the fields as large as fits every row
 * across (each at its own depth) and all of them back to the floor's back — no larger than `most` floor px a yard.
 * Each row's fields side by side across its middle. Null if there's no floor to lay them on.
 */
export function layRows(rows: number[], floor: FieldFloor, most = Infinity, gap = ROW_GAP_PX): FieldSpot[][] | null {
  const { height, share, left, right, front, back, tilt = FLOOR_TILT } = floor;
  const room = right - left;
  if (rows.length === 0 || room <= 0 || front <= back) return null;
  const nearest = floorDepth(front, height, share, tilt);
  const farthest = floorDepth(back, height, share, tilt);
  if (nearest - farthest <= 0) return null;
  // Each row's near sideline, for fields `yard` px a yard: the nearest at the front, each next one past a gap.
  const nears = (yard: number) => stepBack(nearest, rows.length, yard, height, share, tilt, gap);
  const fits = (yard: number) => {
    const at = nears(yard);
    if (at[at.length - 1] - rowDepth(yard) < farthest) return false;
    return rows.every((n, i) => rowWide(n, yard) * floorScale(at[i], tilt) <= room);
  };
  let [lo, hi] = [0, Math.min(most, room / FIELD_LONG)];
  if (!fits(1e-6)) return null;
  if (fits(hi)) lo = hi;
  else for (let k = 0; k < 40; k++) [lo, hi] = fits((lo + hi) / 2) ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
  return spotsOf(rows, nears(lo), lo, floor);
}

/** `n` rows' near sideline, the first's at `first`, each next behind the one before past a gap on the screen. */
function stepBack(first: number, n: number, yard: number, height: number, share: number, tilt: number, gap = ROW_GAP_PX): number[] {
  const nears = [first];
  while (nears.length < n) nears.push(behind(nears[nears.length - 1] - rowDepth(yard), height, share, tilt, gap));
  return nears;
}
/** How far back the near sideline of a row behind one whose far sideline is `far` back lies: past the gap. */
const behind = (far: number, height: number, share: number, tilt: number, gap = ROW_GAP_PX) => floorDepth(floorY(far, height, share, tilt) - gap, height, share, tilt);

/** Each row's fields, its near sideline `near[i]` back, side by side across the floor's middle. */
function spotsOf(rows: number[], nears: number[], yard: number, { width, left, right, tilt = FLOOR_TILT }: FieldFloor): FieldSpot[][] {
  const middle = (left + right) / 2 - width / 2;
  const step = FIELD_LONG * yard * (1 + COLUMN_GAP);
  return nears.map((near, i) => {
    const n = rows[i];
    const center = middle / floorScale(near, tilt);
    return Array.from({ length: n }, (_, k) => ({ across: center + (k - (n - 1) / 2) * step, near, yard }));
  });
}

/** How wide a row of `n` fields is, across the floor (floor px), `yard` px a yard. */
const rowWide = (n: number, yard: number) => (n * FIELD_LONG + (n - 1) * FIELD_LONG * COLUMN_GAP) * yard;

/**
 * `rows` of fields laid across the floor (from tablet width up): as big as puts the nearest row's outermost end lines,
 * halfway between their sidelines, on the floor's sides (`left`, `right`) — however many rows there are — and the
 * rows, a gap apart, centered north to south on the floor (as much of it in front of them as behind them, on the
 * screen). Smaller only where they'd not all fit on the floor so. Null with no floor.
 */
export function layCentered(rows: number[], floor: FieldFloor): FieldSpot[][] | null {
  const { height, share, left, right, front, back, tilt = FLOOR_TILT } = floor;
  const room = right - left;
  if (rows.length === 0 || room <= 0 || front <= back) return null;
  const nearest = floorDepth(front, height, share, tilt);
  const farthest = floorDepth(back, height, share, tilt);
  if (nearest - farthest <= 0) return null;
  const y = (d: number) => floorY(d, height, share, tilt);
  // The rows' near sidelines, the nearest's `first` back, each next past a gap — and the screen y's of the nearest's
  // near sideline and the farthest's far one.
  const from = (first: number, yard: number) => stepBack(first, rows.length, yard, height, share, tilt);
  const ends = (nears: number[], yard: number) => [y(nears[0]), y(nears[nears.length - 1] - rowDepth(yard))];
  // Laid so there's as much floor in front of them as behind them.
  const centered = (yard: number) => {
    let [lo, hi] = [farthest, nearest];
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      const [bottom, top] = ends(from(mid, yard), yard);
      if (top - back < front - bottom) lo = mid;
      else hi = mid;
    }
    return from(lo, yard);
  };
  const fits = (yard: number) => {
    const nears = centered(yard);
    const [bottom, top] = ends(nears, yard);
    if (top < back - 0.5 || bottom > front + 0.5) return false;
    // The nearest row, halfway between its sidelines, no wider than the floor.
    return rowWide(rows[0], yard) * floorScale(nears[0] - rowDepth(yard) / 2, tilt) <= room + 1e-6;
  };
  let [lo, hi] = [0, room / FIELD_LONG];
  if (!fits(1e-6)) return null;
  for (let k = 0; k < 50; k++) [lo, hi] = fits((lo + hi) / 2) ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
  return spotsOf(rows, centered(lo), lo, floor);
}

/** Every field's spot, in order: the nearest row's first (left to right), then the next row's — centered on the
 * floor (`centered`, see layCentered), or from its front. */
export function layFields(count: number, floor: FieldFloor): FieldSpot[] {
  const rows = fieldRows(count);
  return (floor.centered ? layCentered(rows, floor) : layRows(rows, floor))?.flat() ?? [];
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
  const { height, share, tilt = FLOOR_TILT } = floor;
  const back = behind(main.near - rowDepth(main.yard), height, share, tilt, PHONE_ROW_GAP_PX);
  const others = layRows(fieldRows(rest), { ...floor, front: floorY(back, height, share, tilt) }, main.yard * 0.6, PHONE_ROW_GAP_PX)?.flat() ?? [];
  return [main, ...others];
}
