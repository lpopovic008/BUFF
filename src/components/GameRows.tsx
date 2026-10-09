"use client";

// A game's player rows in the starters list, and how they move when someone's
// points change (desktop only — on a phone the numbers and order just update):
//
//   1. The play's +/- in the Red Zone is duplicated, and the copy flies across
//      the screen into the player's total. With no Red Zone row on screen to
//      fly from, the change pops in beside the total instead.
//   2. The total counts up to its new number, and the row climbs the list as
//      it goes: each player it passes slides down one as it moves up one.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GroupedStarter, PlayerSide } from "@/lib/my-starters";
import { playTextNamePattern } from "@/lib/play-by-play";
import { PENDING_PLAY_MS } from "@/lib/live-play-points";

/**
 * How unhurried the whole thing is. It's there for the look, so it takes its
 * time: every step below runs this many times its brisk length.
 */
const PACE = 2.5;
/** How long the duplicate takes to fly from the Red Zone to the total. */
const FLIGHT_MS = 800 * PACE;
/** How long the change's plate shows beside the total when there's nothing to fly from (the pts-chip keyframes). */
export const CHIP_MS = 650 * PACE;
/** Counting time per player passed — long enough for each swap to play out. */
const STEP_MS = 340 * PACE;
/** Counting time with nobody to pass. */
const MIN_COUNT_MS = 450 * PACE;
/** How long a row takes to slide one place. */
const SWAP_MS = 280 * PACE;
/** How long the scan line takes to sweep the row once the count is done, and the total's flicker as the points land. */
const SCAN_MS = 700 * PACE;
const FLICKER_MS = 260 * PACE;
/** How long the lock-on brackets stay round the total after the points land. */
const LOCK_HOLD_MS = 500 * PACE;
/** The Red Zone number's blink as it's copied. */
const PULSE_MS = 300 * PACE;

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
  if (!source || source.dataset.flown) return null;
  const value = Number(source.dataset.rzDelta);
  const at = Number(source.dataset.rzAt);
  if (Math.sign(value) !== Math.sign(delta) || !(Date.now() - at < PENDING_PLAY_MS)) return null;
  const r = source.getBoundingClientRect();
  if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return null;
  return source;
}

/** Something drawn over the page for the length of an animation, then taken away. */
function overlay(tag: "div" | "span", style: Partial<CSSStyleDeclaration>): HTMLElement {
  const el = document.createElement(tag);
  Object.assign(el.style, { position: "fixed", margin: "0", zIndex: "60", pointerEvents: "none" }, style);
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  return el;
}

/**
 * Lock-on: four corner brackets close in on the total from a little way out,
 * blink, hold while the points land, and let go. Returns when they're gone.
 */
function lockOn(target: HTMLElement, color: string, holdMs: number) {
  const t = target.getBoundingClientRect();
  const pad = 3;
  const arm = 5;
  const corners: [number, number, string][] = [
    [-1, -1, "borderTop borderLeft"],
    [1, -1, "borderTop borderRight"],
    [-1, 1, "borderBottom borderLeft"],
    [1, 1, "borderBottom borderRight"],
  ];
  for (const [sx, sy, sides] of corners) {
    const x = sx < 0 ? t.left - pad : t.right + pad - arm;
    const y = sy < 0 ? t.top - pad : t.bottom + pad - arm;
    const style: Partial<CSSStyleDeclaration> = { left: `${x}px`, top: `${y}px`, width: `${arm}px`, height: `${arm}px` };
    for (const side of sides.split(" ")) (style as Record<string, string>)[side] = `1.5px solid ${color}`;
    const el = overlay("span", style);
    const out = `translate(${sx * 8}px, ${sy * 8}px)`;
    el.animate(
      [
        { transform: out, opacity: 0 },
        { transform: "translate(0, 0)", opacity: 1, offset: 0.12 },
        { opacity: 0.2, offset: 0.17 },
        { opacity: 1, offset: 0.22 },
        { transform: "translate(0, 0)", opacity: 1, offset: 0.85 },
        { transform: out, opacity: 0 },
      ],
      { duration: holdMs, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
    ).finished.finally(() => el.remove());
  }
}

/**
 * The duplicate: the Red Zone's number copied onto a tag plate, which runs to
 * the total along a right-angled track — across, then down — with a dashed
 * tracer line drawing itself in behind it.
 */
function fly(source: HTMLElement, target: HTMLElement, color: string) {
  source.dataset.flown = "1";
  const s = source.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const font = getComputedStyle(source);
  const plate = overlay("span", {
    left: `${s.left - 4}px`,
    top: `${s.top}px`,
    padding: "0 4px",
    font: `700 ${font.fontSize} / ${font.lineHeight} ${font.fontFamily}`,
    whiteSpace: "nowrap",
    background: "var(--map-tag)",
    color: "var(--map-tag-ink)",
    borderLeft: `2px solid ${color}`,
  });
  plate.textContent = source.textContent;
  // The track runs from the plate's right end to the total's right end, at mid-height.
  const sx = s.right + 4;
  const sy = s.top + s.height / 2;
  const ex = t.right;
  const ey = t.top + t.height / 2;
  const dx = ex - sx;
  const dy = ey - sy;
  const legs = Math.abs(dx) + Math.abs(dy) || 1;
  const turn = Math.abs(dx) / legs;

  // The tracer: an L of dashes from the play to the total, drawn in as the plate runs.
  const left = Math.min(sx, ex) - 2;
  const top = Math.min(sy, ey) - 2;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", `${Math.abs(dx) + 4}`);
  svg.setAttribute("height", `${Math.abs(dy) + 4}`);
  Object.assign(svg.style, { position: "fixed", left: `${left}px`, top: `${top}px`, zIndex: "59", pointerEvents: "none", overflow: "visible" });
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", `M ${sx - left} ${sy - top} H ${ex - left} V ${ey - top}`);
  Object.assign(line.style, { fill: "none", stroke: color, strokeWidth: "1", strokeDasharray: "3 3" });
  // A mask the length of the track, pulled back to reveal it bit by bit.
  const reveal = document.createElementNS("http://www.w3.org/2000/svg", "path");
  reveal.setAttribute("d", line.getAttribute("d")!);
  const maskId = `trace-${Math.random().toString(36).slice(2)}`;
  const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
  mask.id = maskId;
  Object.assign(reveal.style, { fill: "none", stroke: "white", strokeWidth: "3", strokeDasharray: `${legs}`, strokeDashoffset: `${legs}` });
  mask.appendChild(reveal);
  svg.appendChild(mask);
  line.setAttribute("mask", `url(#${maskId})`);
  svg.appendChild(line);
  document.body.appendChild(svg);

  const run = 0.85;
  reveal.animate([{ strokeDashoffset: `${legs}` }, { strokeDashoffset: "0", offset: run }, { strokeDashoffset: "0" }], {
    duration: FLIGHT_MS,
    easing: "linear",
    fill: "forwards",
  });
  svg
    .animate([{ opacity: 0.9 }, { opacity: 0.9, offset: run }, { opacity: 0 }], { duration: FLIGHT_MS + 400 * PACE })
    .finished.finally(() => svg.remove());
  plate
    .animate(
      [
        { transform: "translate(0, 0)", opacity: 0 },
        { transform: "translate(0, 0)", opacity: 1, offset: 0.06 },
        { transform: "translate(0, 0)", opacity: 0.3, offset: 0.09 },
        { transform: "translate(0, 0)", opacity: 1, offset: 0.12 },
        { transform: `translate(${dx}px, 0)`, offset: 0.12 + (run - 0.12) * turn },
        { transform: `translate(${dx}px, ${dy}px)`, opacity: 1, offset: run },
        { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
      ],
      { duration: FLIGHT_MS, easing: "linear" }
    )
    .finished.finally(() => plate.remove());
  // The original stays put and blinks, so it reads as copied rather than moved.
  source.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], {
    duration: PULSE_MS,
    easing: "steps(1, end)",
  });
}

/** On impact: a scan line sweeps the row in the side's color. */
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
  /** The +/- in the Red Zone to fly a copy of. */
  source: HTMLElement;
  delta: number;
  /** Your starter's Sleeper id — or, for anyone else, ESPN's shorthand for them and their team. */
  playerId?: string;
  actor?: string;
  team?: string;
}

/**
 * Replays the animation for a Red Zone play: for each player the play scored
 * points for, their total in the starters list rewinds by that much, a copy
 * of the play's +/- flies over again, and the total counts back up as the
 * row climbs. Desktop only, like the animation itself.
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
}

/** What a row shows while its points animate. */
export interface RowMotion {
  /** The total to show right now — counting toward the real one. */
  points: number | null;
  /** The change, popped in beside the total when there was no Red Zone row to fly from. */
  chip: { delta: number; key: number } | null;
  /** The name is lit while the points travel and count up. */
  highlight: boolean;
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
  /** Red Zone +/- elements to fly from for replays, by player id. */
  const replaySources = useRef(new Map<string, HTMLElement>());

  // A replayed play: rewind the player's total by the play's points, and the
  // usual animation (below) carries it back up, flying from the tapped play.
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

  // Start each held row's animation: the flight (or chip), then the count.
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
      const shownFrom = from;
      const delta = round2(to - shownFrom);
      const row = list.querySelector<HTMLElement>(`[data-player-id="${CSS.escape(playerId)}"]`);
      const target = row?.querySelector<HTMLElement>("[data-points]") ?? null;
      const replaying = replaySources.current.get(playerId);
      replaySources.current.delete(playerId);
      const source = target ? (replaying ?? redZoneSource(player, delta)) : null;
      const color = SIDE_FLASH[player.side ?? "mine"];
      if (source && target) fly(source, target, color);
      else if (!running) setChips((c) => ({ ...c, [playerId]: { delta, key: now } }));
      const lead = running ? 0 : source ? FLIGHT_MS : CHIP_MS;
      if (target && !running) lockOn(target, color, lead + LOCK_HOLD_MS);
      const [lo, hi] = shownFrom < to ? [shownFrom, to] : [to, shownFrom];
      const passes = sortByPoints
        ? players.filter((o) => o.playerId !== playerId && (o.points ?? 0) > lo && (o.points ?? 0) < hi).length
        : 0;
      counts.current.set(playerId, {
        from: shownFrom,
        to,
        start: now + lead,
        duration: Math.max(MIN_COUNT_MS, passes * STEP_MS),
        color,
      });
      lighting.push(playerId);
      // On impact the total flickers.
      setTimeout(() => {
        target?.animate([{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], {
          duration: FLICKER_MS,
          easing: "steps(1, end)",
        });
      }, lead);
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
      for (const [playerId, c] of counts.current) {
        const t = Math.min(1, Math.max(0, (now - c.start) / c.duration));
        if (t >= 1) {
          counts.current.delete(playerId);
          shown[playerId] = undefined;
          done.push(playerId);
          // Counted: the scan sweeps the row, taking over from the name's light.
          const row = listRef.current?.querySelector<HTMLElement>(`[data-player-id="${CSS.escape(playerId)}"]`);
          if (row) scan(row, c.color);
        } else {
          shown[playerId] = round2(c.from + (c.to - c.from) * t);
        }
      }
      if (done.length > 0) {
        setLit((prev) => {
          const next = new Set(prev);
          for (const id of done) next.delete(id);
          return next;
        });
      }
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
          {render(player, { points: shownPoints(player), chip: chips[player.playerId] ?? null, highlight: lit.has(player.playerId) })}
        </div>
      ))}
    </div>
  );
}
