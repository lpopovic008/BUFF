"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FAR_OPACITY, FULL_DEPTH_SHARE, HORIZON_OPACITY, LINE_OPACITY } from "@/components/FloorGrid";
import { FloorTitle } from "@/components/LeagueRoomStages";
import { PayoutLegend, PayoutTotals, boardData } from "@/components/MoneyBoard";
import { BoardTray, PayoutBoard } from "@/components/PayoutBoard";
import { useAsItStands } from "@/hooks/useAsItStands";
import { FLOOR_TILT, GRID_PX, HORIZON_SHARE, PERSPECTIVE_PX } from "@/lib/grid-room";
import { finishedWeeksOnly, loadLeagueSeason, LeagueSeason, startingPlan } from "@/lib/league-money";
import { savePayoutPlan } from "@/lib/localStore";
import { computePlanLedger, PayoutPlan } from "@/lib/payout-plan";

// The payouts as part of the League Room's floor. Opened, the room looks down at its floor; the floor then sinks in
// where the payout board's tray is (see PayoutBoard), leaving the cubes where they were — their tops level with the
// floor, floating over the tray's bottom once it's gone down past them — and then the board's words and amounts come
// in. Closed, it all goes back the way it came.
//
// The room's floor (grid-room.ts) is hinged at the horizon and laid back FLOOR_TILT under a perspective of
// PERSPECTIVE_PX. Looking down is that same floor swung up about its hinge to VIEW_TILT, the perspective easing to
// one for the board's size and the hinge rising to the top of the screen — the room's floor at the start, so nothing
// jumps. The board lies right where it'll be from the start (straight below, in the middle of the screen when it fits),
// so nothing slides across to it either.

/** How long the whole thing takes to come in (ms), and to go. */
const OPEN_MS = 3000;
const CLOSE_MS = 1400;
/** How far through coming in it's looked down — where it waits until the payouts have loaded. */
const LOOKED = 0.4;
/** How far the floor's laid back from upright once it's looked down (the room's is FLOOR_TILT): angled well back,
 * not seen flat on. */
const VIEW_TILT = 62;
const VIEW_SIN = Math.sin((VIEW_TILT * Math.PI) / 180);
/** The perspective once it's looked down, for the board's depth (board px) — no weaker than the least. */
const PERSPECTIVE_PER_DEPTH = 1.5;
const LEAST_PERSPECTIVE = 700;
/** The widest the board's drawn (its own px, at its near edge) — wider screens leave floor either side of it. */
const BOARD_MOST_PX = 1000;
/** Kept to the bottom, how much bigger than its own size the board's drawn at most, where there's room. */
const MOST_FIT = 1.35;
/** The room's horizon below its title, once it's looked down (px) — and the room it leaves the floor above it. */
const UNDER_TITLE = 18;
const OVER_HINGE = 14;
/** The gap between the board's near edge and what's under it (px). */
const INFO_GAP = 16;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** How the floor's seen: laid back `tilt` degrees under a perspective of `P` px, hinged at screen y `hinge`. */
interface Pose {
  tilt: number;
  P: number;
  hinge: number;
}

/** [screen x, screen y, scale] of floor point (`across`, `d` back from the hinge toward you), `h` up off it. */
function seen(pose: Pose, width: number, across: number, d: number, h = 0): [number, number, number] {
  const a = (pose.tilt * Math.PI) / 180;
  const down = d * Math.cos(a) - h * Math.sin(a);
  const toward = Math.min(d * Math.sin(a) + h * Math.cos(a), pose.P * 0.97);
  const s = pose.P / (pose.P - toward);
  return [width / 2 + across * s, pose.hinge + down * s, s];
}

/** How far back from the hinge the floor is at screen y `y` (null: above where the floor runs to). */
function depthAt(pose: Pose, y: number): number | null {
  const a = (pose.tilt * Math.PI) / 180;
  const below = y - pose.hinge;
  const under = Math.cos(a) * pose.P + below * Math.sin(a);
  return under > 1e-6 ? (below * pose.P) / under : null;
}

/** The season's payouts for a league, loaded once it's asked for — the last league's kept while the next one loads. */
function usePayouts(leagueId: string, wanted: boolean) {
  const [money, setMoney] = useState<{ leagueId: string; season: LeagueSeason } | null>(null);
  const [planned, setPlanned] = useState<{ leagueId: string; plan: PayoutPlan } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    loadLeagueSeason(leagueId)
      .then((m) => {
        if (cancelled || !m) return;
        setMoney({ leagueId, season: m });
        setPlanned({ leagueId, plan: startingPlan(leagueId, m) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueId, wanted]);
  const asItStands = useAsItStands();
  const season = money?.season ?? null;
  const plan = planned?.plan ?? null;
  const shown = useMemo(() => (season && !asItStands ? finishedWeeksOnly(season) : season), [season, asItStands]);
  const ledger = useMemo(() => (shown && plan ? computePlanLedger(plan, shown.results) : null), [shown, plan]);
  const ready = money?.leagueId === leagueId && planned?.leagueId === leagueId && !!ledger;
  const onPlanChange = useCallback(
    (next: PayoutPlan) => {
      setPlanned({ leagueId, plan: next });
      savePayoutPlan(leagueId, next);
    },
    [leagueId]
  );
  return { shown, plan, ledger, ready, onPlanChange };
}

/**
 * The payouts as part of the room's floor, for league `leagueId` (see the top of this file): the board across `floor`
 * (screen px, its foot at `bottom`), its title at `title`, what's under it — the legend, the totals, the rules'
 * editor — on the floor in front of it. A drag (or a scroll) moves the floor along under you. While it's drawn the
 * room's own floor grid is put away (`onAway`), this drawing it instead.
 */
export function PayoutStage({
  open,
  leagueId,
  currentWeek,
  room,
  title,
  floor,
  back,
  atBottom,
  onClose,
  onAway,
}: {
  open: boolean;
  leagueId: string;
  currentWeek: number | null;
  room: { width: number; height: number };
  title: { top: string; left: number; width: number };
  floor: { bottom: number; left: number; width: number };
  back?: boolean;
  /** The board and what's under it kept down at the floor's foot (see FloorPayouts). */
  atBottom?: boolean;
  onClose: () => void;
  onAway: (away: boolean) => void;
}) {
  const { shown, plan, ledger, ready, onPlanChange } = usePayouts(leagueId, open);

  // How far in it is, 0 to 1, run toward where it's headed from wherever it is (so closing part way turns it back).
  const [p, setP] = useState(0);
  const now = useRef(0);
  useEffect(() => {
    const target = open ? (ready ? 1 : LOOKED) : 0;
    const from = now.current;
    if (from === target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? 1 : (target > from ? OPEN_MS : CLOSE_MS) * Math.abs(target - from);
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      start ??= t;
      const k = Math.min(1, (t - start) / ms);
      now.current = lerp(from, target, k);
      setP(now.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, ready]);
  const drawn = open || p > 0;
  useEffect(() => {
    onAway(drawn);
  }, [drawn, onAway]);
  useEffect(() => () => onAway(false), [onAway]);

  if (!drawn) return null;
  return (
    <FloorPayouts
      p={p}
      open={open}
      room={room}
      title={title}
      floor={floor}
      back={back}
      atBottom={atBottom}
      onClose={onClose}
      currentWeek={currentWeek}
      data={shown && plan && ledger ? { season: shown, plan, ledger, onPlanChange } : null}
    />
  );
}

function FloorPayouts({
  p,
  open,
  room,
  title,
  floor,
  back,
  atBottom = false,
  onClose,
  currentWeek,
  data,
}: {
  p: number;
  open: boolean;
  room: { width: number; height: number };
  title: { top: string; left: number; width: number };
  floor: { bottom: number; left: number; width: number };
  back?: boolean;
  atBottom?: boolean;
  onClose: () => void;
  currentWeek: number | null;
  data: { season: LeagueSeason; plan: PayoutPlan; ledger: ReturnType<typeof computePlanLedger>; onPlanChange: (plan: PayoutPlan) => void } | null;
}) {
  const id = useId().replace(/:/g, "");
  const { width: RW, height: RH } = room;
  // Each step in turn: looking down, the floor sinking in (leaving the cubes), the words and amounts coming in.
  const look = easeInOut(clamp01(p / LOOKED));
  const sink = easeInOut(clamp01((p - 0.42) / 0.36));
  const labels = clamp01((p - 0.78) / 0.22);
  const titleIn = clamp01((p - 0.15) / 0.2);

  // Where the title ends on the screen: the room's horizon goes just under it.
  const [titleBox, setTitleBox] = useState<HTMLDivElement | null>(null);
  const [titleBottom, setTitleBottom] = useState(100);
  useLayoutEffect(() => {
    if (!titleBox) return;
    const measure = () => setTitleBottom(titleBox.getBoundingClientRect().bottom);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(titleBox);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [titleBox]);

  // The board's size, in its own px, once it's laid out; and what's under it, on the screen.
  const [layout, setLayout] = useState<{ W: number; depth: number; tray: BoardTray | null }>({ W: Math.min(floor.width, BOARD_MOST_PX), depth: 500, tray: null });
  const onLayout = useCallback(
    (W: number, depth: number, tray: BoardTray) =>
      setLayout((was) =>
        was.W === W && was.depth === depth && was.tray && (["x0", "x1", "y0", "y1", "deep"] as const).every((k) => was.tray![k] === tray[k]) ? was : { W, depth, tray }
      ),
    []
  );
  const [info, setInfo] = useState<HTMLDivElement | null>(null);
  const [infoH, setInfoH] = useState(0);
  useLayoutEffect(() => {
    if (!info) return;
    const measure = () => setInfoH(info.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(info);
    return () => observer.disconnect();
  }, [info]);

  // Looked down: laid back VIEW_TILT under a perspective for the board's size, hinged just under the title — the board
  // drawn at the zoom (floor px per board px) that shows its near edge at its own size.
  const { W, depth, tray } = layout;
  const finalP = Math.max(LEAST_PERSPECTIVE, PERSPECTIVE_PER_DEPTH * depth);
  const fullZoom = finalP / (finalP + depth * VIEW_SIN);
  // Kept to the bottom (`atBottom`): what's under the board down at the floor's foot, the board just over it — made
  // smaller to fit there, between it and the title, and across the floor — and whatever room's left over above it.
  const VIEW_COS = Math.cos((VIEW_TILT * Math.PI) / 180);
  const fullDeep = depth * fullZoom;
  const highest = titleBottom + UNDER_TITLE;
  const boardFoot = floor.bottom - infoH - INFO_GAP;
  let fit = 1;
  if (atBottom) {
    // How tall (and wide) the board shows at fit m: its near edge m * fullDeep back, seen under finalP.
    const room = Math.max(40, boardFoot - highest);
    const byHeight = room / (fullDeep * VIEW_COS + (room * fullDeep * VIEW_SIN) / finalP);
    const byWidth = floor.width / (W * fullZoom + (floor.width * fullDeep * VIEW_SIN) / finalP);
    // Bigger than its own size, too, where there's the room for it.
    fit = Math.max(0.45, Math.min(MOST_FIT, byHeight, byWidth));
  }
  const zoom = fullZoom * fit;
  const deep = depth * zoom;
  const boardTall = (deep * VIEW_COS * finalP) / (finalP - deep * VIEW_SIN);
  const finalPose: Pose = { tilt: VIEW_TILT, P: finalP, hinge: atBottom ? Math.max(highest, boardFoot - boardTall) : highest };
  const pose: Pose = { tilt: lerp(FLOOR_TILT, finalPose.tilt, look), P: lerp(PERSPECTIVE_PX, finalPose.P, look), hinge: lerp(RH * HORIZON_SHARE, finalPose.hinge, look) };
  const clipTop = lerp(RH * HORIZON_SHARE, finalPose.hinge - OVER_HINGE, look);

  // Where the board lies: straight below, in the middle of the screen, if it fits on `floor` at its near edge; else
  // from the floor's left (to be moved along).
  const near = finalPose.P / (finalPose.P - deep * VIEW_SIN);
  const onScreen = W * zoom * near;
  const fits = onScreen <= floor.width;
  const home = fits ? 0 : (floor.left - RW / 2) / near + (W * zoom) / 2;

  // How far the floor's been moved under you (floor px): across, and back (pulled back, it's negative).
  // (It starts again from where the board first lies each time it opens: this is only drawn while it's open.)
  const [pan, setPan] = useState({ x: 0, d: 0 });
  const limits = useMemo(() => {
    const minX = fits ? 0 : -(onScreen - floor.width) / near;
    const want = depthAt(finalPose, floor.bottom - 8 - INFO_GAP - infoH);
    // Kept to the bottom, it's all on screen already: nothing to move it back for.
    const minD = atBottom ? 0 : want == null ? -deep : Math.max(-deep - 200, Math.min(0, want - deep));
    return { minX, minD };
    // finalPose is made fresh each render from the values listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fits, onScreen, floor.width, floor.bottom, near, infoH, deep, finalPose.P, finalPose.hinge, atBottom]);
  const clampPan = useCallback(
    (x: number, d: number) => ({ x: Math.min(0, Math.max(limits.minX, x)), d: Math.min(0, Math.max(limits.minD, d)) }),
    [limits]
  );
  // Kept inside as the board or what's under it changes size. The floor's grid moves only as the floor's moved; the
  // board lies where it lies on it.
  const panned = clampPan(pan.x, pan.d);
  const offX = panned.x;
  const offD = panned.d;
  const boardX = home + offX;

  // A drag (or a scroll) moves the floor along with it: as far across as it went at the middle of the screen, and
  // as far back as that is on the floor there.
  const move = useCallback(
    (dx: number, dy: number) => {
      const mid = depthAt(finalPose, (finalPose.hinge + floor.bottom) / 2) ?? 0;
      const [, , s] = seen(finalPose, RW, 0, mid);
      const a = (finalPose.tilt * Math.PI) / 180;
      setPan((was) => clampPan(was.x + dx / s, was.d + dy / (Math.cos(a) * s * s)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clampPan, finalPose.P, finalPose.hinge, floor.bottom, RW]
  );
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a, label")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    move(e.clientX - d.x, e.clientY - d.y);
    drag.current = { id: d.id, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => move(-e.deltaX, -e.deltaY);

  // The floor's grid, as the room's own (see FloorGrid) at the start, moved along with the board.
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const wire = 1 / dpr;
  const snap = (y: number) => (Math.floor(y * dpr) + 0.5) / dpr;
  const dTop = depthAt(pose, clipTop) ?? -10 * GRID_PX;
  const dBottom = depthAt(pose, RH) ?? 0;
  const rows: { y: number; first: boolean }[] = [];
  for (let n = Math.ceil((dTop - offD) / GRID_PX); n * GRID_PX + offD <= dBottom; n++) {
    const d = n * GRID_PX + offD;
    rows.push({ y: seen(pose, RW, 0, d)[1], first: Math.abs(d) < 1e-6 });
  }
  const sTop = seen(pose, RW, 0, dTop)[2];
  const columns: string[] = [];
  for (let k = Math.ceil((-RW / 2 / sTop - offX) / GRID_PX - 0.5); k <= Math.floor((RW / 2 / sTop - offX) / GRID_PX - 0.5); k++) {
    const across = (k + 0.5) * GRID_PX + offX;
    const [x1, y1] = seen(pose, RW, across, dTop);
    const [x2, y2] = seen(pose, RW, across, dBottom);
    columns.push(`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }
  // Faded toward the horizon as the room's floor is, the haze clearing as it looks down.
  const far = lerp(FAR_OPACITY, 1, look);
  const fullDepth = RH * FULL_DEPTH_SHARE;
  const fadeStops = Array.from({ length: 9 }, (_, i) => {
    const d = dTop + ((dBottom - dTop) * i) / 8;
    const y = seen(pose, RW, 0, d)[1];
    const opacity = Math.min(1, far + (1 - far) * (Math.max(0, d) / fullDepth));
    return { offset: clamp01((y - clipTop) / Math.max(1, RH - clipTop)), opacity: LINE_OPACITY * opacity };
  });
  const path =
    rows
      .filter((r) => !r.first)
      .map((r) => `M0 ${snap(r.y).toFixed(2)}H${RW}`)
      .join("") + columns.join("");
  const hingeRow = rows.find((r) => r.first);

  // Where a board point (its own px) is on the floor.
  const onFloorAt = (x: number, y: number, h = 0) => [(x - W / 2) * zoom + boardX, y * zoom + offD, h * zoom] as const;
  const projector = useCallback(
    (bw: number) =>
      (x: number, y: number, h = 0): [number, number, number] => {
        const [sx, sy, s] = seen(pose, RW, (x - bw / 2) * zoom + boardX, y * zoom + offD, h * zoom);
        return [sx, sy, s * zoom];
      },
    // A new one every frame it moves, as it should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pose.tilt, pose.P, pose.hinge, boardX, offD, RW, zoom]
  );
  const cameraX = useCallback((bw: number) => bw / 2 - boardX / zoom, [boardX, zoom]);
  const nearY = seen(pose, RW, 0, deep + offD)[1];

  // The floor sunk in where the board's tray is: its opening cut out of the floor's grid, and the grid carried on down
  // inside it — down the back and side walls, and across its bottom.
  const hole = tray && sink > 0 ? tray : null;
  const pt = (across: number, d: number, h = 0) => {
    const [x, y] = seen(pose, RW, across, d, h);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  let opening = "";
  let sunkPath = "";
  if (hole) {
    const [a0, d0] = onFloorAt(hole.x0, hole.y0);
    const [a1, d1] = onFloorAt(hole.x1, hole.y1);
    const h = -hole.deep * sink * zoom;
    opening = `M${pt(a0, d0)}L${pt(a1, d0)}L${pt(a1, d1)}L${pt(a0, d1)}Z`;
    const parts: string[] = [];
    // Across: on each side wall, then over the bottom.
    for (let n = Math.ceil((d0 - offD) / GRID_PX); n * GRID_PX + offD <= d1; n++) {
      const d = n * GRID_PX + offD;
      parts.push(`M${pt(a0, d)}L${pt(a0, d, h)}L${pt(a1, d, h)}L${pt(a1, d)}`);
    }
    // Back: down the back wall, then along the bottom.
    for (let k = Math.ceil((a0 - offX) / GRID_PX - 0.5); (k + 0.5) * GRID_PX + offX <= a1; k++) {
      const a = (k + 0.5) * GRID_PX + offX;
      parts.push(`M${pt(a, d0)}L${pt(a, d0, h)}L${pt(a, d1, h)}`);
    }
    // The bottom's edges.
    parts.push(`M${pt(a0, d0, h)}L${pt(a1, d0, h)}M${pt(a0, d0, h)}L${pt(a0, d1, h)}M${pt(a1, d0, h)}L${pt(a1, d1, h)}`);
    sunkPath = parts.join("");
  }

  const [stacked, setStacked] = useState(false);
  const board = data
    ? boardData({
        ledger: data.ledger,
        plan: data.plan,
        lastWeek: data.season.results.lastWeek,
        currentWeek,
        finishedThrough: data.season.finishedThrough,
        teamNames: data.season.teamNames,
      })
    : null;
  const live = labels > 0.5;
  // What's under the board, as wide as it (in the middle, where it fits) or the floor.
  const infoWidth = fits ? Math.max(Math.min(floor.width, onScreen), Math.min(floor.width, 360)) : floor.width;
  const infoLeft = fits ? RW / 2 - infoWidth / 2 : floor.left;

  return (
    <>
      <svg className="pointer-events-none fixed inset-0 h-full w-full" style={{ zIndex: -1 }} aria-hidden={!data || undefined}>
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={0} y={clipTop} width={RW} height={Math.max(0, RH - clipTop)} />
          </clipPath>
          {hole ? (
            <>
              <mask id={`${id}-hole`} maskUnits="userSpaceOnUse" x={0} y={0} width={RW} height={RH}>
                <rect x={0} y={0} width={RW} height={RH} fill="white" />
                <path d={opening} fill="black" />
              </mask>
              <clipPath id={`${id}-in`}>
                <path d={opening} />
              </clipPath>
            </>
          ) : null}
          <linearGradient id={`${id}-fade`} gradientUnits="userSpaceOnUse" x1="0" y1={clipTop} x2="0" y2={RH}>
            {fadeStops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor="var(--ink-primary)" stopOpacity={s.opacity} />
            ))}
          </linearGradient>
          <linearGradient id={`${id}-horizon`} gradientUnits="userSpaceOnUse" x1="0" x2={RW} y1="0" y2="0">
            <stop offset="0" stopColor="var(--ink-primary)" stopOpacity="0" />
            <stop offset="0.2" stopColor="var(--ink-primary)" stopOpacity={HORIZON_OPACITY} />
            <stop offset="0.8" stopColor="var(--ink-primary)" stopOpacity={HORIZON_OPACITY} />
            <stop offset="1" stopColor="var(--ink-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* The light at the back of the room (see .grid-room), out of sight as the room looks down. */}
        <rect x={0} y={0} width={RW} height={RH} fill="var(--page)" opacity={look} />
        {/* The horizon, gone as the room looks down past it; the line across the hinge taking its place. */}
        <line x1={0} x2={RW} y1={snap(pose.hinge)} y2={snap(pose.hinge)} stroke={`url(#${id}-horizon)`} strokeWidth={wire} opacity={1 - look} />
        <g clipPath={`url(#${id}-clip)`}>
          <path d={path} stroke={`url(#${id}-fade)`} strokeWidth={wire} fill="none" mask={hole ? `url(#${id}-hole)` : undefined} />
          {hole ? <path d={sunkPath} stroke={`url(#${id}-fade)`} strokeWidth={wire} fill="none" clipPath={`url(#${id}-in)`} /> : null}
          {hingeRow ? (
            <line x1={0} x2={RW} y1={snap(hingeRow.y)} y2={snap(hingeRow.y)} stroke="var(--ink-primary)" strokeOpacity={LINE_OPACITY * far} strokeWidth={wire} opacity={look} />
          ) : null}
          {data && board ? (
            <PayoutBoard
              rows={board.rows}
              weeks={board.weeks}
              regularSeasonWeeks={data.season.results.regularSeasonWeeks}
              hasSeason={board.hasSeason}
              stacked={stacked}
              onFloor={{ width: Math.min(floor.width, BOARD_MOST_PX), projector, cameraX, sink, labels, onLayout }}
            />
          ) : null}
        </g>
      </svg>
      {/* Where a drag moves the floor along. */}
      <div
        className={`fixed z-[5] touch-none ${live ? "" : "pointer-events-none"}`}
        style={{ top: finalPose.hinge - OVER_HINGE, height: Math.max(0, floor.bottom - finalPose.hinge + OVER_HINGE), left: floor.left, width: floor.width }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />
      <div data-floor-ui className="fixed z-[7]" style={{ top: title.top, left: title.left, width: title.width, opacity: titleIn }} ref={setTitleBox}>
        <FloorTitle title="Payouts" onClose={onClose} back={back} />
      </div>
      {/* On the floor in front of the board: the legend, the totals, the rules' editor — moved along with it. */}
      {data ? (
        <div
          data-floor-ui
          className={`fixed z-[6] overflow-hidden touch-none ${live ? "" : "pointer-events-none"}`}
          style={{ top: finalPose.hinge - OVER_HINGE, bottom: RH - floor.bottom, left: infoLeft, width: infoWidth, opacity: labels }}
          inert={!live}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <div
            ref={setInfo}
            className="absolute inset-x-0 flex flex-col gap-4 bg-page/80 px-1 py-2 backdrop-blur-[2px]"
            style={{
              ...(atBottom ? { bottom: 0 } : { top: nearY + INFO_GAP - (finalPose.hinge - OVER_HINGE) }),
              transform: `translateY(${(1 - labels) * 8}px)`,
            }}
          >
            <PayoutLegend ledger={data.ledger} plan={data.plan} regularSeasonWeeks={data.season.results.regularSeasonWeeks} />
            <div className="border-t border-grid pt-3">
              <PayoutTotals
                season={data.season}
                plan={data.plan}
                ledger={data.ledger}
                stacked={stacked}
                onStack={() => setStacked((s) => !s)}
                onPlanChange={data.onPlanChange}
              />
            </div>
          </div>
        </div>
      ) : open && p >= LOOKED - 0.001 ? (
        <p className="fixed z-[6] text-sm text-ink-secondary" style={{ top: finalPose.hinge + 8, left: floor.left, width: floor.width }}>
          Loading payouts…
        </p>
      ) : null}
    </>
  );
}
