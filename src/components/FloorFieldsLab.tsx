"use client";

import { useMemo, useRef, useState } from "react";
import { FloorFields } from "@/components/FloorFields";
import type { FieldFloor } from "@/lib/field-layout";
import type { FloorTiltStore } from "@/lib/floor-tilt";
import { FIELD_SCENARIOS, scenarioText } from "@/lib/field-scenarios";
import type { NFLGame } from "@/lib/nfl-schedule";

// TEMPORARY: a bench for trying out every play the fields act out (see field-scenarios) — shown in place of the live
// games' fields from tablet width up while it's on (see the home page).

// Nine made-up games, the road team first.
const MATCHUPS: [away: string, home: string][] = [
  ["KC", "BUF"],
  ["DET", "GB"],
  ["DAL", "PHI"],
  ["MIA", "NYJ"],
  ["SF", "SEA"],
  ["CIN", "PIT"],
  ["LAR", "ARI"],
  ["MIN", "CHI"],
  ["DEN", "LV"],
];

/** A made-up game in progress, the road team with the ball where `scenario` snaps it, and its latest play. */
function benchGame(i: number, scenario: number, play: { id: string; text: string } | null): NFLGame {
  const [away, home] = MATCHUPS[i];
  return {
    id: `bench-${i}`,
    homeTeam: home,
    awayTeam: away,
    kickoff: new Date().toISOString(),
    state: "in",
    homeScore: 0,
    awayScore: 0,
    venue: null,
    neutralSite: false,
    statusDetail: FIELD_SCENARIOS[scenario].label,
    live: {
      possession: away,
      isRedZone: false,
      downDistance: FIELD_SCENARIOS[scenario].toGo <= 10 ? "1st & Goal" : "1st & 10",
      yardsToEndzone: FIELD_SCENARIOS[scenario].toGo,
      lastPlay: play ? { id: play.id, text: play.text, type: "", scoreValue: 0, team: away, athletes: [] } : null,
    },
  };
}

/**
 * The made-up games' fields on the floor (nine, or as many as picked), every one set to the same play: Play, and they
 * all act it out at once — and once the ball's done moving, the next play's picked, for the next time. A field clicked
 * acts out its last play again (see FloorFields) — or, before there's been one, they all act out the one picked.
 */
export function FloorFieldsLab({
  width,
  height,
  share,
  floor,
  top,
  tilt,
}: {
  width: number;
  height: number;
  share: number;
  floor: Omit<FieldFloor, "width" | "height" | "share">;
  /** Where the panel picking the play goes, from the top of the screen (CSS length). */
  top: string;
  /** How far the floor's laid back (see FloorFields' `tilt`). */
  tilt?: FloorTiltStore;
}) {
  const [scenario, setScenario] = useState(0);
  const [count, setCount] = useState(MATCHUPS.length);
  // The play sent down the fields last (one id for them all), and whether it's moved on to the next since.
  const [run, setRun] = useState<{ id: number; scenario: number } | null>(null);
  const moved = useRef(-1);
  const games = useMemo(
    () =>
      MATCHUPS.slice(0, count).map((m, i) =>
        benchGame(i, scenario, run ? { id: `bench-${i}-${run.id}`, text: scenarioText(FIELD_SCENARIOS[run.scenario], m[0], m[1]) } : null)
      ),
    [scenario, count, run]
  );
  // Every field acts out the play picked.
  const play = () => setRun((was) => ({ id: (was?.id ?? 0) + 1, scenario }));
  // Once the ball's done moving (the first field done with it), on to the next play.
  const done = () => {
    if (!run || moved.current === run.id || run.scenario !== scenario) return;
    moved.current = run.id;
    setScenario((s) => (s + 1) % FIELD_SCENARIOS.length);
  };

  return (
    <>
      <FloorFields games={games} width={width} height={height} share={share} floor={floor} onPick={() => !run && play()} onPlayed={done} tilt={tilt} />
      <div
        data-floor-ui
        className="fixed z-[6] flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-border bg-[color-mix(in_srgb,var(--page)_85%,transparent)] p-2 text-xs"
        style={{ top, left: floor.left, width: floor.right - floor.left }}
      >
        <span className="font-semibold uppercase tracking-wide text-ink-primary">Play test</span>
        <label className="flex items-center gap-1.5 text-ink-muted">
          Games
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="border border-border bg-page px-1 py-0.5 text-ink-primary">
            {MATCHUPS.map((_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-ink-muted">
          Play
          <select
            value={scenario}
            onChange={(e) => setScenario(Number(e.target.value))}
            className="min-w-0 flex-1 border border-border bg-page px-1 py-0.5 text-ink-primary"
          >
            {FIELD_SCENARIOS.map((s, k) => (
              <option key={s.label} value={k}>
                {k + 1}. {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={play} className="shrink-0 border border-border px-2 py-0.5 font-medium text-ink-primary hover:bg-page">
          Play
        </button>
        <span className="w-full text-ink-muted">Play runs it on every field, then moves on to the next play. Click a field to see its last play again.</span>
      </div>
    </>
  );
}
