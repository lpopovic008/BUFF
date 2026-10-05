"use client";

import { useSyncExternalStore } from "react";
import { liveMode, LiveMode, liveTick, subscribeLiveClock } from "@/lib/live-clock";

/** The shared live clock's tick count — put it in an effect's dependencies to reload on every tick. */
export function useLiveTick(): number {
  return useSyncExternalStore(subscribeLiveClock, liveTick, () => 0);
}

/** The shared live clock's pace: "live" while games are being played. */
export function useLiveMode(): LiveMode {
  return useSyncExternalStore(subscribeLiveClock, liveMode, () => "soon" as const);
}
