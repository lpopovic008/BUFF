// The Values page's picture of a roster: a web of dots, one per player, the
// most valuable in the middle and biggest, the rest spiralling outward as
// their value falls, each joined to its nearest few by a line.

export interface WebNode {
  x: number;
  y: number;
  /** The dot's radius, by the player's value. */
  r: number;
}

export interface WebLayout {
  /** One per value passed in, in the same order. */
  nodes: WebNode[];
  /** Pairs of node indexes to join with a line, each pair once, lower index first. */
  edges: [number, number][];
}

/** The golden angle: each next dot turns this far round, so the spiral fills evenly. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** How many of its nearest neighbors each dot is joined to. */
const NEIGHBORS = 3;

/**
 * Lays out a roster's web in a `width` × `height` box. Dots sit on a
 * sunflower spiral out from the centre in order of value, sized by value
 * (area in proportion), then are eased apart until no two players' blocks —
 * the dot, with its name under it (`labelGap` tall, `labelWidths[i]` wide) —
 * overlap. A player with no value gets the smallest dot, on the outside.
 */
export function layoutRosterWeb(
  values: (number | null)[],
  width: number,
  height: number,
  {
    minR = 4,
    maxR = 24,
    labelGap = 14,
    labelWidths = [],
  }: { minR?: number; maxR?: number; labelGap?: number; labelWidths?: number[] } = {}
): WebLayout {
  const n = values.length;
  if (n === 0) return { nodes: [], edges: [] };
  const top = Math.max(1, ...values.map((v) => v ?? 0));
  const order = values.map((v, i) => ({ v: v ?? 0, i })).sort((a, b) => b.v - a.v || a.i - b.i);
  const cx = width / 2;
  const cy = height / 2;
  const widest = Math.max(0, ...labelWidths) / 2;
  const rx = Math.max(0, width / 2 - Math.max(maxR, widest) - 2);
  const ry = Math.max(0, height / 2 - maxR - labelGap);

  const nodes: WebNode[] = new Array(n);
  const home: { x: number; y: number }[] = new Array(n);
  order.forEach(({ v, i }, rank) => {
    // The top player at the centre; everyone else out along the spiral.
    const rho = rank === 0 ? 0 : Math.sqrt((rank + 1) / (n + 1));
    const theta = rank * GOLDEN_ANGLE - Math.PI / 2;
    const x = cx + rho * rx * Math.cos(theta);
    const y = cy + rho * ry * Math.sin(theta);
    home[i] = { x, y };
    nodes[i] = { x, y, r: minR + (maxR - minR) * Math.sqrt(Math.max(0, v) / top) };
  });

  // Each player's block: as wide as the dot or its name, whichever is wider;
  // from the top of the dot down to the bottom of the name.
  const halfW = nodes.map((node, i) => Math.max(node.r, (labelWidths[i] ?? 0) / 2));
  const MARGIN = 3;
  // Ease overlapping blocks apart along whichever way they overlap least; the
  // bigger dot moves less, and each is drawn gently back toward its place on
  // the spiral so the shape holds.
  const clampX = (x: number, i: number) => Math.min(width - halfW[i] - 1, Math.max(halfW[i] + 1, x));
  const clampY = (y: number, r: number) => Math.min(height - r - labelGap, Math.max(r + 1, y));
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const A = nodes[a];
        const B = nodes[b];
        const overlapX = halfW[a] + halfW[b] + MARGIN - Math.abs(B.x - A.x);
        const overlapY =
          Math.min(A.y + A.r + labelGap, B.y + B.r + labelGap) - Math.max(A.y - A.r, B.y - B.r) + MARGIN;
        if (overlapX <= 0 || overlapY <= 0) continue;
        const wa = B.r / (A.r + B.r);
        const wb = A.r / (A.r + B.r);
        if (overlapX < overlapY) {
          const dir = B.x > A.x || (B.x === A.x && b > a) ? 1 : -1;
          A.x -= dir * overlapX * wa;
          B.x += dir * overlapX * wb;
        } else {
          const dir = B.y > A.y || (B.y === A.y && b > a) ? 1 : -1;
          A.y -= dir * overlapY * wa;
          B.y += dir * overlapY * wb;
        }
        moved = true;
      }
    }
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      node.x = clampX(node.x + (home[i].x - node.x) * 0.01, i);
      node.y = clampY(node.y + (home[i].y - node.y) * 0.01, node.r);
    }
    if (!moved) break;
  }

  // Each dot joined to its nearest few.
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) {
    const nearest = nodes
      .map((node, b) => ({ b, d: Math.hypot(node.x - nodes[a].x, node.y - nodes[a].y) }))
      .filter(({ b }) => b !== a)
      .sort((p, q) => p.d - q.d)
      .slice(0, NEIGHBORS);
    for (const { b } of nearest) {
      const pair: [number, number] = a < b ? [a, b] : [b, a];
      const key = pair.join(":");
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(pair);
      }
    }
  }
  // One web, not islands: any cluster left apart is joined by its shortest bridge.
  const group = nodes.map((_, i) => i);
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])));
  for (const [a, b] of edges) group[find(a)] = find(b);
  for (;;) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        if (find(a) === find(b)) continue;
        const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
        if (d < bestD) {
          bestD = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    edges.push(best);
    group[find(best[0])] = find(best[1]);
  }
  return { nodes, edges };
}
