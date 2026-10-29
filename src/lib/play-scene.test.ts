import test from "node:test";
import assert from "node:assert/strict";
import { GamePlay } from "./play-by-play";
import { actorAt, ballAt, formation, sceneFor, stageFor } from "./play-scene";

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

test("a penalty with no play is a flag thrown before the snap: on whom, for what, how far", () => {
  const s = sceneFor(play("PENALTY on KC-J.Smith, False Start, 5 yards, enforced at KC 30 - No Play."), teams)!;
  assert.equal(s.kind, "penalty");
  assert.deepEqual(s.penalty, { team: "KC", label: "J.Smith", name: "False Start", yards: 5, declined: false, noPlay: true });
  const stage = stageFor(s);
  assert.equal(stage.flags[0].color, "yellow");
  assert.ok(stage.marks.some((m) => m.kind === "word" && m.text === "FLAG · FALSE START"));
  // On a play that stood, the flag's thrown during it, and named after what happened.
  const held = stageFor(sceneFor(play("J.Cook left end to KC 23 for 7 yards (N.Bolton). PENALTY on KC-N.Bolton, Defensive Holding, declined.", { offense: "BUF", yards: 7 }), teams)!);
  assert.equal(held.flags.length, 1);
  assert.ok(held.marks.some((m) => m.text === "DECLINED"));
});

test("kneels, spikes, two-point tries and snaps that get away", () => {
  const kneel = sceneFor(play("P.Mahomes kneels to KC 29 for -1 yards."), teams)!;
  assert.deepEqual([kneel.kind, kneel.passer, kneel.yards], ["kneel", "P.Mahomes", -1]);
  assert.ok(stageFor(kneel).actors[0].keys.some((k) => k.pose === "kneel"));
  assert.ok(!stageFor(kneel).actors.some((a) => a.role === "lineman"));
  const spike = sceneFor(play("P.Mahomes spiked the ball to stop the clock."), teams)!;
  assert.equal(spike.kind, "spike");
  assert.ok(!stageFor(spike).actors.some((a) => a.role === "lineman"));
  const two = sceneFor(play("TWO-POINT CONVERSION ATTEMPT. P.Mahomes pass to T.Kelce is complete. ATTEMPT SUCCEEDS."), teams)!;
  assert.deepEqual([two.kind, two.target, two.toGoal, two.conversion], ["pass", "T.Kelce", 2, { good: true }]);
  const twoWords = stageFor(two).marks.filter((m) => m.kind === "word").map((m) => m.text);
  assert.deepEqual(twoWords, ["2-PT CONVERSION", "SUCCEEDED"]);
  const miss = sceneFor(play("TWO-POINT CONVERSION ATTEMPT. P.Mahomes pass to T.Kelce is incomplete. ATTEMPT FAILS."), teams)!;
  assert.deepEqual([miss.kind, miss.conversion], ["incomplete", { good: false }]);
  const rush = sceneFor(play("TWO-POINT CONVERSION ATTEMPT. I.Pacheco rushes up the middle. ATTEMPT SUCCEEDS."), teams)!;
  assert.deepEqual([rush.kind, rush.runner], ["run", "I.Pacheco"]);
  const aborted = sceneFor(play("(Shotgun) P.Mahomes FUMBLES (Aborted) at KC 30, RECOVERED by BUF-G.Rousseau at KC 28."), teams)!;
  assert.deepEqual([aborted.kind, aborted.defender, aborted.fumbleLost], ["fumble", "G.Rousseau", true]);
});

test("staged close: a field goal kicked from where its length says; defenders 2 yards off; nothing past the end line", () => {
  // A 45-yarder snapped from the 27: kicked from 8 yards back, the posts on the end line.
  const fg = stageFor(sceneFor(play("H.Butker 45 yard field goal is GOOD.", { yardsToEndzone: 27 }), teams)!);
  const ballAtKick = fg.ball[0] as { at: [number, number] };
  assert.ok(Math.abs(fg.los - ballAtKick.at[0] - 8) < 1e-9);
  assert.ok(Math.abs(fg.posts! - (fg.los + 27 + 10)) < 1e-9);
  // The tackler starts 2 yards from where he makes the tackle.
  const run = stageFor(sceneFor(play("J.Cook left end to KC 23 for 7 yards (N.Bolton).", { offense: "BUF", yards: 7, yardsToEndzone: 30 }), teams)!);
  const tackler = run.actors.find((a) => a.role === "defender")!;
  const [first, last] = [tackler.keys[0], tackler.keys.at(-1)!];
  assert.ok(Math.abs(Math.hypot(first.x - last.x, first.z - last.z) - 2) < 1);
  // Thrown deep from the 4: it comes down no more than 5 yards into the end zone, and no one's past the end line.
  const inc = stageFor(sceneFor(play("P.Mahomes pass incomplete deep right to X.Worthy.", { yardsToEndzone: 4 }), teams)!);
  const endLine = inc.los + 4 + 10;
  const resting = inc.ball.at(-1) as { at: [number, number] };
  assert.ok(resting.at[0] <= inc.los + 4 + 5 + 1e-9);
  assert.ok(inc.actors.every((a) => a.keys.every((k) => k.x <= endLine)));
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

test("set up for the next play: the next snap where the ball ended, everyone lined up on it", () => {
  const run = stageFor(sceneFor(play("J.Cook left end to KC 23 for 7 yards (N.Bolton).", { offense: "BUF", yards: 7, yardsToEndzone: 30 }), teams)!);
  assert.equal(run.next, run.end!.x);
  const spots = formation(run);
  assert.equal(spots.length, run.actors.length);
  run.actors.forEach((a, i) => assert.ok(a.team === run.offense ? spots[i][0] < run.next : spots[i][0] > run.next));
  // An incompletion: from where it was snapped again.
  const inc = stageFor(sceneFor(play("P.Mahomes pass incomplete deep right to X.Worthy."), teams)!);
  assert.equal(inc.next, inc.los);
});

test("defenders start 2 yards from their play, but never within 5 of the snap", () => {
  const stuffed = stageFor(sceneFor(play("J.Cook up the middle to KC 29 for 1 yard (N.Bolton).", { offense: "BUF", yards: 1, yardsToEndzone: 30 }), teams)!);
  const snap = stuffed.los;
  for (const a of stuffed.actors.filter((x) => x.team === "KC")) assert.ok(Math.hypot(a.keys[0].x - snap, a.keys[0].z) >= 5 - 1e-9);
});

test("a touchdown's try, acted out right after it: extra point or two-point try, and how it went", () => {
  const td = sceneFor(play("J.Allen pass deep middle to D.Kincaid for 28 yards, TOUCHDOWN. T.Bass extra point is GOOD, Center-R.Ferguson.", { offense: "BUF", yards: 28, yardsToEndzone: 28 }), teams)!;
  assert.equal(td.kind, "pass");
  assert.equal(td.after?.kind, "extraPoint");
  const xp = stageFor(td.after!);
  assert.deepEqual(xp.marks.filter((m) => m.kind === "word").map((m) => m.text), ["EXTRA POINT", "GOOD"]);
  // The touchdown sets up for the try: 15 yards out.
  const stage = stageFor(td);
  assert.ok(Math.abs(stage.los + 28 - 15 - stage.next) < 1e-9);
  const two = sceneFor(play("J.Cook right end for 2 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. J.Cook rushes up the middle. ATTEMPT FAILS.", { offense: "BUF", yardsToEndzone: 2 }), teams)!;
  assert.equal(two.after?.conversion?.good, false);
  assert.ok(stageFor(two.after!).marks.some((m) => m.text === "FAILED"));
});

test("fumbles: the ball comes loose, and whoever falls on it has it", () => {
  const lost = sceneFor(play("J.Cook up the middle to BUF 30 for 2 yards, FUMBLES (Z.Sieler), RECOVERED by KC-J.Phillips at BUF 30. J.Phillips to BUF 25 for 5 yards (J.Cook).", { offense: "BUF" }), teams)!;
  assert.deepEqual(lost.fumble, { by: "J.Phillips", lost: true, back: 5 });
  const stage = stageFor(lost);
  const picker = stage.actors.findIndex((a) => a.label === "J.Phillips");
  assert.deepEqual(ballAt(stage, stage.length), { by: picker });
  assert.deepEqual(stage.nextBall, { team: "KC", dir: -1 });
  assert.ok(stage.marks.some((m) => m.text === "TURNOVER"));
  const kept = sceneFor(play("J.Cook up the middle to BUF 30 for 2 yards, FUMBLES (Z.Sieler), and recovers at BUF 30.", { offense: "BUF" }), teams)!;
  assert.deepEqual(kept.fumble, { by: null, lost: false, back: 0 });
  const strip = sceneFor(play("J.Allen sacked at BUF 20 for -6 yards (Z.Sieler). FUMBLES (Z.Sieler), RECOVERED by KC-J.Phillips at BUF 18.", { offense: "BUF" }), teams)!;
  assert.equal(strip.kind, "sack");
  assert.equal(strip.fumble?.lost, true);
});

test("laterals, quarterback keepers, and reviews", () => {
  const pitch = sceneFor(play("J.Allen pass short left to S.Diggs to BUF 40 for 10 yards. S.Diggs lateral to J.Cook to KC 45 for 15 yards (T.Bernard).", { offense: "BUF" }), teams)!;
  assert.deepEqual([pitch.yards, pitch.lateral], [25, { to: "J.Cook", at: 10 }]);
  const pitched = stageFor(pitch);
  const cook = pitched.actors.findIndex((a) => a.label === "J.Cook");
  assert.deepEqual(ballAt(pitched, pitched.length), { by: cook });
  // A keeper: the quarterback takes it himself — no one to hand it to.
  const keeper = stageFor({ ...sceneFor(play("J.Allen up the middle to KC 30 for 4 yards (T.Bernard).", { offense: "BUF", yards: 4 }), teams)!, keeper: true });
  assert.equal(keeper.actors.filter((a) => a.team === "BUF").length, 1);
  assert.equal(keeper.actors[0].role, "qb");
  // Challenged and upheld: the play, the red flag, and the call standing.
  const upheld = sceneFor(play("J.Cook left end to KC 23 for 7 yards (N.Bolton). Kansas City challenged the runner was down by contact ruling, and the play was Upheld. The ruling on the field stands.", { offense: "BUF", yards: 7 }), teams)!;
  assert.deepEqual(upheld.review, { booth: false, reversed: false, called: true });
  const red = stageFor(upheld);
  assert.equal(red.flags.at(-1)?.color, "red");
  assert.ok(red.marks.some((m) => m.text === "UPHELD"));
  // Reversed: the play as called, then as it stands.
  const reversed = sceneFor(play("J.Allen pass short right to K.Shakir to KC 20 for 15 yards (T.Bernard). Kansas City challenged the pass completion ruling, and the play was REVERSED. J.Allen pass incomplete short right to K.Shakir.", { offense: "BUF" }), teams)!;
  assert.equal(reversed.kind, "pass");
  assert.equal(reversed.after?.kind, "incomplete");
  assert.ok(stageFor(reversed.after!).marks.some((m) => m.text === "REVERSED"));
  assert.equal(stageFor(reversed).next, stageFor(reversed).los);
});

test("an onside kick: a hop, a pile, whoever comes up with it has it next", () => {
  const kept = sceneFor(play("H.Butker onside kick 11 yards from KC 35 to KC 46. RECOVERED by KC-J.Watson.", { offense: "BUF" }), teams)!;
  assert.deepEqual([kept.kind, kept.onside, kept.recoveredBy], ["kickoff", true, { team: "KC", label: "J.Watson" }]);
  const stage = stageFor(kept);
  const watson = stage.actors.findIndex((a) => a.label === "J.Watson");
  assert.deepEqual(ballAt(stage, stage.length), { by: watson });
  assert.deepEqual(stage.nextBall, { team: "KC", dir: 1 });
  assert.ok(stage.marks.some((m) => m.text === "RECOVERED · KC"));
  const lost = stageFor(sceneFor(play("H.Butker onside kick 10 yards from KC 35 to KC 45. RECOVERED by BUF-K.Coleman.", { offense: "BUF" }), teams)!);
  assert.deepEqual(lost.nextBall, { team: "BUF", dir: -1 });
});

test("set up for the next play off an accepted flag's yards", () => {
  const held = stageFor(sceneFor(play("J.Cook left end to KC 23 for 7 yards (N.Bolton). PENALTY on KC-N.Bolton, Defensive Holding, 5 yards, enforced at KC 23.", { offense: "BUF", yards: 7, yardsToEndzone: 30 }), teams)!);
  assert.ok(Math.abs(held.next - (held.end!.x + 5)) < 1e-9);
  const noPlay = stageFor(sceneFor(play("J.Cook left end to KC 23 for 7 yards (D.Dawson). PENALTY on BUF-D.Dawson, Offensive Holding, 10 yards, enforced at BUF 30 - No Play.", { offense: "BUF", yards: 0, yardsToEndzone: 70 }), teams)!);
  assert.ok(Math.abs(noPlay.next - (noPlay.los - 10)) < 1e-9);
  const declined = stageFor(sceneFor(play("J.Cook left end to KC 23 for 7 yards (N.Bolton). PENALTY on KC-N.Bolton, Defensive Holding, declined.", { offense: "BUF", yards: 7, yardsToEndzone: 30 }), teams)!);
  assert.ok(Math.abs(declined.next - declined.end!.x) < 1e-9);
});

test("defenders start at least 5 yards off the line on their side — even for a sack", () => {
  for (const text of ["P.Mahomes sacked at KC 30 for -7 yards (G.Rousseau).", "P.Mahomes sacked at KC 36 for -1 yards (G.Rousseau).", "J.Cook up the middle to KC 29 for 1 yard (N.Bolton)."]) {
    const offense = text.startsWith("J.") ? "BUF" : "KC";
    const stage = stageFor(sceneFor(play(text, { offense }), teams)!);
    for (const a of stage.actors.filter((x) => x.team !== offense)) assert.ok(a.keys[0].x >= stage.los + 5 - 1e-9, text);
    for (const [x] of formation(stage).filter((_, i) => stage.actors[i].team !== stage.nextBall.team)) assert.ok(x >= stage.next + 5 - 1e-9);
  }
});

test("an onside kick however ESPN words it", () => {
  for (const text of [
    "H.Butker kicks onside 11 yards from KC 35 to KC 46. RECOVERED by KC-J.Watson.",
    "(Onside Kick formation) H.Butker kicks onside 12 yards from KC 35 to KC 47. RECOVERED by BUF-K.Coleman.",
    "H.Butker onside kick 10 yards from KC 35 to KC 45, out of bounds.",
  ]) {
    const s = sceneFor(play(text, { offense: "BUF" }), teams);
    assert.equal(s?.kind, "kickoff", text);
    assert.equal(s?.onside, true, text);
    assert.ok(stageFor(s!).marks.some((m) => m.text === "ONSIDE KICK"), text);
  }
});
