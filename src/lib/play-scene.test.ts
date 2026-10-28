import test from "node:test";
import assert from "node:assert/strict";
import { GamePlay } from "./play-by-play";
import { actorAt, ballAt, sceneFor, stageFor } from "./play-scene";

function play(text: string, over: Partial<GamePlay> = {}): GamePlay {
  return {
    id: "1",
    gameId: "g",
    sequence: 1,
    text,
    type: "",
    period: 2,
    clock: "5:00",
    offense: "KC",
    scoring: false,
    turnover: false,
    yards: 0,
    redZone: false,
    downDistance: null,
    at: null,
    ...over,
  };
}
const teams: [string, string] = ["BUF", "KC"];

test("a completed pass: who threw it to whom, how far, which side, and who made the tackle", () => {
  const s = sceneFor(play("P.Mahomes pass short right to T.Kelce to BUF 35 for 12 yards (T.Bernard).", { yards: 12 }), teams)!;
  assert.equal(s.kind, "pass");
  assert.equal(s.passer, "P.Mahomes");
  assert.equal(s.target, "T.Kelce");
  assert.equal(s.defender, "T.Bernard");
  assert.equal(s.yards, 12);
  assert.equal(s.lane, 1);
  assert.ok(s.air > 0 && s.air <= 12);
  assert.equal(s.offense, "KC");
  assert.equal(s.defense, "BUF");
  assert.equal(s.touchdown, false);
});

test("a touchdown catch has no tackler; the scoreboard's shorthand reads too", () => {
  const s = sceneFor(play("J.Allen pass deep middle to D.Kincaid for 28 yards, TOUCHDOWN. T.Bass extra point is GOOD.", { offense: "BUF", yards: 28 }), teams)!;
  assert.equal(s.kind, "pass");
  assert.equal(s.touchdown, true);
  assert.equal(s.defender, null);
  assert.ok(s.air >= 15);
  const short = sceneFor(play("J.Waddle 20 yard pass from T.Tagovailoa (J.Sanders kick)", { offense: "BUF" }), teams)!;
  assert.equal(short.kind, "pass");
  assert.equal(short.target, "J.Waddle");
  assert.equal(short.passer, "T.Tagovailoa");
  assert.equal(short.yards, 20);
});

test("runs, scrambles, sacks, picks, incompletions and kicks", () => {
  const run = sceneFor(play("J.Cook left end to KC 40 for 5 yards (N.Bolton).", { offense: "BUF", yards: 5 }), teams)!;
  assert.deepEqual([run.kind, run.runner, run.defender, run.lane, run.yards], ["run", "J.Cook", "N.Bolton", -1, 5]);
  const scramble = sceneFor(play("J.Allen scrambles right end to KC 30 for 9 yards (C.Jones).", { offense: "BUF", yards: 9 }), teams)!;
  assert.equal(scramble.scramble, true);
  const sack = sceneFor(play("P.Mahomes sacked at KC 30 for -7 yards (G.Rousseau).", { yards: -7 }), teams)!;
  assert.deepEqual([sack.kind, sack.passer, sack.defender, sack.yards], ["sack", "P.Mahomes", "G.Rousseau", -7]);
  const pick = sceneFor(play("P.Mahomes pass deep left intended for X.Worthy INTERCEPTED by T.Bernard at BUF 20. T.Bernard to BUF 30 for 10 yards (X.Worthy)."), teams)!;
  assert.deepEqual([pick.kind, pick.target, pick.defender, pick.yards, pick.lane], ["interception", "X.Worthy", "T.Bernard", 10, -1]);
  const inc = sceneFor(play("P.Mahomes pass incomplete short left to T.Kelce (T.Johnson)."), teams)!;
  assert.deepEqual([inc.kind, inc.target, inc.defender], ["incomplete", "T.Kelce", "T.Johnson"]);
  const fg = sceneFor(play("H.Butker 45 yard field goal is GOOD, Center-J.Winchester, Holder-M.Araiza."), teams)!;
  assert.deepEqual([fg.kind, fg.kicker, fg.yards, fg.good], ["fieldGoal", "H.Butker", 45, true]);
  const miss = sceneFor(play("H.Butker 52 yard field goal is No Good, Wide Right, Center-J.Winchester."), teams)!;
  assert.equal(miss.good, false);
  const punt = sceneFor(play("M.Araiza punts 48 yards to BUF 20, Center-J.Winchester. K.Coleman to BUF 32 for 12 yards (J.Watson)."), teams)!;
  assert.deepEqual([punt.kind, punt.kicker, punt.yards, punt.returner, punt.air, punt.defender], ["punt", "M.Araiza", 48, "K.Coleman", 12, "J.Watson"]);
  const kick = sceneFor(play("T.Bass kicks 65 yards from BUF 35 to end zone, Touchback."), teams)!;
  assert.deepEqual([kick.kind, kick.returner], ["kickoff", null]);
});

test("nothing to act out for a penalty with no play", () => {
  assert.equal(sceneFor(play("PENALTY on KC-J.Smith, False Start, 5 yards, enforced at KC 30 - No Play."), teams), null);
});

test("a play's staged centered on the field: it starts left of the middle and ends as far right", () => {
  const stage = stageFor(sceneFor(play("P.Mahomes pass short right to T.Kelce to BUF 35 for 12 yards (T.Bernard).", { yards: 12 }), teams)!);
  const xs = stage.actors.flatMap((a) => a.keys.map((k) => k.x));
  assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 1e-9);
  assert.ok(stage.los < 0);
  assert.ok(stage.end!.x > 0);
  // The receiver ends where the play did, down; the ball in his hands; +1 when he caught it.
  const receiver = stage.actors.findIndex((a) => a.role === "target");
  const done = actorAt(stage.actors[receiver], stage.length);
  assert.ok(Math.abs(done.x - stage.end!.x) < 1e-9);
  assert.equal(done.pose, "down");
  assert.deepEqual(ballAt(stage, stage.length), { by: receiver });
  assert.ok(stage.marks.some((m) => m.kind === "plus" && m.text === "+1"));
  assert.ok(stage.marks.some((m) => m.kind === "yards" && m.text === "12"));
  // The bigger the play, the farther apart.
  const bomb = stageFor(sceneFor(play("P.Mahomes pass deep right to X.Worthy to BUF 5 for 50 yards (T.Bernard).", { yards: 50 }), teams)!);
  assert.ok(bomb.end!.x - bomb.los > stage.end!.x - stage.los + 30);
  // In flight between the throw and the catch.
  const midair = stage.ball.find((b) => "arc" in b)!;
  const flying = ballAt(stage, (midair.from + midair.to) / 2);
  assert.ok(flying && "h" in flying && flying.h > 1);
});

test("the field under a play: its line of scrimmage's yard line, and how far the play reaches", () => {
  const run = stageFor(sceneFor(play("J.Cook left end to KC 23 for 7 yards (N.Bolton).", { offense: "BUF", yards: 7, yardsToEndzone: 30 }), teams)!);
  assert.equal(run.toGoal, 30);
  const xs = run.actors.flatMap((a) => a.keys.map((k) => k.x));
  assert.ok(Math.abs(run.reach - (Math.max(...xs) - Math.min(...xs)) / 2) < 1e-9);
  // A field goal's line is 7 yards in front of where it's kicked; its posts on the end line, 10 past the goal line.
  const fg = stageFor(sceneFor(play("H.Butker 45 yard field goal is GOOD."), teams)!);
  assert.equal(fg.toGoal, 28);
  assert.ok(Math.abs(fg.posts! - (fg.los + fg.toGoal! + 10)) < 1e-9);
  // A kickoff from the kicking team's 35.
  assert.equal(stageFor(sceneFor(play("T.Bass kicks 65 yards from BUF 35 to end zone, Touchback."), teams)!).toGoal, 65);
});

test("the line to gain: as many yards past the line of scrimmage as the down and distance says — none to the goal", () => {
  const run = stageFor(sceneFor(play("J.Cook left end to KC 23 for 7 yards (N.Bolton).", { offense: "BUF", yards: 7, yardsToEndzone: 30, downDistance: "3rd & 4" }), teams)!);
  assert.ok(Math.abs(run.firstDown! - (run.los + 4)) < 1e-9);
  const goal = stageFor(sceneFor(play("J.Cook up the middle to KC 2 for 2 yards.", { offense: "BUF", yards: 2, yardsToEndzone: 4, downDistance: "1st & Goal" }), teams)!);
  assert.equal(goal.firstDown, null);
  assert.equal(stageFor(sceneFor(play("H.Butker 45 yard field goal is GOOD.", { downDistance: "4th & 8" }), teams)!).firstDown, null);
});
