import test from "node:test";
import assert from "node:assert/strict";
import { layoutRosterWeb } from "./roster-web";

// A typical roster: a few stars, a long tail, a couple with no value at all.
const ROSTER = [9998, 2100, 7400, 450, 5600, null, 3300, 880, 6100, 1200, 300, 4100, 150, 2600, 990, 70, 3800, null, 1500, 5200, 640, 2900, 1100, 410, 8200];

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test("the most valuable player sits nearest the middle, with the biggest dot", () => {
  const { nodes } = layoutRosterWeb(ROSTER, 600, 500);
  const best = ROSTER.indexOf(9998);
  const centre = { x: 300, y: 250 };
  for (const [i, node] of nodes.entries()) {
    if (i === best) continue;
    assert.ok(dist(nodes[best], centre) <= dist(node, centre), `player ${i} is nearer the middle than the best`);
    assert.ok(nodes[best].r >= node.r);
  }
});

test("dots grow with value, and a player with no value gets the smallest", () => {
  const { nodes } = layoutRosterWeb(ROSTER, 600, 500, { minR: 4, maxR: 24 });
  const byValue = ROSTER.map((v, i) => ({ v: v ?? 0, r: nodes[i].r })).sort((a, b) => a.v - b.v);
  for (let i = 1; i < byValue.length; i++) assert.ok(byValue[i].r >= byValue[i - 1].r);
  assert.equal(nodes[ROSTER.indexOf(null)].r, 4);
  assert.equal(nodes[ROSTER.indexOf(9998)].r, 24);
});

test("no two players' blocks (dot and name) overlap, and all stay in the box", () => {
  const widths = ROSTER.map((_, i) => 40 + (i % 5) * 12);
  for (const [w, h] of [[600, 500], [327, 425]]) {
    const gap = 12;
    const { nodes } = layoutRosterWeb(ROSTER, w, h, { maxR: Math.min(w, h) / 22, labelGap: gap, labelWidths: widths });
    const box = (i: number) => {
      const half = Math.max(nodes[i].r, widths[i] / 2);
      return { l: nodes[i].x - half, r: nodes[i].x + half, t: nodes[i].y - nodes[i].r, b: nodes[i].y + nodes[i].r + gap };
    };
    for (let a = 0; a < nodes.length; a++) {
      const A = box(a);
      assert.ok(A.l >= 0 && A.r <= w && A.t >= 0 && A.b <= h, `player ${a} is outside ${w}x${h}`);
      for (let b = a + 1; b < nodes.length; b++) {
        const B = box(b);
        const apart = A.r <= B.l + 0.5 || B.r <= A.l + 0.5 || A.b <= B.t + 0.5 || B.b <= A.t + 0.5;
        assert.ok(apart, `players ${a} and ${b} overlap at ${w}x${h}`);
      }
    }
  }
});

test("each dot is joined to its nearest few, each pair once", () => {
  const { nodes, edges } = layoutRosterWeb(ROSTER, 600, 500);
  const keys = edges.map(([a, b]) => `${a}:${b}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const [a, b] of edges) assert.ok(a < b && b < nodes.length);
  for (let i = 0; i < nodes.length; i++) assert.ok(edges.filter(([a, b]) => a === i || b === i).length >= 3);
  // Everyone is reachable from everyone: one web, not islands.
  const reached = new Set([0]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [a, b] of edges) {
      if (reached.has(a) !== reached.has(b)) {
        reached.add(a);
        reached.add(b);
        grew = true;
      }
    }
  }
  assert.equal(reached.size, nodes.length);
});

test("an empty roster draws nothing; one player sits alone in the middle", () => {
  assert.deepEqual(layoutRosterWeb([], 600, 500), { nodes: [], edges: [] });
  const one = layoutRosterWeb([500], 600, 500);
  assert.deepEqual([one.nodes[0].x, one.nodes[0].y, one.edges.length], [300, 250, 0]);
});

test("two far-apart clusters still end up joined", () => {
  // Tiny boxes force the spiral into a line of clumps; the web must still be one piece.
  const { nodes, edges } = layoutRosterWeb([100, 90, 80, 70, 60, 50, 40, 30, 20], 900, 60, { maxR: 6, labelGap: 2 });
  const reached = new Set([0]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [a, b] of edges) {
      if (reached.has(a) !== reached.has(b)) {
        reached.add(a);
        reached.add(b);
        grew = true;
      }
    }
  }
  assert.equal(reached.size, nodes.length);
});
