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

/** How long the duplicate takes to fly from the Red Zone to the total. */
const FLIGHT_MS = 800;
/** How long the change shows beside the total when there's nothing to fly from (the pts-chip keyframes). */
const CHIP_MS = 650;
/** Counting time per player passed — long enough for each swap to play out. */
const STEP_MS = 340;
/** Counting time with nobody to pass. */
const MIN_COUNT_MS = 450;
/** How long a row takes to slide one place. */
const SWAP_MS = 280;

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
  const byId = document.querySelector<HTMLElement>(`[data-rz-player="${CSS.escape(player.playerId)}"]`);
  let source = byId;
  if (!source) {
    const pattern = playTextNamePattern(player.name);
    source =
      [...document.querySelectorAll<HTMLElement>("[data-rz-actor]")].find(
        (el) => el.dataset.rzTeam === player.team && !!pattern?.test(el.dataset.rzActor ?? "")
      ) ?? null;
  }
  if (!source || source.dataset.flown) return null;
  const value = Number(source.dataset.rzDelta);
  const at = Number(source.dataset.rzAt);
  if (Math.sign(value) !== Math.sign(delta) || !(Date.now() - at < PENDING_PLAY_MS)) return null;
  const r = source.getBoundingClientRect();
  if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return null;
  return source;
}

/** The duplicate: a copy of the Red Zone's number that lifts off it and arcs over into the total. */
function fly(source: HTMLElement, target: HTMLElement) {
  source.dataset.flown = "1";
  const s = source.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${s.left}px`,
    top: `${s.top}px`,
    margin: "0",
    zIndex: "60",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    transformOrigin: "right center",
  });
  ghost.setAttribute("aria-hidden", "true");
  document.body.appendChild(ghost);
  const dx = t.right - s.right;
  const dy = t.top + t.height / 2 - (s.top + s.height / 2);
  const lift = Math.min(80, 30 + Math.abs(dx) * 0.08);
  ghost
    .animate(
      [
        { transform: "translate(0, 0) scale(1)" },
        { transform: "translate(0, -4px) scale(1.3)", offset: 0.15 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(1.15)`, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1, offset: 0.92 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0 },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.45, 0, 0.35, 1)" }
    )
    .finished.finally(() => ghost.remove());
  // The original stays put with a quick pulse, so it reads as copied rather than moved.
  source.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 300 });
}

interface Count {
  from: number;
  to: number;
  start: number;
  duration: number;
}

/** What a row shows while its points animate. */
export interface RowMotion {
  /** The total to show right now — counting toward the real one. */
  points: number | null;
  /** The change, popped in beside the total when there was no Red Zone row to fly from. */
  chip: { delta: number; key: number } | null;
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
  const [counting, setCounting] = useState(0);

  // Start each held row's animation: the flight (or chip), then the count.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const now = performance.now();
    let started = false;
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
      const source = target ? redZoneSource(player, delta) : null;
      if (source && target) fly(source, target);
      else if (!running) setChips((c) => ({ ...c, [playerId]: { delta, key: now } }));
      const lead = running ? 0 : source ? FLIGHT_MS : CHIP_MS;
      const [lo, hi] = shownFrom < to ? [shownFrom, to] : [to, shownFrom];
      const passes = sortByPoints
        ? players.filter((o) => o.playerId !== playerId && (o.points ?? 0) > lo && (o.points ?? 0) < hi).length
        : 0;
      counts.current.set(playerId, { from: shownFrom, to, start: now + lead, duration: Math.max(MIN_COUNT_MS, passes * STEP_MS) });
      // The row lights up in its side's color as the points land.
      const color = SIDE_FLASH[player.side ?? "mine"];
      setTimeout(() => {
        row?.animate([{ backgroundColor: `color-mix(in srgb, ${color} 28%, transparent)` }, { backgroundColor: "transparent" }], {
          duration: 1400,
          easing: "ease-out",
        });
        target?.animate([{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }], { duration: 350 });
      }, lead);
      started = true;
    }
    if (started) setCounting((n) => n + 1);
  }, [held, players, sortByPoints]);

  // Count every animating total toward its new number, frame by frame.
  useEffect(() => {
    if (counts.current.size === 0) return;
    let raf = 0;
    const tick = (now: number) => {
      const shown: Record<string, number | undefined> = {};
      for (const [playerId, c] of counts.current) {
        const t = Math.min(1, Math.max(0, (now - c.start) / c.duration));
        if (t >= 1) {
          counts.current.delete(playerId);
          shown[playerId] = undefined;
        } else {
          shown[playerId] = round2(c.from + (c.to - c.from) * t);
        }
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
          {render(player, { points: shownPoints(player), chip: chips[player.playerId] ?? null })}
        </div>
      ))}
    </div>
  );
}
