import test from "node:test";
import assert from "node:assert/strict";
import { ballAt, flightFor } from "./ball-flight";
import { FIELD_SCENARIOS, scenarioText } from "./field-scenarios";
import { GamePlay } from "./play-by-play";
import { sceneFor } from "./play-scene";

const teams: [string, string] = ["BUF", "KC"];

test("every scenario reads as a play, and each one moves the ball its own way", () => {
  const shapes = FIELD_SCENARIOS.map((s) => {
    const play: GamePlay = {
      id: "1",
      gameId: "g",
      sequence: 1,
      text: scenarioText(s, "KC", "BUF"),
      type: "",
      period: 2,
      clock: "5:00",
      offense: "KC",
      scoring: false,
      turnover: false,
      yards: 0,
      redZone: false,
      downDistance: null,
      yardsToEndzone: s.toGo,
      at: null,
    };
    const scene = sceneFor(play, teams);
    assert.ok(scene, s.label);
    const f = flightFor(scene, (sc) => ({ dir: sc.offense === "KC" ? 1 : -1, los: sc.toGoal !== null ? 100 - sc.toGoal : 50 }));
    const path = [];
    for (let t = 0; t <= f.length; t += 0.1) {
      const b = ballAt(f, t);
      path.push(b ? b.at.map((v) => Math.round(v * 2)).join(",") : "-");
    }
    return path.join(" ") + f.marks.map((m) => m.kind).join("");
  });
  const seen = new Map<string, string>();
  shapes.forEach((shape, i) => {
    assert.ok(!seen.has(shape), `${FIELD_SCENARIOS[i].label} looks just like ${seen.get(shape)}`);
    seen.set(shape, FIELD_SCENARIOS[i].label);
  });
});
