import test from "node:test";
import assert from "node:assert/strict";
import { cleanPlayText, downAndDistance, FeedCandidate, GamePlay, isBigPlay, parseSummaryPlays, playersInPlay, playTextNamePattern } from "./play-by-play";

function play(over: Partial<GamePlay>): GamePlay {
  return {
    id: "1",
    gameId: "g",
    sequence: 1,
    text: "",
    type: "Rush",
    period: 1,
    clock: "10:00",
    offense: "PIT",
    scoring: false,
    turnover: false,
    yards: 0,
    redZone: false,
    downDistance: null,
    at: null,
    ...over,
  };
}

const rodgers: FeedCandidate = { playerId: "96", name: "Aaron Rodgers", position: "QB", team: "PIT" };
const metcalf: FeedCandidate = { playerId: "5846", name: "DK Metcalf", position: "WR", team: "PIT" };
const warren: FeedCandidate = { playerId: "8228", name: "Jaylen Warren", position: "RB", team: "PIT" };
const boswell: FeedCandidate = { playerId: "1945", name: "Chris Boswell", position: "K", team: "PIT" };
const cleDef: FeedCandidate = { playerId: "CLE", name: "Cleveland Browns", position: "DEF", team: "CLE" };

test("cleanPlayText drops the formation note", () => {
  assert.equal(cleanPlayText("(Shotgun) A.Rodgers pass short left to D.Washington"), "A.Rodgers pass short left to D.Washington");
  assert.equal(cleanPlayText("(No Huddle, Shotgun) J.Warren up the middle"), "J.Warren up the middle");
  assert.equal(cleanPlayText("J.Warren up the middle"), "J.Warren up the middle");
});

test("playTextNamePattern follows ESPN's shorthand", () => {
  assert.ok(playTextNamePattern("Amon-Ra St. Brown")!.test("J.Goff pass short right to A.St. Brown for 9 yards"));
  assert.ok(playTextNamePattern("Kenneth Walker III")!.test("K.Walker left end for 4 yards"));
  assert.ok(playTextNamePattern("Josh Allen")!.test("Jos.Allen pass deep left to K.Coleman"));
  assert.ok(playTextNamePattern("DK Metcalf")!.test("PENALTY on PIT-D.Metcalf, Taunting"));
  assert.ok(!playTextNamePattern("Josh Allen")!.test("D.Allensworth up the middle"));
  assert.ok(!playTextNamePattern("Aaron Rodgers")!.test("B.Rodgersen pass"));
  assert.equal(playTextNamePattern("Cher"), null);
});

test("playersInPlay finds the passer and the receiver, not the tacklers", () => {
  const p = play({ text: "A.Rodgers pass short middle to D.Metcalf to 50 for 7 yards (G.Delpit; C.Schwesinger)." });
  assert.deepEqual(playersInPlay(p, [rodgers, metcalf, warren]).map((c) => c.playerId), ["96", "5846"]);
});

test("playersInPlay ignores a same-named player on the team without the ball", () => {
  const otherWarren: FeedCandidate = { ...warren, playerId: "x", team: "CLE" };
  const p = play({ text: "J.Warren right guard to PIT 40 for no gain (Q.Williams)." });
  assert.deepEqual(playersInPlay(p, [otherWarren, warren]).map((c) => c.playerId), ["8228"]);
});

test("playersInPlay finds a kicker on the extra point of a touchdown", () => {
  const p = play({
    text: "A.Rodgers pass short middle to R.Wilson for 12 yards, TOUCHDOWN. C.Boswell extra point is GOOD, Center-C.Kuntz, Holder-C.Johnston.",
    scoring: true,
  });
  assert.deepEqual(playersInPlay(p, [boswell, rodgers]).map((c) => c.playerId), ["1945", "96"]);
});

test("playersInPlay credits a defense with the other side's sacks and takeaways only", () => {
  const sack = play({ type: "Sack", text: "A.Rodgers sacked at CLV 44 for -7 yards (M.Collins)." });
  assert.deepEqual(playersInPlay(sack, [cleDef]).map((c) => c.playerId), ["CLE"]);
  const run = play({ text: "J.Warren left guard to CLV 11 for 9 yards (T.Campbell)." });
  assert.deepEqual(playersInPlay(run, [cleDef]), []);
  const theirOwnSack = play({ type: "Sack", offense: "CLE", text: "D.Watson sacked at CLV 20 for -5 yards (T.Watt)." });
  assert.deepEqual(playersInPlay(theirOwnSack, [cleDef]), []);
});

test("isBigPlay flags scores, takeaways, long gains and red-zone snaps", () => {
  assert.equal(isBigPlay(play({ yards: 6 })), false);
  assert.equal(isBigPlay(play({ yards: 21 })), true);
  assert.equal(isBigPlay(play({ scoring: true })), true);
  assert.equal(isBigPlay(play({ turnover: true })), true);
  assert.equal(isBigPlay(play({ redZone: true })), true);
});

test("parseSummaryPlays reads drives in game order, with the offense from each drive", () => {
  const plays = parseSummaryPlays("401872964", {
    drives: {
      previous: [
        {
          team: { abbreviation: "WSH" },
          plays: [
            {
              id: "2",
              sequenceNumber: "7400",
              type: { text: "Pass Reception" },
              text: "(Shotgun) J.Daniels pass deep left to T.McLaurin to NYG 44 for 21 yards (J.Brisker).",
              period: { number: 1 },
              clock: { displayValue: "2:59" },
              scoringPlay: false,
              statYardage: 21,
              start: { down: 1, distance: 10, yardsToEndzone: 65, shortDownDistanceText: "1st & 10" },
              wallclock: "2026-10-02T00:44:14Z",
            },
            { id: "3", sequenceNumber: "7500", type: { text: "Official Timeout" }, text: "Official Timeout at 02:59." },
          ],
        },
      ],
      current: {
        team: { abbreviation: "NYG" },
        plays: [
          {
            id: "4",
            sequenceNumber: "9000",
            type: { text: "Rushing Touchdown" },
            text: "C.Skattebo up the middle for 3 yards, TOUCHDOWN.",
            period: { number: 2 },
            clock: { displayValue: "0:40" },
            scoringPlay: true,
            statYardage: 3,
            start: { down: 2, distance: 3, yardsToEndzone: 3 },
          },
        ],
      },
    },
  });
  assert.equal(plays.length, 2);
  assert.deepEqual(
    plays.map((p) => [p.id, p.offense, p.text.split(" ")[0], p.redZone, p.scoring, p.yards, p.period, p.clock]),
    [
      ["2", "WAS", "J.Daniels", false, false, 21, 1, "2:59"],
      ["4", "NYG", "C.Skattebo", true, true, 3, 2, "0:40"],
    ]
  );
  assert.deepEqual(plays.map((p) => p.downDistance), ["1st & 10", "2nd & Goal"]);
  assert.equal(plays[0].at, Date.parse("2026-10-02T00:44:14Z"));
  assert.equal(plays[1].at, null);
});

test("parseSummaryPlays tolerates a summary with no drives", () => {
  assert.deepEqual(parseSummaryPlays("g", { boxscore: {} }), []);
  assert.deepEqual(parseSummaryPlays("g", null), []);
});

test("downAndDistance spells the down, or Goal when the line to gain is the goal line", () => {
  assert.equal(downAndDistance(3, 4, 40), "3rd & 4");
  assert.equal(downAndDistance(1, 4, 4), "1st & Goal");
  assert.equal(downAndDistance(0, 0, 65), null);
});
