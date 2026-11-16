import test from "node:test";
import assert from "node:assert/strict";
import { ballAt, FieldPlace, Flight, flightFor } from "./ball-flight";
import { GamePlay } from "./play-by-play";
import { PlayScene, sceneFor } from "./play-scene";

function play(text: string, over: Partial<GamePlay> = {}): GamePlay {
  return { id: "1", gameId: "g", sequence: 1, text, type: "", period: 2, clock: "5:00", offense: "KC", scoring: false, turnover: false, yards: 0, redZone: false, downDistance: null, at: null, ...over };
}
// KC on the road, going right; BUF at home, going left.
const teams: [string, string] = ["BUF", "KC"];
const placeOf = (s: PlayScene): FieldPlace => {
  const dir = s.offense === "KC" ? 1 : -1;
  return { dir, los: s.toGoal !== null && s.kind !== "kickoff" ? (dir > 0 ? 100 - s.toGoal : s.toGoal) : 50 };
};
const fly = (text: string, over: Partial<GamePlay> = {}) => flightFor(sceneFor(play(text, over), teams)!, placeOf);
const sample = (f: Flight) => {
  const out = [];
  for (let t = 0; t <= f.length; t += 0.02) {
    const b = ballAt(f, t);
    if (b) out.push(b);
  }
  return out;
};
/** The ball's highest, and where it's last seen. */
const peak = (f: Flight) => Math.max(...sample(f).map((b) => b.at[2]));
const lastSeen = (f: Flight) => sample(f).at(-1)!.at;

test("a completed pass: thrown up in an arc, ending where the gain says", () => {
  const f = fly("P.Mahomes pass short right to T.Kelce to BUF 35 for 12 yards (T.Bernard).", { yardsToEndzone: 47 });
  assert.ok(Math.abs(f.end - 65) < 1e-9);
  assert.ok(peak(f) > 3);
  assert.ok(f.legs.some((l) => l.spin === "spiral"));
  // Toward the right side of the offense going right: toward you.
  assert.ok(sample(f).some((b) => b.at[1] > 5));
  // Faded in at the start and out at the end.
  assert.equal(f.legs[0].fade, "in");
  assert.equal(f.legs.at(-1)!.fade, "out");
});

test("a run: along the ground, no higher than a runner carries it — backward for a loss, the home team going left", () => {
  const f = fly("J.Cook left end to KC 23 for 7 yards (N.Bolton).", { offense: "BUF", yardsToEndzone: 30 });
  assert.ok(Math.abs(f.end - 23) < 1e-9);
  assert.ok(peak(f) <= 1.6);
  const loss = fly("I.Pacheco up the middle to KC 27 for -3 yards (G.Rousseau).", { yardsToEndzone: 70 });
  assert.ok(Math.abs(loss.end - 27) < 1e-9);
});

test("every kind of play moves the ball its own way", () => {
  const plays: [string, Partial<GamePlay>][] = [
    ["P.Mahomes pass short right to T.Kelce to BUF 35 for 12 yards (T.Bernard).", { yardsToEndzone: 47 }],
    ["P.Mahomes pass incomplete deep right to X.Worthy.", { yardsToEndzone: 47 }],
    ["P.Mahomes pass deep left intended for X.Worthy INTERCEPTED by T.Bernard at BUF 20. T.Bernard to BUF 35 for 15 yards.", { yardsToEndzone: 47 }],
    ["I.Pacheco up the middle to BUF 44 for 3 yards (G.Rousseau).", { yardsToEndzone: 47 }],
    ["P.Mahomes scrambles right end to BUF 40 for 7 yards.", { yardsToEndzone: 47 }],
    ["P.Mahomes sacked at KC 46 for -7 yards (G.Rousseau).", { yardsToEndzone: 47 }],
    ["P.Mahomes kneels to KC 29 for -1 yards.", { yardsToEndzone: 70 }],
    ["P.Mahomes spiked the ball to stop the clock.", { yardsToEndzone: 47 }],
    ["(Shotgun) P.Mahomes FUMBLES (Aborted) at KC 30, RECOVERED by BUF-G.Rousseau at KC 28.", { yardsToEndzone: 70 }],
    ["H.Butker 45 yard field goal is GOOD.", { yardsToEndzone: 27 }],
    ["H.Butker 50 yard field goal is No Good, Wide Right.", { yardsToEndzone: 32 }],
    ["H.Butker 45 yard field goal is BLOCKED (E.Oliver).", { yardsToEndzone: 27 }],
    ["H.Butker extra point is GOOD.", {}],
    ["M.Araiza punts 45 yards to BUF 20, Center-J.Winchester, fair catch by K.Coleman.", { yardsToEndzone: 65 }],
    ["M.Araiza punts 45 yards to BUF 20. K.Coleman to BUF 30 for 10 yards (N.Bolton).", { yardsToEndzone: 65 }],
    ["T.Bass kicks 65 yards from BUF 35 to end zone, Touchback.", {}],
    ["H.Butker onside kick 11 yards from KC 35 to KC 46. RECOVERED by KC-J.Watson.", { offense: "BUF" }],
    ["PENALTY on KC-J.Smith, False Start, 5 yards, enforced at KC 30 - No Play.", { yardsToEndzone: 70 }],
  ];
  const shapes = plays.map(([text, over]) => {
    const f = fly(text, over);
    assert.ok(f.length > 0.5, text);
    // Its path, coarsely: where the ball is every tenth of a second.
    return sample(f)
      .filter((_, i) => i % 5 === 0)
      .map((b) => b.at.map((v) => Math.round(v)).join(","))
      .join(" ");
  });
  assert.equal(new Set(shapes).size, shapes.length);
});

test("a fumble: the ball falls out of the sky and bounces about loose", () => {
  const f = fly("I.Pacheco up the middle to BUF 40 for 7 yards, FUMBLES (Z.Sieler), RECOVERED by BUF-T.Bernard at BUF 40.", { yardsToEndzone: 47 });
  assert.ok(peak(f) >= 12);
  // Down and up off the ground again, more than once.
  const heights = sample(f).map((b) => b.at[2]);
  let landings = 0;
  for (let i = 1; i < heights.length; i++) if (heights[i - 1] > 0.05 && heights[i] <= 0.05) landings++;
  assert.ok(landings >= 3);
  assert.ok(f.marks.some((m) => m.kind === "ripple" && m.tone === "bad"));
});

test("kicks: the goalposts up while a field goal's on, the kick through them or wide of them; a touchdown lights its end zone", () => {
  const good = fly("H.Butker 45 yard field goal is GOOD.", { yardsToEndzone: 27 });
  const posts = good.marks.find((m) => m.kind === "posts");
  assert.ok(posts && posts.kind === "posts" && posts.end === 1 && Math.abs(posts.until - good.length) < 1e-9);
  assert.ok(good.marks.some((m) => m.kind === "flash" && m.end === 1));
  const wide = fly("H.Butker 50 yard field goal is No Good, Wide Right.", { yardsToEndzone: 32 });
  assert.ok(sample(wide).some((b) => Math.abs(b.at[1]) > 5));
  const td = fly("I.Pacheco up the middle for 5 yards, TOUCHDOWN.", { yardsToEndzone: 5 });
  assert.ok(td.marks.some((m) => m.kind === "flash" && m.end === 1 && m.tone === "good"));
  assert.ok(lastSeen(td)[0] > 100);
  // A kickoff from the kicking team's 35, going the other way.
  const kick = fly("T.Bass kicks 65 yards from BUF 35 to end zone, Touchback.", {});
  assert.ok(Math.abs(sample(kick)[0].at[0] - 65) < 1e-9);
  assert.ok(lastSeen(kick)[0] < 0);
});

test("a touchdown and its try: one after the other, the ball gone between them", () => {
  const f = fly("P.Mahomes pass deep middle to T.Kelce for 28 yards, TOUCHDOWN. H.Butker extra point is GOOD.", { yardsToEndzone: 28 });
  const gaps = [];
  for (let t = 0; t < f.length; t += 0.02) if (!ballAt(f, t)) gaps.push(t);
  assert.ok(gaps.length > 0);
  assert.equal(f.marks.filter((m) => m.kind === "posts").length, 1);
});

test("flags: a yellow one thrown in on a penalty, a red one on a challenge — and the ball walked off for it", () => {
  const pen = fly("PENALTY on KC-J.Smith, False Start, 5 yards, enforced at KC 30 - No Play.", { yardsToEndzone: 70 });
  assert.ok(pen.marks.some((m) => m.kind === "flag" && m.color === "yellow"));
  assert.ok(Math.abs(pen.end - 25) < 1e-9);
  const challenged = fly(
    "J.Cook left end to KC 23 for 7 yards (N.Bolton). Kansas City challenged the runner was down by contact ruling, and the play was Upheld. The ruling on the field stands.",
    { offense: "BUF", yardsToEndzone: 30 }
  );
  assert.ok(challenged.marks.some((m) => m.kind === "flag" && m.color === "red"));
});
