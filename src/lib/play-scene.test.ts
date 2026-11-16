import test from "node:test";
import assert from "node:assert/strict";
import { GamePlay } from "./play-by-play";
import { playSummary, sceneFor } from "./play-scene";

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
});

test("kneels, spikes, two-point tries and snaps that get away", () => {
  const kneel = sceneFor(play("P.Mahomes kneels to KC 29 for -1 yards."), teams)!;
  assert.deepEqual([kneel.kind, kneel.passer, kneel.yards], ["kneel", "P.Mahomes", -1]);
  const spike = sceneFor(play("P.Mahomes spiked the ball to stop the clock."), teams)!;
  assert.equal(spike.kind, "spike");
  const two = sceneFor(play("TWO-POINT CONVERSION ATTEMPT. P.Mahomes pass to T.Kelce is complete. ATTEMPT SUCCEEDS."), teams)!;
  assert.deepEqual([two.kind, two.target, two.toGoal, two.conversion], ["pass", "T.Kelce", 2, { good: true }]);
  const miss = sceneFor(play("TWO-POINT CONVERSION ATTEMPT. P.Mahomes pass to T.Kelce is incomplete. ATTEMPT FAILS."), teams)!;
  assert.deepEqual([miss.kind, miss.conversion], ["incomplete", { good: false }]);
  const rush = sceneFor(play("TWO-POINT CONVERSION ATTEMPT. I.Pacheco rushes up the middle. ATTEMPT SUCCEEDS."), teams)!;
  assert.deepEqual([rush.kind, rush.runner], ["run", "I.Pacheco"]);
  const aborted = sceneFor(play("(Shotgun) P.Mahomes FUMBLES (Aborted) at KC 30, RECOVERED by BUF-G.Rousseau at KC 28."), teams)!;
  assert.deepEqual([aborted.kind, aborted.defender, aborted.fumbleLost], ["fumble", "G.Rousseau", true]);
});

test("a touchdown's try, read right after it: extra point or two-point try, and how it went", () => {
  const td = sceneFor(play("J.Allen pass deep middle to D.Kincaid for 28 yards, TOUCHDOWN. T.Bass extra point is GOOD, Center-R.Ferguson.", { offense: "BUF", yards: 28, yardsToEndzone: 28 }), teams)!;
  assert.equal(td.kind, "pass");
  assert.equal(td.after?.kind, "extraPoint");
  const two = sceneFor(play("J.Cook right end for 2 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. J.Cook rushes up the middle. ATTEMPT FAILS.", { offense: "BUF", yardsToEndzone: 2 }), teams)!;
  assert.equal(two.after?.conversion?.good, false);
});

test("fumbles: the ball comes loose, and whoever falls on it has it", () => {
  const lost = sceneFor(play("J.Cook up the middle to BUF 30 for 2 yards, FUMBLES (Z.Sieler), RECOVERED by KC-J.Phillips at BUF 30. J.Phillips to BUF 25 for 5 yards (J.Cook).", { offense: "BUF" }), teams)!;
  assert.deepEqual(lost.fumble, { by: "J.Phillips", lost: true, back: 5 });
  const kept = sceneFor(play("J.Cook up the middle to BUF 30 for 2 yards, FUMBLES (Z.Sieler), and recovers at BUF 30.", { offense: "BUF" }), teams)!;
  assert.deepEqual(kept.fumble, { by: null, lost: false, back: 0 });
  const strip = sceneFor(play("J.Allen sacked at BUF 20 for -6 yards (Z.Sieler). FUMBLES (Z.Sieler), RECOVERED by KC-J.Phillips at BUF 18.", { offense: "BUF" }), teams)!;
  assert.equal(strip.kind, "sack");
  assert.equal(strip.fumble?.lost, true);
});

test("laterals and reviews", () => {
  const pitch = sceneFor(play("J.Allen pass short left to S.Diggs to BUF 40 for 10 yards. S.Diggs lateral to J.Cook to KC 45 for 15 yards (T.Bernard).", { offense: "BUF" }), teams)!;
  assert.deepEqual([pitch.yards, pitch.lateral], [25, { to: "J.Cook", at: 10 }]);
  // Challenged and upheld: the play, the red flag, and the call standing.
  const upheld = sceneFor(play("J.Cook left end to KC 23 for 7 yards (N.Bolton). Kansas City challenged the runner was down by contact ruling, and the play was Upheld. The ruling on the field stands.", { offense: "BUF", yards: 7 }), teams)!;
  assert.deepEqual(upheld.review, { booth: false, reversed: false, called: true });
  // Reversed: the play as called, then as it stands.
  const reversed = sceneFor(play("J.Allen pass short right to K.Shakir to KC 20 for 15 yards (T.Bernard). Kansas City challenged the pass completion ruling, and the play was REVERSED. J.Allen pass incomplete short right to K.Shakir.", { offense: "BUF" }), teams)!;
  assert.equal(reversed.kind, "pass");
  assert.equal(reversed.after?.kind, "incomplete");
});

test("an onside kick: who came up with it", () => {
  const kept = sceneFor(play("H.Butker onside kick 11 yards from KC 35 to KC 46. RECOVERED by KC-J.Watson.", { offense: "BUF" }), teams)!;
  assert.deepEqual([kept.kind, kept.onside, kept.recoveredBy], ["kickoff", true, { team: "KC", label: "J.Watson" }]);
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
  }
});

test("every play in a few words: a flag's what and how far, or what the play was", () => {
  const say = (text: string, over: Partial<GamePlay> = {}) => playSummary(play(text, over), teams);
  assert.equal(say("PENALTY on KC-J.Smith, False Start, 5 yards, enforced at KC 30 - No Play."), "False Start · 5 yards · no play");
  assert.equal(say("J.Cook left end to KC 23 for 7 yards (N.Bolton). PENALTY on KC-N.Bolton, Defensive Holding, declined.", { offense: "BUF" }), "Defensive Holding · declined");
  assert.equal(say("M.Araiza punts 48 yards to BUF 20, Center-J.Winchester, fair catch by K.Coleman."), "48 yard punt · fair catch");
  assert.equal(say("H.Butker kicks onside 11 yards from KC 35 to KC 46. RECOVERED by KC-J.Watson.", { offense: "BUF" }), "Onside kick · recovered by KC");
  assert.equal(say("P.Mahomes kneels to KC 29 for -1 yards."), "Kneel");
  assert.equal(say("Timeout #1 by KC at 02:00. Something else happened."), "Timeout #1 by KC at 02:00.");
});
