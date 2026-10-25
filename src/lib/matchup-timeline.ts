// A fantasy matchup's two team totals over the week, play by play: each
// starter's plays (scored under the league's rules, see pointsTimeline) merged
// into one running total per team, the week's game windows the time runs
// through, each team's projected pace, and who led when.

import { PointsStep } from "./live-play-points";

/** A stretch of time, in ms. */
export interface Span {
  from: number;
  to: number;
}

/** The week's time that games were (or will be) on: overlapping games merged, in order. */
export function gameWindows(games: Span[]): Span[] {
  const sorted = games.filter((g) => g.to > g.from).sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const g of sorted) {
    const last = out[out.length - 1];
    if (last && g.from <= last.to) last.to = Math.max(last.to, g.to);
    else out.push({ ...g });
  }
  return out;
}

/** How long Sleeper gets to count a play before its total disagreeing with the plays' is taken as real. */
export const SLEEPER_LAG_MS = 10 * 60_000;

/**
 * Whether a player's Sleeper total really disagrees with their plays — not just Sleeper yet to count the latest:
 * it's none of the totals their plays have run through since the last one Sleeper's had time to count.
 */
export function sleeperDiffers(steps: PointsStep[], sleeper: number, now: number): boolean {
  const counted = steps.filter((s) => s.at <= now - SLEEPER_LAG_MS);
  const totals = [counted[counted.length - 1]?.total ?? 0, ...steps.filter((s) => s.at > now - SLEEPER_LAG_MS).map((s) => s.total)];
  return !totals.some((t) => Math.abs(t - sleeper) < 0.05);
}

/** One starter's part in their team's line. */
export interface StarterTimeline {
  playerId: string;
  name: string;
  /** Their plays, scored (see pointsTimeline). */
  steps: PointsStep[];
  /** Whatever their Sleeper total has that their plays don't, and when to count it (their game's end, or now). */
  makeUp: { at: number; delta: number } | null;
}

/** One moment a team's total moved: a starter's play, or the rest of a starter's points that no play accounts for. */
export interface TeamStep extends PointsStep {
  playerId: string;
  name: string;
}

/** A team's starters' points merged into one running total, in time order. */
export function teamTimeline(starters: StarterTimeline[]): TeamStep[] {
  const events: Omit<TeamStep, "total">[] = [];
  for (const s of starters) {
    for (const step of s.steps) events.push({ ...step, playerId: s.playerId, name: s.name });
    if (s.makeUp) {
      events.push({
        playId: `${s.playerId}:rest`,
        at: s.makeUp.at,
        period: 0,
        clock: "",
        text: "Scoring no single play accounts for",
        delta: s.makeUp.delta,
        playerId: s.playerId,
        name: s.name,
      });
    }
  }
  events.sort((a, b) => a.at - b.at);
  let total = 0;
  return events.map((e) => {
    total = Math.round((total + e.delta) * 100) / 100;
    return { ...e, total };
  });
}

/** A starter's projection, spread over their game. */
export interface StarterPace {
  projected: number;
  from: number;
  to: number;
}

/** A team's projected points by `at`: each starter's projection, earned evenly over their game. */
export function teamPace(starters: StarterPace[], at: number): number {
  let sum = 0;
  for (const s of starters) {
    if (at <= s.from || s.to <= s.from) continue;
    sum += s.projected * Math.min(1, (at - s.from) / (s.to - s.from));
  }
  return Math.round(sum * 100) / 100;
}

/** A starter, for their team's live projection. */
export interface ProjectedStarter {
  /** What they've scored so far. */
  points: number;
  /** Sleeper's pregame projection, under the league's rules; null when there's none. */
  projected: number | null;
  /** Their game is over, so their points are final. */
  final: boolean;
}

/**
 * A team's projected total as the week goes: each starter's pregame
 * projection, swapped for what they actually scored once their game is over.
 * It moves only as games finish, not play by play. A starter with no
 * projection counts what they've scored.
 */
export function liveProjection(starters: ProjectedStarter[]): number {
  const sum = starters.reduce((s, p) => s + (p.final || p.projected === null ? p.points : p.projected), 0);
  return Math.round(sum * 100) / 100;
}

/** A stretch where both totals held: whether you led (true), trailed (false) or were level (null). */
export interface LeadPiece extends Span {
  mine: number;
  theirs: number;
  lead: boolean | null;
}

/** The time from `start` to `end` cut wherever either total moved, each piece with who led through it. */
export function leadPieces(mine: { at: number; total: number }[], theirs: { at: number; total: number }[], start: number, end: number): LeadPiece[] {
  const cuts = [...new Set([start, ...mine.map((s) => s.at), ...theirs.map((s) => s.at), end])]
    .filter((t) => t >= start && t <= end)
    .sort((a, b) => a - b);
  const totalAt = (steps: { at: number; total: number }[], t: number) => {
    let v = 0;
    for (const s of steps) if (s.at <= t) v = s.total;
    return v;
  };
  const out: LeadPiece[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i];
    const to = cuts[i + 1];
    const m = totalAt(mine, from);
    const t = totalAt(theirs, from);
    out.push({ from, to, mine: m, theirs: t, lead: m === t ? null : m > t });
  }
  return out;
}
