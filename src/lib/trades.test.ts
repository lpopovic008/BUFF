import test from "node:test";
import assert from "node:assert/strict";
import { addedValues, AnalyzedTrade, analyzeTrades, DraftResult, evenValue, filterTrades, MY_TRADES, nflDraftDay, pickTrends, processedValue, TradeSeason, tradeGaps, TradeSide } from "./trades";
import { DAY_MS, ValueHistory, ValueSeries, valueOn } from "./value-history";
import { SleeperTransaction } from "./sleeper";

// A grid of four weekly points from day 1000.
const history: ValueHistory = {
  updatedAt: null,
  from: 1000,
  step: 7,
  players: {
    "1": { n: "Star Back", p: "RB", t: "DET", sf: [8000, 8200, 8400, 8600], q: [7000, 7100, 7200, 7300] },
    "2": { n: "2025 Mid 1st", p: "RDP", t: null, sf: [5000, 5100, null, null], q: [4000, 4000, null, null] },
    "3": { n: "Rookie Wideout", p: "WR", t: "KCC", sf: [null, null, 6000, 6500], q: [null, null, 5000, 5200] },
    "4": { n: "Depth End", p: "TE", t: "NYJ", sf: [3000, 2500, 2000, 1000], q: [2000, 1500, 1000, 500] },
  },
};
const bySleeperId = new Map<string, ValueSeries>([
  ["s1", history.players["1"]],
  ["s3", history.players["3"]],
  ["s4", history.players["4"]],
]);
const players = new Map([
  ["s1", { name: "Star Back", position: "RB" }],
  ["s3", { name: "Rookie Wideout", position: "WR" }],
  ["s4", { name: "Depth End", position: "TE" }],
]);

const trade: SleeperTransaction = {
  transaction_id: "t1",
  type: "trade",
  status: "complete",
  leg: 1,
  creator: "u1",
  created: 1001 * DAY_MS,
  roster_ids: [1, 2],
  adds: { s1: 2 },
  drops: { s1: 1 },
  draft_picks: [{ season: "2025", round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }],
  waiver_budget: [{ sender: 2, receiver: 1, amount: 15 }],
};
const seasons: TradeSeason[] = [{ season: "2025", teamNames: new Map([[1, "Alpha"], [2, "Beta"]]), myRosterId: 1, trades: [trade] }];
// The 2025 draft on day 1014: team 2's first became the rookie.
const drafts = new Map<string, DraftResult[]>([["2025", [{ at: 1014 * DAY_MS, players: new Map([["1-2", "s3"]]) }]]]);

test("analyzeTrades weighs each side's haul when traded and now, a pick as whoever it became", () => {
  const [t] = analyzeTrades(seasons, drafts, history, bySleeperId, players, true, 1021 * DAY_MS);
  const [alpha, beta] = t.sides;
  assert.equal(alpha.team, "Alpha");
  assert.equal(alpha.mine, true);
  assert.equal(alpha.faab, 15);
  // Alpha got the pick: worth 5000 then (the week the trade's in), now the rookie it became.
  assert.deepEqual(alpha.got.map((a) => [a.label, a.then, a.now, a.became?.name]), [["2025 1st", 5000, 6500, "Rookie Wideout"]]);
  // The pick at its draft (its last value before it, 5100), and the rookie from the draft (6000) to now.
  assert.equal(alpha.got[0].atDraft, 5100);
  assert.equal(alpha.got[0].atDraftEstimated, false);
  assert.deepEqual([alpha.got[0].became?.drafted, alpha.got[0].became?.now], [6000, 6500]);
  assert.deepEqual(beta.got.map((a) => [a.label, a.then, a.now]), [["Star Back", 8000, 8600]]);
  assert.equal(beta.then, 8000);
  assert.equal(beta.now, 8600);
  // Week by week from the trade: the pick, then the rookie from the draft on — the side's, and the pick's own.
  assert.deepEqual(alpha.path.map((p) => p.value), [5100, 6000, 6500]);
  assert.deepEqual(alpha.got[0].path.map((p) => [p.value, p.estimated]), [[5100, false], [6000, false], [6500, false]]);
  assert.deepEqual(beta.got[0].path.map((p) => p.value), [8200, 8400, 8600]);
});

test("analyzeTrades stands in what a pick became when there's no value from when it was traded", () => {
  const noPickHistory: ValueHistory = { ...history, players: { "1": history.players["1"], "3": history.players["3"] } };
  const [t] = analyzeTrades(seasons, drafts, noPickHistory, bySleeperId, players, true, 1021 * DAY_MS);
  const [pick] = t.sides[0].got;
  assert.equal(pick.then, 6000);
  assert.equal(pick.thenEstimated, true);
  // Held at the stand-in until the draft, rather than reading as nothing.
  assert.deepEqual(t.sides[0].path.map((p) => p.value), [6000, 6000, 6500]);
});

// Mid firsts of 2030: 3000 two years before the draft, 4000 a year before, 5000 at it.
const draft2030 = Math.floor(Date.UTC(2030, 4, 1) / DAY_MS);
const trendHistory: ValueHistory = {
  updatedAt: null,
  from: draft2030 - 2 * 365,
  step: 365,
  players: { m: { n: "2030 Mid 1st", p: "RDP", t: null, sf: [3000, 4000, 5000], q: [3000, 4000, 5000] } },
};

test("pickTrends fits each round's value against years before its draft", () => {
  const trend = pickTrends(trendHistory, true).get(1)!;
  assert.ok(Math.abs(trend.a - 5000) < 10);
  assert.ok(Math.abs(trend.b + 1000) < 10);
});

test("analyzeTrades holds a side's added value at what it was when traded", () => {
  // Star Back for the first and Depth End: Alpha, getting the one better piece, is due added value.
  const twoForOne: SleeperTransaction = { ...trade, adds: { s1: 1, s4: 2 }, drops: { s1: 2, s4: 1 }, draft_picks: [{ ...trade.draft_picks![0], owner_id: 2, previous_owner_id: 1 }], waiver_budget: [] };
  const [t] = analyzeTrades([{ ...seasons[0], trades: [twoForOne] }], drafts, history, bySleeperId, players, true, 1021 * DAY_MS);
  const [alpha, beta] = t.sides;
  assert.deepEqual([alpha.then, beta.then], [8000, 8000]);
  assert.deepEqual([alpha.added, beta.added], addedValues([8000], [5000, 3000]).map((v) => Math.floor(v / 100) * 100));
  assert.ok(alpha.added > 0);
  // Every week since, the haul plus that same added value — however the pieces' values have moved.
  assert.deepEqual(alpha.path.map((p) => p.value), [8200 + alpha.added, 8400 + alpha.added, 8600 + alpha.added]);
});

test("analyzeTrades estimates a pick KTC had no value for from its round's trend", () => {
  const draft2031 = Math.floor(Date.UTC(2031, 4, 1) / DAY_MS);
  const pickTrade: SleeperTransaction = {
    ...trade,
    created: (draft2031 - 365) * DAY_MS,
    adds: null,
    waiver_budget: [],
    draft_picks: [{ season: "2031", round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }],
  };
  const [t] = analyzeTrades([{ ...seasons[0], trades: [pickTrade] }], new Map(), trendHistory, new Map(), new Map(), true, (draft2031 - 100) * DAY_MS);
  const [pick] = t.sides[0].got;
  // A year before its draft: about 4000 — and, 100 days before, more.
  assert.ok(Math.abs(pick.then! - 4000) < 10);
  assert.equal(pick.thenEstimated, true);
  assert.ok(pick.now! > pick.then!);
  assert.equal(pick.nowEstimated, true);
  // Estimated all the way along its path.
  assert.ok(pick.path.length > 1 && pick.path.every((p) => p.estimated && p.value !== null));
});

test("analyzeTrades finds a pick in whichever of its season's drafts has it, past an empty one", () => {
  const withEmpty = new Map<string, DraftResult[]>([["2025", [{ at: 1018 * DAY_MS, players: new Map() }, ...drafts.get("2025")!]]]);
  const [t] = analyzeTrades(seasons, withEmpty, history, bySleeperId, players, true, 1021 * DAY_MS);
  assert.equal(t.sides[0].got[0].became?.name, "Rookie Wideout");
});

// KTC's trade calculator (superflex, Oct 2026): each side's pieces, the Value Adjustment it showed and to whom,
// and the player value it said would even the trade. Gibbs 9998, Allen 9983, Mahomes 6302, Pickens 5676,
// 2027 Mid 1st 5584, Etienne 3284, Pierce 3278, 2028 Mid 2nd 3158, Coleman 3147, 2029 Mid 2nd 2931.
const ktc: { a: number[]; b: number[]; added: [number, number]; even?: number }[] = [
  { a: [9998, 3147], b: [5676, 5584, 3284, 3278, 3158, 2931], added: [9332, 0] },
  { a: [9983, 5584], b: [6302], added: [0, 0], even: 9565 },
  { a: [9998], b: [5676], added: [0, 0], even: 8116 },
  { a: [9998], b: [9983], added: [0, 0] },
  { a: [9998], b: [5676, 3284], added: [6193, 0], even: 7232 },
  { a: [9998], b: [5676, 5584], added: [6911, 0], even: 5650 },
  { a: [9998], b: [3284, 3278, 3158], added: [7517, 0], even: 7795 },
  { a: [9998], b: [5676, 5584, 3284, 3278], added: [10016, 0], even: 2194 },
  { a: [9998], b: [5584, 3158, 2931], added: [8211, 0], even: 6536 },
  { a: [5676], b: [3278, 3284], added: [3836, 0] },
  { a: [3278, 2931], b: [3284], added: [0, 0], even: 2924 },
  { a: [9998, 3147], b: [5676, 5584], added: [4806, 0], even: 6692 },
];

test("addedValues matches KTC's trade calculator's value adjustment", () => {
  for (const { a, b, added } of ktc) {
    const [x, y] = addedValues(a, b);
    // To within KTC's rounding of each piece.
    assert.ok(Math.abs(x - added[0]) <= 3 && Math.abs(y - added[1]) <= 3, `${a} for ${b}: ${x}, ${y} — KTC ${added}`);
  }
  // The same trade the other way round.
  assert.deepEqual(addedValues([5676, 3284], [9998]), addedValues([9998], [5676, 3284]).reverse());
});

test("evenValue is the player KTC says would even the trade", () => {
  for (const { a, b, even } of ktc) {
    if (even === undefined) continue;
    const top = Math.max(...a, ...b);
    const raw = (vs: number[]) => vs.reduce((t, v) => t + processedValue(v, top), 0);
    assert.equal(evenValue(Math.abs(raw(a) - raw(b)), top), even, `${a} for ${b}`);
  }
});

test("tradeGaps is how far apart the sides are now, and the farthest they've been and when", () => {
  const side = (rosterId: number, values: number[]) =>
    ({ rosterId, path: values.map((value, i) => ({ day: 1000 + 7 * i, value })) }) as TradeSide;
  const { then, gap, widest } = tradeGaps([side(1, [5000, 7000, 6000, 5200]), side(2, [5000, 4000, 6500, 6000])]);
  assert.deepEqual(then, { gap: 0, ahead: null });
  assert.deepEqual(gap, { gap: 800, ahead: 2 });
  assert.deepEqual(widest, { gap: 3000, ahead: 1, day: 1007 });
  // Level all along: no gap, nobody ahead.
  assert.deepEqual(tradeGaps([side(1, [10, 10]), side(2, [10, 10])]), { then: { gap: 0, ahead: null }, gap: { gap: 0, ahead: null }, widest: { gap: 0, ahead: null, day: 1000 } });
});

test("filterTrades finds trades by season and team slot, in the order picked", () => {
  const asset = (label: string, became?: string) => ({ label, position: null, became: became ? { name: became, position: null, drafted: null, now: null } : undefined, then: null, thenEstimated: false, now: null, nowEstimated: false, path: [] });
  const trade = (id: string, at: number, season: string, gap: number, widest: number, sides: [number, string, boolean, string[]][]) =>
    ({
      id,
      at,
      season,
      sides: sides.map(([rosterId, team, mine, got]) => ({ rosterId, team, mine, got: got.map((g) => (g.includes(">") ? asset(g.split(">")[0], g.split(">")[1]) : asset(g))), faab: 0, then: 1000 * got.length, now: 0, added: 0, path: [] })),
      then: { gap: 0, ahead: null },
      gap: { gap, ahead: 1 },
      widest: { gap: widest, ahead: 1, day: 0 },
    }) as AnalyzedTrade;
  const trades = [
    trade("a", 1, "2024", 500, 3000, [[1, "Alpha", true, ["Ja'Marr Chase"]], [2, "Beta", false, ["2025 1st>Jahmyr Gibbs", "Travis Kelce"]]]),
    trade("b", 3, "2025", 2000, 2500, [[3, "Gamma", false, ["Josh Allen"]], [2, "Beta", false, ["Patrick Mahomes"]]]),
    // Slot 3 under the name it had that season.
    trade("c", 2, "2025", 100, 900, [[1, "Alpha", true, ["2026 1st"]], [3, "Old Gamma", false, ["CeeDee Lamb"]]]),
  ];
  const all = { season: null, team: null, sort: "newest" } as const;
  const ids = (f: Partial<Parameters<typeof filterTrades>[1]>) => filterTrades(trades, { ...all, ...f }).map((t) => t.id);
  assert.deepEqual(ids({}), ["b", "c", "a"]);
  assert.deepEqual(ids({ season: "2025" }), ["b", "c"]);
  assert.deepEqual(ids({ team: MY_TRADES }), ["c", "a"]);
  assert.deepEqual(ids({ team: 2 }), ["b", "a"]);
  // Whatever the slot was called at the time.
  assert.deepEqual(ids({ team: 3 }), ["b", "c"]);
  assert.deepEqual(ids({ sort: "gap" }), ["b", "a", "c"]);
  assert.deepEqual(ids({ sort: "widest" }), ["a", "b", "c"]);
  assert.deepEqual(ids({ sort: "closest" }), ["c", "a", "b"]);
  assert.deepEqual(ids({ sort: "oldest" }), ["a", "c", "b"]);
  assert.deepEqual(ids({ sort: "pieces" }), ["a", "b", "c"]);
});

test("a side's totals add up each piece at its whole grade, as shown", () => {
  const odd: ValueHistory = { ...history, players: { ...history.players, "1": { ...history.players["1"], sf: [8050, 8199, 8401, 8699] } } };
  const twoForOne: SleeperTransaction = { ...trade, adds: { s1: 1, s4: 2 }, drops: { s1: 2, s4: 1 }, draft_picks: [{ ...trade.draft_picks![0], owner_id: 2, previous_owner_id: 1 }], waiver_budget: [] };
  const bySleeper = new Map(bySleeperId).set("s1", odd.players["1"]);
  const [t] = analyzeTrades([{ ...seasons[0], trades: [twoForOne] }], drafts, odd, bySleeper, players, true, 1021 * DAY_MS);
  const [alpha] = t.sides;
  assert.deepEqual([alpha.then, alpha.now], [8000, 8600]);
  assert.equal(alpha.added % 100, 0);
  assert.deepEqual(alpha.path.map((p) => p.value - alpha.added), [8100, 8400, 8600]);
  // The piece itself keeps its exact values.
  assert.deepEqual(alpha.got[0].path.map((p) => p.value), [8199, 8401, 8699]);
});

test("analyzeTrades reads a pick KTC no longer lists off a later year's same pick, as long before its draft", () => {
  const day = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
  const from = day(2024, 1, 1);
  const today = day(2026, 10, 21);
  const count = Math.floor((today - from) / 7) + 1;
  // KTC's 2027 1st from June 2025 on, its 2028 1st from January 2026 on; the 2026 1st, drafted, gone.
  const since = (start: number, value: number) => Array.from({ length: count }, (_, i) => (from + 7 * i >= start ? value : null));
  const picks: ValueHistory = {
    updatedAt: null,
    from,
    step: 7,
    players: {
      a: { n: "2027 Mid 1st", p: "RDP", t: null, sf: since(day(2025, 6, 1), 6000), q: since(day(2025, 6, 1), 6000) },
      b: { n: "2028 Mid 1st", p: "RDP", t: null, sf: since(day(2026, 1, 1), 5000), q: since(day(2026, 1, 1), 5000) },
    },
  };
  // A 2026 1st traded in February 2024.
  const pickTrade: SleeperTransaction = { ...trade, created: day(2024, 2, 15) * DAY_MS, adds: null, waiver_budget: [], draft_picks: [{ season: "2026", round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }] };
  const [t] = analyzeTrades([{ ...seasons[0], trades: [pickTrade] }], new Map(), picks, new Map(), new Map(), true, today * DAY_MS);
  const [pick] = t.sides[0].got;
  // February 2024: the 2027 1st had no value a year on (February 2025), so the 2028 1st's in February 2026.
  assert.equal(pick.then, 5000);
  assert.equal(pick.thenEstimated, true);
  // From the summer of 2024 on, the 2027 1st's a year on.
  const summer = pick.path.find((p) => p.day >= day(2024, 7, 1))!;
  assert.deepEqual([summer.value, summer.estimated], [6000, true]);
});

test("nflDraftDay is the last day of each April's NFL draft", () => {
  const day = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
  assert.deepEqual(["2023", "2024", "2025", "2026"].map(nflDraftDay), [day(2023, 4, 29), day(2024, 4, 27), day(2025, 4, 26), day(2026, 4, 25)]);
});

test("analyzeTrades turns a drafted pick into whoever it became at the NFL draft, ahead of a later league draft", () => {
  const day = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
  const from = day(2026, 1, 1);
  const today = day(2026, 10, 21);
  const count = Math.floor((today - from) / 7) + 1;
  const between = (start: number, end: number, value: (i: number) => number) =>
    Array.from({ length: count }, (_, i) => (from + 7 * i >= start && from + 7 * i <= end ? value(i) : null));
  const picks: ValueHistory = {
    updatedAt: null,
    from,
    step: 7,
    players: {
      // KTC's 2026 1st through its NFL draft at the start of May; the 2027 1st, worth more, all along.
      own: { n: "2026 Mid 1st", p: "RDP", t: null, sf: between(from, day(2026, 5, 1), (i) => 4800 - 10 * i), q: between(from, day(2026, 5, 1), () => 4000) },
      next: { n: "2027 Mid 1st", p: "RDP", t: null, sf: between(from, today, () => 5600), q: between(from, today, () => 4600) },
      rookie: { n: "Rookie Back", p: "RB", t: "NYJ", sf: between(day(2026, 4, 25), today, () => 6200), q: between(day(2026, 4, 25), today, () => 5200) },
    },
  };
  const pickTrade: SleeperTransaction = { ...trade, created: day(2026, 2, 1) * DAY_MS, adds: null, waiver_budget: [], draft_picks: [{ season: "2026", round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }] };
  // The league's rookie draft in August.
  const august = new Map<string, DraftResult[]>([["2026", [{ at: day(2026, 8, 15) * DAY_MS, players: new Map([["1-2", "r"]]) }]]]);
  const [t] = analyzeTrades([{ ...seasons[0], trades: [pickTrade] }], august, picks, new Map([["r", picks.players.rookie]]), new Map([["r", { name: "Rookie Back", position: "RB" }]]), true, today * DAY_MS);
  const path = t.sides[0].got[0].path;
  // The 2026 NFL draft ran April 23 to 25: the pick, its own values, up to then; the player from then on — no
  // stretch read off the pricier 2027 1st.
  assert.equal(nflDraftDay("2026"), day(2026, 4, 25));
  for (const p of path.filter((p) => p.day < day(2026, 4, 25))) assert.equal(p.value, valueOn(picks, picks.players.own, true, p.day));
  for (const p of path.filter((p) => p.day >= day(2026, 4, 25))) assert.equal(p.value, 6200);
});
