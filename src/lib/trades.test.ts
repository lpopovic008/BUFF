import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTrades, DraftResult, pickTrends, TradeSeason } from "./trades";
import { DAY_MS, ValueHistory, ValueSeries } from "./value-history";
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
  },
};
const bySleeperId = new Map<string, ValueSeries>([
  ["s1", history.players["1"]],
  ["s3", history.players["3"]],
]);
const players = new Map([
  ["s1", { name: "Star Back", position: "RB" }],
  ["s3", { name: "Rookie Wideout", position: "WR" }],
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
  // Week by week from the trade: the pick, then the rookie from the draft on.
  assert.deepEqual(alpha.path.map((p) => p.value), [5100, 6000, 6500]);
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
});

test("analyzeTrades finds a pick in whichever of its season's drafts has it, past an empty one", () => {
  const withEmpty = new Map<string, DraftResult[]>([["2025", [{ at: 1018 * DAY_MS, players: new Map() }, ...drafts.get("2025")!]]]);
  const [t] = analyzeTrades(seasons, withEmpty, history, bySleeperId, players, true, 1021 * DAY_MS);
  assert.equal(t.sides[0].got[0].became?.name, "Rookie Wideout");
});
