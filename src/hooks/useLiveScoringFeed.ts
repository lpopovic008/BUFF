"use client";

import { useEffect, useRef, useState } from "react";
import { getMatchups } from "@/lib/sleeper";
import { LIVE_TTL_SECONDS } from "@/lib/live-clock";
import { useLiveTick } from "@/hooks/useLiveTick";

const MAX_EVENTS = 40;

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
 * Derives a live "someone just scored" feed by re-reading this week's
 * matchups on every live-clock tick and diffing each tracked player's points against their last-seen
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
  const tick = useLiveTick();

  // Who's tracked (or where) changed: start over, re-seeding the baseline on the next read.
  const baselineRef = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    baselineRef.current = null;
  }, [leagueId, week, trackedKey, enabled]);

  useEffect(() => {
    if (!enabled || !trackedKey) return;
    let cancelled = false;

    const poll = async () => {
      let matchups;
      try {
        matchups = await getMatchups(leagueId, week, LIVE_TTL_SECONDS);
      } catch {
        return;
      }
      if (cancelled) return;
      if (!baselineRef.current) {
        baselineRef.current = new Map(trackedRef.current.map((t) => [t.playerId, t.actual]));
        setEvents([]);
      }
      const baseline = baselineRef.current;
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
    return () => {
      cancelled = true;
    };
  }, [leagueId, week, trackedKey, enabled, tick]);

  return enabled && trackedKey ? events : [];
}
