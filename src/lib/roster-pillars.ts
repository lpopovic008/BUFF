// The Values page's picture of a roster: square pillars in an isometric
// view, stood in a triangle — the most valuable player alone in the back
// row, the next two in the row in front, then three, and so on — each as
// tall as the player's value.
//
// Isometric here is the usual 2:1 kind: a pillar's square top is a diamond
// twice as wide as it is tall, and its two visible sides hang straight down
// from the diamond's lower edges.

export interface Pillar {
  /** Which player (an index into the values passed in). */
  index: number;
  /** 1 for the back row (the most valuable player), counting forward. */
  row: number;
  /** The centre of the pillar's top diamond. */
  x: number;
  topY: number;
  /** How far the sides drop below the top diamond's side corners. */
  height: number;
}

export interface PillarLayout {
  /** Back to front: the order to draw them in, so nearer pillars cover farther ones. */
  pillars: Pillar[];
  /** Half the top diamond's width (its height is half that again). */
  half: number;
  /** The drawing's full height. */
  height: number;
}

/** How many rows a triangle of `n` needs: 1 + 2 + … + rows ≥ n. */
export function triangleRows(n: number): number {
  let rows = 0;
  while ((rows * (rows + 1)) / 2 < n) rows++;
  return rows;
}

/**
 * Lays out a roster's pillars across `width`. Players are ranked by value
 * (no value ranks last) and dealt into rows of 1, 2, 3…, each row left to
 * right by value, a short last row in the middle. Heights run from `minHeight`
 * for no value up to `maxHeight` for the most valuable.
 */
export function layoutPillars(
  values: (number | null)[],
  width: number,
  { margin = 6 }: { margin?: number } = {}
): PillarLayout {
  const n = values.length;
  if (n === 0) return { pillars: [], half: 0, height: 0 };
  const rows = triangleRows(n);
  // Neighbours in a row sit one cell apart; the widest row spans `rows` cells.
  const cell = (width - 2 * margin) / Math.max(rows, 1.5);
  const half = cell * 0.4;
  const maxHeight = Math.max(cell * 2.2, 40);
  const minHeight = cell * 0.3;
  const top = Math.max(1, ...values.map((v) => v ?? 0));
  const order = values.map((v, i) => ({ v: v ?? 0, i })).sort((a, b) => b.v - a.v || a.i - b.i);

  const pillars: Pillar[] = [];
  let rank = 0;
  for (let row = 1; row <= rows && rank < n; row++) {
    const count = Math.min(row, n - rank);
    // The row's grid slots, outward from the middle; a short last row takes
    // the middle ones (staying on the grid, so it never stands half inside
    // the row behind it).
    const slots = Array.from({ length: row }, (_, j) => j - (row - 1) / 2)
      .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
      .slice(0, count)
      .sort((a, b) => a - b);
    for (const slot of slots) {
      const { v, i } = order[rank++];
      pillars.push({
        index: i,
        row,
        x: width / 2 + slot * cell,
        // The isometric grid: a row forward sits half a cell over and a quarter cell down.
        topY: (row - 1) * (cell / 4),
        height: minHeight + (maxHeight - minHeight) * (Math.max(0, v) / top),
      });
    }
  }
  // Lift each pillar by its height, then shift everything down so the tallest top clears the margin.
  for (const p of pillars) p.topY -= p.height;
  const shift = margin + half / 2 - Math.min(...pillars.map((p) => p.topY));
  for (const p of pillars) p.topY += shift;
  const bottom = Math.max(...pillars.map((p) => p.topY + half / 2 + p.height));
  return { pillars, half, height: Math.ceil(bottom + margin) };
}
