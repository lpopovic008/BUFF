import test from "node:test";
import assert from "node:assert/strict";
import { afterTrade, futurePicks, MonitorPlayer, MonitorTeam, playoffPicture, positionalNeeds, sellCandidates, startersByPosition, tradePartners, tradeTargets, weighTrade } from "./trade-monitor";

const team = (rosterId: number, wins: number, losses: number, players: string[] = []): MonitorTeam => ({
  rosterId,
  name: `T${rosterId}`,
  mine: rosterId === 1,
  wins,
  losses,
  ties: 0,
  pointsFor: 0,
  rank: 0,
  players,
});
const ranked = (teams: MonitorTeam[]) => teams.map((t, i) => ({ ...t, rank: i + 1 }));
const player = (id: string, over: Partial<MonitorPlayer>): MonitorPlayer => ({
  id,
  name: id,
  position: "WR",
  team: null,
  age: 25,
  value: 3000,
  valueRank: 30,
  trend: 0,
  seasonRank: 30,
  ppg: 10,
  ...over,
});

test("playoffPicture puts each team against the line, buying or selling", () => {
  // Four make it; four games left.
  const teams = ranked([team(1, 10, 1), team(2, 8, 3), team(3, 6, 5), team(4, 6, 5), team(5, 5, 6), team(6, 3, 8), team(7, 1, 10)]);
  const picture = new Map(playoffPicture(teams, 4, 4).map((s) => [s.rosterId, s]));
  // Five games clear of the first team out, with four left.
  assert.equal(picture.get(1)!.status, "clinched");
  assert.equal(picture.get(1)!.mode, "buying");
  assert.equal(picture.get(2)!.status, "in");
  assert.equal(picture.get(4)!.status, "bubble");
  assert.equal(picture.get(5)!.status, "bubble");
  assert.equal(picture.get(5)!.mode, "either");
  assert.equal(picture.get(6)!.status, "out");
  assert.equal(picture.get(6)!.mode, "selling");
  // Five behind with four left.
  assert.equal(picture.get(7)!.status, "eliminated");
});

test("startersByPosition counts a team's slots and its share of the flex spots", () => {
  assert.deepEqual(startersByPosition(["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX", "SUPER_FLEX", "BN"]), { QB: 2, RB: 3, WR: 4, TE: 1 });
});

test("positionalNeeds ranks each team's starters at a position, needs the bottom third, surplus the top", () => {
  const players = new Map<string, MonitorPlayer>();
  const add = (id: string, position: string, value: number) => players.set(id, player(id, { position, value }));
  // Team 1 deep at RB, thin at WR; team 3 the other way round.
  for (const [id, pos, v] of [["a", "RB", 8000], ["b", "RB", 7000], ["c", "WR", 1000], ["d", "RB", 4000], ["e", "WR", 4000], ["f", "RB", 1000], ["g", "WR", 9000]] as const) add(id, pos, v);
  const teams = ranked([team(1, 0, 0, ["a", "b", "c"]), team(2, 0, 0, ["d", "e"]), team(3, 0, 0, ["f", "g"])]);
  const needs = positionalNeeds(teams, players, { QB: 1, RB: 1, WR: 1, TE: 1 });
  const mine = needs[0];
  assert.equal(mine.positions.RB.rank, 1);
  assert.equal(mine.positions.WR.rank, 3);
  assert.deepEqual(mine.needs.includes("WR"), true);
  assert.deepEqual(mine.surplus.includes("RB"), true);
  assert.ok(mine.positions.RB.vsMedian > 0);
  // Team 3 has the WRs you need and needs the RBs you have.
  assert.deepEqual(tradePartners(mine, needs.slice(1)).map((p) => p.rosterId), [3]);
});

test("sellCandidates flags age, falling value and production under value", () => {
  const list = sellCandidates([
    player("old", { position: "RB", age: 27.4, value: 4000 }),
    player("falling", { trend: -0.25, value: 5000 }),
    player("benched", { valueRank: 10, seasonRank: 40, value: 6000 }),
    player("fine", { value: 5000 }),
    player("cheap", { position: "RB", age: 29, value: 900 }),
  ]);
  assert.deepEqual(list.map((c) => c.player.id).sort(), ["benched", "falling", "old"]);
  assert.match(list.find((c) => c.player.id === "old")!.reasons[0].text, /Age 27/);
});

test("tradeTargets finds young stars and breakouts on other rosters, your needs first", () => {
  const { stars, breakouts } = tradeTargets(
    [
      {
        rosterId: 2,
        players: [
          player("star", { position: "RB", age: 22, valueRank: 3, value: 9000 }),
          player("old star", { position: "RB", age: 28, valueRank: 2, value: 9000 }),
          player("riser", { age: 23, valueRank: 40, trend: 0.3 }),
          player("producer", { position: "TE", age: 24, valueRank: 20, seasonRank: 5 }),
          player("nothing", { age: 23 }),
          player("long shot", { age: 22, valueRank: 120, trend: 0.9, value: 400 }),
        ],
      },
    ],
    ["TE"]
  );
  assert.deepEqual(stars.map((t) => t.player.id), ["star"]);
  assert.deepEqual(breakouts.map((t) => t.player.id), ["producer", "riser"]);
  assert.ok(breakouts[0].reasons.some((r) => /TE need/.test(r.text)));
});

test("futurePicks gives each team its own picks, save those traded away", () => {
  const picks = futurePicks([1, 2], [2027, 2028], 2, [{ season: "2027", round: 1, roster_id: 2, owner_id: 1 }], (season, round) => (round === 1 ? 5000 : 2000) - (season - 2027) * 100);
  assert.equal(picks.length, 8);
  const held = (rosterId: number) => picks.filter((p) => p.rosterId === rosterId).map((p) => p.id).sort();
  // Team 1 has team 2's 2027 1st too; team 2 doesn't.
  assert.ok(held(1).includes("pick:2027-1-2"));
  assert.equal(held(1).length, 5);
  assert.equal(held(2).length, 3);
  assert.equal(picks.find((p) => p.id === "pick:2028-1-1")!.value, 4900);
});

test("weighTrade adds KTC's value for the fewer, better pieces and calls it fair when close", () => {
  // One star for three pieces adding up to more: the star's side is due the difference and then some.
  const star = weighTrade([9000], [4000, 3000, 2500]);
  assert.ok(star.give.added > 0);
  assert.equal(star.get.added, 0);
  assert.equal(star.margin, star.get.total - star.give.total);
  // Even swaps are fair; lopsided ones aren't.
  assert.equal(weighTrade([5000], [5100]).fair, true);
  assert.equal(weighTrade([5000], [7000]).fair, false);
  assert.ok(weighTrade([5000], [7000]).margin > 0);
});

test("afterTrade moves the pieces between the two rosters only", () => {
  const teams = [team(1, 0, 0, ["a", "b"]), team(2, 0, 0, ["c"]), team(3, 0, 0, ["d"])];
  const after = afterTrade(teams, 1, 2, ["a"], ["c"]);
  assert.deepEqual(after.map((t) => t.players), [["b", "c"], ["a"], ["d"]]);
});
