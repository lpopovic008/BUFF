import test from "node:test";
import assert from "node:assert/strict";
import { FeedCandidate, GamePlay } from "./play-by-play";
import { formatPlayPoints, pprPointsForPlay } from "./play-points";

function play(text: string, over: Partial<GamePlay> = {}): GamePlay {
  return { id: "1", gameId: "g", sequence: 1, text, type: "", period: 1, clock: "", offense: "BUF", scoring: false, turnover: false, yards: 0, redZone: false, at: null, ...over };
}
const who = (name: string, position = "WR", team = "BUF"): FeedCandidate => ({ playerId: name, name, position, team });
const allen = who("Josh Allen", "QB");
const coleman = who("Keon Coleman");
const cook = who("James Cook", "RB");
const bass = who("Tyler Bass", "K");
const bufDef = who("Buffalo Bills", "DEF");

test("a completion: yards for the passer, a catch plus yards for the receiver", () => {
  const p = play("J.Allen pass short right to K.Coleman to BUF 40 for 8 yards (J.Ramsey).");
  assert.equal(pprPointsForPlay(p, allen), 0.32);
  assert.equal(pprPointsForPlay(p, coleman), 1.8);
});

test("a touchdown pass: 4 for the passer, 6 for the receiver, 1 for the extra point", () => {
  const p = play("J.Allen pass deep middle to K.Coleman for 28 yards, TOUCHDOWN. T.Bass extra point is GOOD, Center-R.Ferguson, Holder-S.Martin.", { scoring: true });
  assert.equal(pprPointsForPlay(p, allen), 5.12);
  assert.equal(pprPointsForPlay(p, coleman), 1 + 2.8 + 6);
  assert.equal(pprPointsForPlay(p, bass), 1);
});

test("runs, scrambles and losses", () => {
  assert.equal(pprPointsForPlay(play("J.Cook left end to MIA 4 for 12 yards (X.McKinney)."), cook), 1.2);
  assert.equal(pprPointsForPlay(play("J.Allen scrambles right end to MIA 45 for 21 yards (Z.Sieler)."), allen), 2.1);
  assert.equal(pprPointsForPlay(play("J.Cook up the middle to BUF 22 for -3 yards (Z.Sieler)."), cook), -0.3);
  assert.equal(pprPointsForPlay(play("J.Cook right guard for 3 yards, TOUCHDOWN."), cook), 6.3);
  assert.equal(pprPointsForPlay(play("J.Cook up the middle to BUF 30 for no gain (Z.Sieler)."), cook), 0);
});

test("incompletions, interceptions, sacks and lost fumbles", () => {
  assert.equal(pprPointsForPlay(play("J.Allen pass incomplete deep left to K.Coleman (J.Ramsey)."), allen), 0);
  assert.equal(pprPointsForPlay(play("J.Allen pass incomplete deep left to K.Coleman (J.Ramsey)."), coleman), 0);
  const pick = play("J.Allen pass deep right intended for K.Coleman INTERCEPTED by J.Ramsey at MIA 30. J.Ramsey to MIA 41 for 11 yards.", { turnover: true });
  assert.equal(pprPointsForPlay(pick, allen), -1);
  assert.equal(pprPointsForPlay(pick, coleman), 0);
  assert.equal(pprPointsForPlay(play("J.Allen sacked at BUF 22 for -8 yards (Z.Sieler)."), allen), 0);
  const fumble = play("J.Cook up the middle to BUF 30 for 2 yards, FUMBLES (Z.Sieler), RECOVERED by MIA-J.Phillips at BUF 30.", { turnover: true });
  assert.equal(pprPointsForPlay(fumble, cook), 0.2 - 2);
  const strip = play("J.Allen sacked at BUF 20 for -6 yards (Z.Sieler). FUMBLES (Z.Sieler), RECOVERED by MIA-J.Phillips at BUF 18.", { turnover: true });
  assert.equal(pprPointsForPlay(strip, allen), -2);
  const catchFumble = play("J.Allen pass short left to K.Coleman to BUF 35 for 5 yards (J.Ramsey). FUMBLES (J.Ramsey), RECOVERED by MIA-J.Ramsey.", { turnover: true });
  assert.equal(pprPointsForPlay(catchFumble, coleman), 1.5 - 2);
  assert.equal(pprPointsForPlay(catchFumble, allen), 0.2);
});

test("field goals score by distance; misses cost a point", () => {
  assert.equal(pprPointsForPlay(play("T.Bass 38 yard field goal is GOOD, Center-R.Ferguson."), bass), 3);
  assert.equal(pprPointsForPlay(play("T.Bass 47 yard field goal is GOOD, Center-R.Ferguson."), bass), 4);
  assert.equal(pprPointsForPlay(play("T.Bass 54 yard field goal is GOOD, Center-R.Ferguson."), bass), 5);
  assert.equal(pprPointsForPlay(play("T.Bass 52 yard field goal is No Good, Wide Right, Center-R.Ferguson."), bass), -1);
});

test("a two-point try counts for whoever threw, caught or ran it", () => {
  const p = play("J.Allen pass short left to K.Coleman for 5 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. J.Allen pass to J.Cook is complete. ATTEMPT SUCCEEDS.", { scoring: true });
  assert.equal(pprPointsForPlay(p, allen), 0.2 + 4 + 2);
  assert.equal(pprPointsForPlay(p, cook), 2);
  const run = play("J.Cook right end for 2 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. J.Cook rushes up the middle. ATTEMPT SUCCEEDS.", { scoring: true });
  assert.equal(pprPointsForPlay(run, cook), 0.2 + 6 + 2);
});

test("a play wiped out by a penalty is worth nothing", () => {
  assert.equal(pprPointsForPlay(play("J.Allen pass short right to K.Coleman for 30 yards. PENALTY on BUF-D.Dawkins, Offensive Holding, 10 yards, enforced at BUF 30 - No Play."), coleman), 0);
});

test("a defense scores sacks, takeaways, and touchdowns on them", () => {
  const def = (text: string, turnover = false) => pprPointsForPlay(play(text, { offense: "MIA", turnover }), bufDef);
  assert.equal(def("T.Tagovailoa sacked at MIA 22 for -8 yards (G.Rousseau)."), 1);
  assert.equal(def("T.Tagovailoa pass deep right intended for T.Hill INTERCEPTED by T.Bernard at BUF 30. T.Bernard to BUF 41 for 11 yards.", true), 2);
  assert.equal(def("T.Tagovailoa pass short left intended for T.Hill INTERCEPTED by T.Bernard at MIA 30. T.Bernard for 30 yards, TOUCHDOWN.", true), 8);
  assert.equal(def("D.Achane up the middle for 2 yards, FUMBLES (E.Oliver), RECOVERED by BUF-M.Milano.", true), 2);
});

test("formatPlayPoints signs and trims", () => {
  assert.equal(formatPlayPoints(5.12), "+5.12");
  assert.equal(formatPlayPoints(10), "+10");
  assert.equal(formatPlayPoints(-2), "-2");
  assert.equal(formatPlayPoints(-0.3), "-0.3");
  assert.equal(formatPlayPoints(0), "0");
});
