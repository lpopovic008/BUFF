"use client";

// A game's player rows in the starters list, and how they move when someone's
// points change (desktop only — on a phone the numbers and order just update).
// Everything that deserves attention is lit, in turn, on the HUD's tag plate:
//
//   1. The play: its row in the Red Zone, the player's name there and the
//      +/- it earned, and the player's name in this list.
//   2. The +/- is applied: it appears, lit, beside the player's total here.
//   3. The total counts up to its new number, lit as it goes, and the row
//      climbs the list: each player it passes slides down one as it moves up
//      one. Once it lands, the lights go out and a scan sweeps the row.
//
//   With no Red Zone row on screen, it starts at step 2.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GroupedStarter, PlayerSide } from "@/lib/my-starters";
import { playTextNamePattern } from "@/lib/play-by-play";
import { PENDING_PLAY_MS } from "@/lib/live-play-points";

/**
 * How unhurried the whole thing is. It's there for the look, so it takes its
 * time: every step below runs this many times its brisk length.
 */
const PACE = 2.5;
/** How long the play is lit in the Red Zone before its +/- is applied here. */
const ATTENTION_MS = 400 * PACE;
/** How long the +/- sits beside the total before the count starts. */
const APPLY_MS = 400 * PACE;
/** Counting time per player passed — long enough for each swap to play out. */
const STEP_MS = 340 * PACE;
/** Counting time with nobody to pass. */
const MIN_COUNT_MS = 450 * PACE;
/** How long a row takes to slide one place. */
const SWAP_MS = 280 * PACE;
/** How long the scan line takes to sweep the row once the count is done. */
const SCAN_MS = 700 * PACE;

const SIDE_FLASH: Record<PlayerSide, string> = {
  mine: "var(--status-good)",
  opponent: "var(--status-critical)",
  other: "var(--ink-muted)",
};

/** Desktop, and the viewer hasn't asked for less motion. */
function animationsOn(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 768px)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The Red Zone's +/- for this player's latest play, if it's on screen, recent
 * and moving the same way — your starters by id, anyone else by ESPN's
 * shorthand for them ("J.Allen") on their team.
 */
function redZoneSource(player: GroupedStarter, delta: number): HTMLElement | null {
  const source =
    document.querySelector<HTMLElement>(`[data-rz-player="${CSS.escape(player.playerId)}"]`) ??
    [...document.querySelectorAll<HTMLElement>("[data-rz-actor]")].find((el) =>
      namedBy(player, undefined, el.dataset.rzActor, el.dataset.rzTeam)
    ) ??
    null;
  if (!source || source.dataset.applied) return null;
  const value = Number(source.dataset.rzDelta);
  const at = Number(source.dataset.rzAt);
  if (Math.sign(value) !== Math.sign(delta) || !(Date.now() - at < PENDING_PLAY_MS)) return null;
  const r = source.getBoundingClientRect();
  if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return null;
  return source;
}

/**
 * Lights an element of the Red Zone on the tag plate (see `[data-lit]` in
 * globals.css). Counted, since one play's row can be lit for two players at
 * once; it goes dark when the last lets go.
 */
function light(el: HTMLElement) {
  el.dataset.lit = String(Number(el.dataset.lit ?? 0) + 1);
}

function unlight(el: HTMLElement) {
  const n = Number(el.dataset.lit ?? 0) - 1;
  if (n > 0) el.dataset.lit = String(n);
  else delete el.dataset.lit;
}

/** What to light in the Red Zone for one player's +/-: the play's row, their name in it, and the +/- itself. */
function redZoneLights(source: HTMLElement): HTMLElement[] {
  const line = source.closest("li");
  const name = line?.querySelector<HTMLElement>("[data-rz-name]");
  const row = line?.parentElement?.closest("li");
  return [row, name, source].filter((el): el is HTMLElement => !!el);
}

/** Once counted: a scan line sweeps the row in the side's color. */
function scan(row: HTMLElement, color: string) {
  // Clipped to the row, so the line sweeps across it and no further.
  const clip = document.createElement("span");
  clip.setAttribute("aria-hidden", "true");
  Object.assign(clip.style, { position: "absolute", inset: "0", overflow: "hidden", pointerEvents: "none" });
  const bar = document.createElement("span");
  clip.appendChild(bar);
  Object.assign(bar.style, {
    position: "absolute",
    top: "0",
    bottom: "0",
    left: "0",
    pointerEvents: "none",
    background: `linear-gradient(90deg, transparent 0%, color-mix(in srgb, ${color} 35%, transparent) 85%, ${color} 100%)`,
    width: "35%",
  });
  row.appendChild(clip);
  bar
    .animate(
      [
        { transform: "translateX(-100%)", opacity: 1 },
        { transform: "translateX(285%)", opacity: 1, offset: 0.8 },
        { transform: "translateX(285%)", opacity: 0 },
      ],
      { duration: SCAN_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }
    )
    .finished.finally(() => clip.remove());
}

/** Asks the starters list to play a Red Zone play's animation again (see replayRedZonePlay). */
const REPLAY_EVENT = "starters:replay-play";

interface ReplayDetail {
  /** The +/- in the Red Zone to light up again. */
  source: HTMLElement;
  delta: number;
  /** Your starter's Sleeper id — or, for anyone else, ESPN's shorthand for them and their team. */
  playerId?: string;
  actor?: string;
  team?: string;
}

/**
 * Replays the animation for a Red Zone play: for each player the play scored
 * points for, their total in the starters list rewinds by that much, and the
 * play lights up, its +/- is applied, and the total counts back up as the row
 * climbs, all over again. Desktop only, like the animation itself.
 */
export function replayRedZonePlay(play: HTMLElement) {
  if (!animationsOn()) return;
  for (const source of play.querySelectorAll<HTMLElement>("[data-rz-delta]")) {
    const delta = Number(source.dataset.rzDelta);
    if (!delta) continue;
    const { rzPlayer: playerId, rzActor: actor, rzTeam: team } = source.dataset;
    window.dispatchEvent(new CustomEvent<ReplayDetail>(REPLAY_EVENT, { detail: { source, delta, playerId, actor, team } }));
  }
}

/** Whether `player` is who a Red Zone +/- names: your starter by id, anyone else by ESPN's shorthand on their team. */
function namedBy(player: GroupedStarter, playerId?: string, actor?: string, team?: string): boolean {
  if (playerId) return player.playerId === playerId;
  return !!actor && player.team === team && !!playTextNamePattern(player.name)?.test(actor);
}

interface Count {
  from: number;
  to: number;
  start: number;
  duration: number;
  /** The side's color, for the scan once it's done. */
  color: string;
  /** What's lit in the Red Zone, to put out once it's done. */
  lights: HTMLElement[];
}

/** What a row shows while its points animate. */
export interface RowMotion {
  /** The total to show right now — counting toward the real one. */
  points: number | null;
  /** The change, lit beside the total from when it's applied until the count is done. */
  chip: { delta: number; key: number } | null;
  /** The name is lit from when the play lights up until the count is done. */
  highlight: boolean;
  /** The total is lit while it counts. */
  counting: boolean;
}

/**
 * A game's player rows. With `sortByPoints` (a game in a live time block) the
 * rows are kept in order of the totals as shown, so a player climbs one place
 * at a time as their count passes each player above.
 */
export function GameRows({
  players,
  sortByPoints,
  render,
}: {
  players: GroupedStarter[];
  sortByPoints: boolean;
  render: (player: GroupedStarter, motion: RowMotion) => React.ReactNode;
}) {
  const actual = Object.fromEntries(players.map((p) => [p.playerId, p.points]));
  // The last totals this list took in, and — for rows still animating — the total being shown instead.
  const [known, setKnown] = useState<Record<string, number | null>>(actual);
  const [held, setHeld] = useState<Record<string, number>>({});
  const [chips, setChips] = useState<Record<string, { delta: number; key: number }>>({});
  // Players whose names are lit: from when their points set off until the count is done.
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  // New totals are held at the old number from the very first render that has them, until the animation takes over.
  const changed = players.filter((p) => known[p.playerId] !== undefined && known[p.playerId] !== p.points);
  if (changed.length > 0 || players.some((p) => known[p.playerId] === undefined)) {
    if (animationsOn()) {
      const next = { ...held };
      for (const p of changed) {
        const before = known[p.playerId];
        if (before !== null && before !== undefined && p.points !== null && next[p.playerId] === undefined) next[p.playerId] = before;
      }
      setHeld(next);
    }
    setKnown(actual);
  }

  const listRef = useRef<HTMLDivElement>(null);
  const counts = useRef(new Map<string, Count>());
  /** Red Zone +/- elements to light for replays, by player id. */
  const replaySources = useRef(new Map<string, HTMLElement>());

  // A replayed play: rewind the player's total by the play's points, and the
  // usual animation (below) carries it back up, lighting the tapped play.
  useEffect(() => {
    const onReplay = (e: Event) => {
      const { source, delta, playerId, actor, team } = (e as CustomEvent<ReplayDetail>).detail;
      const player = players.find((p) => namedBy(p, playerId, actor, team));
      const list = listRef.current;
      if (!player || player.points === null || !list || counts.current.has(player.playerId)) return;
      // Not while its time block is folded shut.
      if (list.closest("[aria-hidden='true']")) return;
      list.querySelector(`[data-player-id="${CSS.escape(player.playerId)}"]`)?.scrollIntoView({ block: "nearest" });
      replaySources.current.set(player.playerId, source);
      setHeld((h) => ({ ...h, [player.playerId]: round2(player.points! - delta) }));
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [players]);
  const [counting, setCounting] = useState(0);
  // Totals being counted right now, lit as they go.
  const [countingIds, setCountingIds] = useState<Set<string>>(() => new Set());
  // The +/- appears beside the total once the play has had its moment; the timers that bring them in.
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  // Start each held row's animation: light the play, apply the +/-, then count.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const now = performance.now();
    let started = false;
    const lighting: string[] = [];
    for (const [playerId, from] of Object.entries(held)) {
      const player = players.find((p) => p.playerId === playerId);
      const running = counts.current.get(playerId);
      if (!player || player.points === null || (running && running.to === player.points)) continue;
      const to = player.points;
      // From whatever it shows now — mid-count, if it was still counting.
      const delta = round2(to - from);
      const row = list.querySelector<HTMLElement>(`[data-player-id="${CSS.escape(playerId)}"]`);
      const target = row?.querySelector<HTMLElement>("[data-points]") ?? null;
      const replaying = replaySources.current.get(playerId);
      replaySources.current.delete(playerId);
      const source = target && !running ? (replaying ?? redZoneSource(player, delta)) : null;
      // 1. The play lights up in the Red Zone (when it's on screen).
      const lights = source ? redZoneLights(source) : [];
      if (source) source.dataset.applied = "1";
      lights.forEach(light);
      // 2. Its +/- is applied beside the total, once the play has had its moment.
      const applyAt = source ? ATTENTION_MS : 0;
      if (!running) {
        const chip = { delta, key: now };
        if (applyAt > 0) timers.current.push(window.setTimeout(() => setChips((c) => ({ ...c, [playerId]: chip })), applyAt));
        else setChips((c) => ({ ...c, [playerId]: chip }));
      }
      // 3. Then the total counts up.
      const lead = running ? 0 : applyAt + APPLY_MS;
      const [lo, hi] = from < to ? [from, to] : [to, from];
      const passes = sortByPoints
        ? players.filter((o) => o.playerId !== playerId && (o.points ?? 0) > lo && (o.points ?? 0) < hi).length
        : 0;
      counts.current.set(playerId, {
        from,
        to,
        start: now + lead,
        duration: Math.max(MIN_COUNT_MS, passes * STEP_MS),
        color: SIDE_FLASH[player.side ?? "mine"],
        lights: [...(running?.lights ?? []), ...lights],
      });
      lighting.push(playerId);
      started = true;
    }
    if (lighting.length > 0) queueMicrotask(() => setLit((prev) => new Set([...prev, ...lighting])));
    if (started) setCounting((n) => n + 1);
  }, [held, players, sortByPoints]);

  // Count every animating total toward its new number, frame by frame.
  useEffect(() => {
    if (counts.current.size === 0) return;
    let raf = 0;
    const tick = (now: number) => {
      const shown: Record<string, number | undefined> = {};
      const done: string[] = [];
      const active = new Set<string>();
      for (const [playerId, c] of counts.current) {
        const t = Math.min(1, Math.max(0, (now - c.start) / c.duration));
        if (t >= 1) {
          counts.current.delete(playerId);
          shown[playerId] = undefined;
          done.push(playerId);
          // Counted: the lights go out, and the scan sweeps the row.
          c.lights.forEach(unlight);
          const row = listRef.current?.querySelector<HTMLElement>(`[data-player-id="${CSS.escape(playerId)}"]`);
          if (row) scan(row, c.color);
        } else {
          shown[playerId] = round2(c.from + (c.to - c.from) * t);
          if (now >= c.start) active.add(playerId);
        }
      }
      if (done.length > 0) {
        setLit((prev) => {
          const next = new Set(prev);
          for (const id of done) next.delete(id);
          return next;
        });
        setChips((prev) => {
          const next = { ...prev };
          for (const id of done) delete next[id];
          return next;
        });
      }
      setCountingIds((prev) => (prev.size === active.size && [...active].every((id) => prev.has(id)) ? prev : active));
      setHeld((prev) => {
        const next = { ...prev };
        for (const [id, value] of Object.entries(shown)) {
          if (value === undefined) delete next[id];
          else next[id] = value;
        }
        return next;
      });
      if (counts.current.size > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [counting]);

  const shownPoints = (p: GroupedStarter) => held[p.playerId] ?? p.points;
  const ordered = sortByPoints
    ? players
        .map((p, i) => ({ p, i }))
        .sort((a, b) => (shownPoints(b.p) ?? 0) - (shownPoints(a.p) ?? 0) || a.i - b.i)
        .map(({ p }) => p)
    : players;

  // Each row that changed places slides from where it was to where it is
  // now (FLIP), picking up from mid-slide if it was already moving.
  const tops = useRef(new Map<string, number>());
  const slides = useRef(new Map<string, Animation>());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = [...list.children] as HTMLElement[];
    const prev = tops.current;
    const next = new Map(rows.map((row) => [row.dataset.playerId ?? "", row.offsetTop]));
    tops.current = next;
    if (!animationsOn()) return;
    for (const row of rows) {
      const id = row.dataset.playerId ?? "";
      const before = prev.get(id);
      const after = next.get(id)!;
      if (before === undefined || before === after) continue;
      const running = slides.current.get(id);
      const midway = running ? new DOMMatrixReadOnly(getComputedStyle(row).transform).m42 : 0;
      running?.cancel();
      const from = before + midway - after;
      const rising = from > 0;
      if (rising) {
        row.style.zIndex = "1";
        row.style.background = "var(--page)";
      }
      const slide = row.animate([{ transform: `translateY(${from}px)` }, { transform: "translateY(0)" }], {
        duration: SWAP_MS,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
      slides.current.set(id, slide);
      slide.finished
        .then(() => {
          if (slides.current.get(id) !== slide) return;
          slides.current.delete(id);
          row.style.zIndex = "";
          row.style.background = "";
        })
        .catch(() => {});
    }
  });

  return (
    <div ref={listRef} className="relative flex flex-col">
      {ordered.map((player) => (
        <div key={player.playerId} data-player-id={player.playerId} className="relative">
          {render(player, {
            points: shownPoints(player),
            chip: chips[player.playerId] ?? null,
            highlight: lit.has(player.playerId),
            counting: countingIds.has(player.playerId),
          })}
        </div>
      ))}
    </div>
  );
}
