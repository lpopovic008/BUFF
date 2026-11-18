import test from "node:test";
import assert from "node:assert/strict";
import { topFacing } from "./auto-graphs";
import type { GameStarters, GroupedStarter } from "./my-starters";
import type { NFLGame } from "./nfl-schedule";

const game = (id: string) => ({ id }) as NFLGame;
const player = (playerId: string, points: number | null, side: GroupedStarter["side"], projected: number | null = null): GroupedStarter => ({
  playerId,
  name: playerId,
  position: "WR",
  team: null,
  leagueIds: [],
  points,
  pointsByLeague: {},
  side,
  projected,
});

test("your matchups' top scorers in the window's games: yours and those you face, no one else, each once", () => {
  const listed: GameStarters[] = [
    { game: game("a"), players: [], everyone: [player("me1", 12, "mine"), player("them1", 20, "opponent"), player("rando", 40, "other"), player("both1", 8, "both")] },
    { game: game("b"), players: [], everyone: [player("me2", 15, "mine"), player("them2", 3, "opponent")] },
    // Another window's game: not counted.
    { game: game("c"), players: [], everyone: [player("later", 99, "mine")] },
  ];
  assert.deepEqual(topFacing(listed, new Set(["a", "b"]), 4), [
    { playerId: "them1", gameId: "a" },
    { playerId: "me2", gameId: "b" },
    { playerId: "me1", gameId: "a" },
    { playerId: "both1", gameId: "a" },
  ]);
});

test("as they kick off, nobody's scored: by projection", () => {
  const listed: GameStarters[] = [
    { game: game("a"), players: [], everyone: [player("low", 0, "mine", 6), player("high", 0, "opponent", 21), player("none", null, "mine"), player("mid", 0, "mine", 14)] },
  ];
  assert.deepEqual(
    topFacing(listed, new Set(["a"]), 2).map((p) => p.playerId),
    ["high", "mid"]
  );
  // None in your matchups there: none.
  assert.deepEqual(topFacing(listed, new Set(["z"]), 4), []);
});
