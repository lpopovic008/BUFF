"use client";

import { useEffect, useState } from "react";
import { getNFLState, SleeperNFLState } from "@/lib/sleeper";

export interface NFLPhase {
  /** Short label for the header, e.g. "Week 4", "Preseason", "Playoffs · Week 15". */
  label: string;
  /** True while Sleeper still reports the preseason, so pages can say so. */
  isPreseason: boolean;
  week: number;
  season: string | null;
  loaded: boolean;
}

const PENDING: NFLPhase = {
  label: "",
  isPreseason: false,
  week: 0,
  season: null,
  loaded: false,
};

function describe(state: SleeperNFLState | null): NFLPhase {
  if (!state) return { ...PENDING, loaded: true };
  const week = state.week ?? 0;
  switch (state.season_type) {
    case "pre":
      return {
        label: week > 0 ? `Preseason · Week ${week}` : "Preseason",
        isPreseason: true,
        week,
        season: state.season,
        loaded: true,
      };
    case "post":
      return {
        label: week > 0 ? `Playoffs · Week ${week}` : "Playoffs",
        isPreseason: false,
        week,
        season: state.season,
        loaded: true,
      };
    case "off":
      return { label: "Offseason", isPreseason: false, week, season: state.season, loaded: true };
    default:
      return {
        label: week > 0 ? `Week ${week}` : "Season starting",
        isPreseason: false,
        week,
        season: state.season,
        loaded: true,
      };
  }
}

/** Where the NFL calendar currently is, per Sleeper. Never throws. */
export function useNFLState(): NFLPhase {
  const [phase, setPhase] = useState<NFLPhase>(PENDING);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await getNFLState();
      if (!cancelled) setPhase(describe(state));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return phase;
}
