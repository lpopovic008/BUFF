"use client";

import { useEffect, useRef, useState } from "react";
import { getMatchups } from "@/lib/sleeper";

const POLL_MS = 25000;
const MAX_EVENTS = 20;

export interface TrackedPlayer {
  playerId: string;
  name: string;
  team: "you" | "cmp";
  /** Points already on the board when tracking starts, so the first poll doesn't replay it as a brand-new score. */
  actual: number;
}

export interface LiveScoreEvent {
  id: string;
  name: string;
  team: "you" | "cmp";
  delta: number;
  total: number;
}

/**
 * Derives a live "someone just scored" feed by polling this week's matchups
 * every 25s and diffing each tracked player's points against their last-seen
 * total — Sleeper's public API has no play-by-play/scoring feed of its own.
 * Baseline is seeded from each player's points at the first poll, so it
 * only reports genuinely new scoring, not a replay of everything already on
 * the board. Only fires while this is mounted and enabled; nothing is
 * backfilled from before that.
 */
export function useLiveScoringFeed(
  leagueId: string,
  week: number,
  tracked: TrackedPlayer[],
  enabled: boolean
): LiveScoreEvent[] {
  const [events, setEvents] = useState<LiveScoreEvent[]>([]);
  const trackedRef = useRef(tracked);
  useEffect(() => {
    trackedRef.current = tracked;
  });

  const trackedKey = tracked.map((t) => t.playerId).join(",");

  useEffect(() => {
    if (!enabled || !trackedKey) return;
    let cancelled = false;
    let baseline: Map<string, number> | null = null;

    const poll = async () => {
      let matchups;
      try {
        matchups = await getMatchups(leagueId, week);
      } catch {
        return;
      }
      if (cancelled) return;
      if (!baseline) {
        baseline = new Map(trackedRef.current.map((t) => [t.playerId, t.actual]));
        setEvents([]);
      }
      const byId = new Map(trackedRef.current.map((t) => [t.playerId, t]));
      const newEvents: LiveScoreEvent[] = [];
      for (const m of matchups) {
        for (const [playerId, pts] of Object.entries(m.players_points ?? {})) {
          const player = byId.get(playerId);
          if (!player) continue;
          const prev = baseline.get(playerId) ?? 0;
          if (pts > prev + 0.05) {
            newEvents.push({ id: `${playerId}-${Date.now()}`, name: player.name, team: player.team, delta: pts - prev, total: pts });
          }
          baseline.set(playerId, pts);
        }
      }
      if (newEvents.length > 0) {
        setEvents((current) => [...newEvents.reverse(), ...current].slice(0, MAX_EVENTS));
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [leagueId, week, trackedKey, enabled]);

  return enabled && trackedKey ? events : [];
}
