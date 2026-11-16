"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FloorFields } from "@/components/FloorFields";
import type { FieldFloor } from "@/lib/field-layout";
import { FIELD_SCENARIOS, scenarioText } from "@/lib/field-scenarios";
import type { NFLGame } from "@/lib/nfl-schedule";

// TEMPORARY: a bench for trying out every play the fields act out (see field-scenarios), nine fields at a time —
// shown in place of the live games' fields from tablet width up while it's on (see the home page).

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

/** A made-up game in progress, the road team with the ball where `scenario` snaps it, and its latest play `playId`. */
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
      downDistance: null,
      yardsToEndzone: FIELD_SCENARIOS[scenario].toGo,
      lastPlay: play ? { id: play.id, text: play.text, type: "", scoreValue: 0, team: away, athletes: [] } : null,
    },
  };
}

/**
 * Nine fields on the floor, each set to one of the plays (the first nine to start): clicked, a field acts its play out
 * again; its play changed in the panel over the floor, it acts out the new one.
 */
export function FloorFieldsLab({
  width,
  height,
  share,
  floor,
  top,
}: {
  width: number;
  height: number;
  share: number;
  floor: Omit<FieldFloor, "width" | "height" | "share">;
  /** Where the panel picking each field's play goes, from the top of the screen (CSS length). */
  top: string;
}) {
  const [picked, setPicked] = useState(() => MATCHUPS.map((_, i) => i % FIELD_SCENARIOS.length));
  const [plays, setPlays] = useState<({ id: string; text: string } | null)[]>(() => MATCHUPS.map(() => null));
  const made = useRef(0);
  // How many games are on (the first so many), to see how the floor's laid out for each.
  const [count, setCount] = useState(MATCHUPS.length);
  const games = useMemo(() => MATCHUPS.slice(0, count).map((_, i) => benchGame(i, picked[i], plays[i])), [picked, plays, count]);

  // A field's play acted out: a new latest play for its game.
  const play = (i: number, scenario = picked[i]) => {
    const [away, home] = MATCHUPS[i];
    made.current += 1;
    setPlays((was) => was.map((p, k) => (k === i ? { id: `bench-${i}-${made.current}`, text: scenarioText(FIELD_SCENARIOS[scenario], away, home) } : p)));
  };
  // A field's play changed: its line moved to where the new one's snapped first, then the play.
  const [queued, setQueued] = useState<number | null>(null);
  useEffect(() => {
    if (queued === null) return;
    const later = window.setTimeout(() => {
      play(queued);
      setQueued(null);
    }, 400);
    return () => window.clearTimeout(later);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once the line's moved for the new play
  }, [queued]);
  const choose = (i: number, scenario: number) => {
    setPicked((was) => was.map((s, k) => (k === i ? scenario : s)));
    setQueued(i);
  };

  return (
    <>
      <FloorFields games={games} width={width} height={height} share={share} floor={floor} onPick={(id) => play(Number(id.slice("bench-".length)))} />
      {/* The fields' plays, laid out as the fields are (the nearest row at the bottom). */}
      <div
        data-floor-ui
        className="fixed z-[6] grid grid-cols-1 gap-x-3 gap-y-1 border border-border bg-[color-mix(in_srgb,var(--page)_85%,transparent)] p-2 text-xs xl:grid-cols-3"
        style={{ top, left: floor.left, width: floor.right - floor.left }}
      >
        <div className="col-span-full flex items-baseline justify-between text-ink-muted">
          <span className="font-semibold uppercase tracking-wide text-ink-primary">Play test</span>
          <label className="flex items-center gap-1.5">
            Games
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="border border-border bg-page px-1 py-0.5 text-ink-primary">
              {MATCHUPS.map((_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <span>Click a field to play it again · {FIELD_SCENARIOS.length} plays</span>
        </div>
        {[6, 7, 8, 3, 4, 5, 0, 1, 2].filter((i) => i < count).map((i) => (
          <label key={i} className="flex min-w-0 items-center gap-1.5">
            <span className="w-16 shrink-0 text-ink-muted">
              {MATCHUPS[i][0]}@{MATCHUPS[i][1]}
            </span>
            <select
              value={picked[i]}
              onChange={(e) => choose(i, Number(e.target.value))}
              className="min-w-0 flex-1 border border-border bg-page px-1 py-0.5 text-ink-primary"
            >
              {FIELD_SCENARIOS.map((s, k) => (
                <option key={s.label} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => play(i)} aria-label={`Play ${FIELD_SCENARIOS[picked[i]].label}`} className="shrink-0 border border-border px-1.5 py-0.5 text-ink-primary hover:bg-page">
              Play
            </button>
          </label>
        ))}
      </div>
    </>
  );
}
