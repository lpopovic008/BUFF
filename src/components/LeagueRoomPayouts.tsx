"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FAR_OPACITY, FULL_DEPTH_SHARE, HORIZON_OPACITY, LINE_OPACITY } from "@/components/FloorGrid";
import { FloorTitle } from "@/components/LeagueRoomStages";
import { PayoutLegend, PayoutTotals, boardData } from "@/components/MoneyBoard";
import { PAYOUT_BOARD_TILT, PayoutBoard } from "@/components/PayoutBoard";
import { useAsItStands } from "@/hooks/useAsItStands";
import { BOARD_FOCAL_PER_DEPTH } from "@/lib/board-3d";
import { FLOOR_TILT, GRID_PX, HORIZON_SHARE, PERSPECTIVE_PX } from "@/lib/grid-room";
import { finishedWeeksOnly, loadLeagueSeason, LeagueSeason, startingPlan } from "@/lib/league-money";
import { savePayoutPlan } from "@/lib/localStore";
import { computePlanLedger, PayoutPlan } from "@/lib/payout-plan";

// The payouts as part of the League Room's floor. Opened, the room looks down at its floor until it's seen at the
// payout board's own angle (see PayoutBoard); the floor sinks in where the board's tray is, the board's words fade
// in, and its cubes sprout up out of it. Closed, it all goes back the way it came.
//
// The room's floor (grid-room.ts) is hinged at the horizon and laid back FLOOR_TILT under a perspective of
// PERSPECTIVE_PX. Looking down is that same floor swung up about its hinge to the board's tilt, the perspective
// easing to the board's own and the hinge rising to the top of the screen — the room's floor at the start, the
// board's view of itself at the end, so nothing jumps either side.

/** How long the whole thing takes to come in (ms), and to go. */
const OPEN_MS = 3000;
const CLOSE_MS = 1400;
/** How far through coming in it's looked down — where it waits until the payouts have loaded. */
const LOOKED = 0.35;
/** How far the board's tilt sinks its far end, over its near edge's (see boardProjector): the board drawn at this
 * zoom on the floor (floor px per board px), its near edge shows at its own size. */
const BOARD_SIN = Math.sin((PAYOUT_BOARD_TILT * Math.PI) / 180);
const BOARD_ZOOM = BOARD_FOCAL_PER_DEPTH / (BOARD_FOCAL_PER_DEPTH + BOARD_SIN);
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
  onClose: () => void;
  currentWeek: number | null;
  data: { season: LeagueSeason; plan: PayoutPlan; ledger: ReturnType<typeof computePlanLedger>; onPlanChange: (plan: PayoutPlan) => void } | null;
}) {
  const id = useId().replace(/:/g, "");
  const { width: RW, height: RH } = room;
  // Each step in turn: looking down, the floor sinking, the words coming in, the cubes sprouting.
  const look = easeInOut(clamp01(p / LOOKED));
  const sink = easeInOut(clamp01((p - 0.33) / 0.17));
  const labels = clamp01((p - 0.46) / 0.14);
  const rise = clamp01((p - 0.52) / 0.48);
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
  const [layout, setLayout] = useState({ W: floor.width, depth: 500 });
  const onLayout = useCallback((W: number, depth: number) => setLayout((was) => (was.W === W && was.depth === depth ? was : { W, depth })), []);
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

  // Looked down: at the board's tilt, under the perspective that shows it as it sees itself (its near edge its own
  // size), hinged just under the title.
  const { W, depth } = layout;
  const deep = depth * BOARD_ZOOM;
  const finalPose: Pose = { tilt: PAYOUT_BOARD_TILT, P: (BOARD_FOCAL_PER_DEPTH + BOARD_SIN) * depth * BOARD_ZOOM, hinge: titleBottom + UNDER_TITLE };
  const pose: Pose = { tilt: lerp(FLOOR_TILT, finalPose.tilt, look), P: lerp(PERSPECTIVE_PX, finalPose.P, look), hinge: lerp(RH * HORIZON_SHARE, finalPose.hinge, look) };
  const clipTop = lerp(RH * HORIZON_SHARE, finalPose.hinge - OVER_HINGE, look);

  // Where the board lies: centred on `floor` if it fits there at its near edge, else from its left (to be moved along).
  const near = finalPose.P / (finalPose.P - deep * BOARD_SIN);
  const onScreen = W * BOARD_ZOOM * near;
  const fits = onScreen <= floor.width;
  const home = fits ? (floor.left + floor.width / 2 - RW / 2) / near : (floor.left - RW / 2) / near + (W * BOARD_ZOOM) / 2;

  // How far the floor's been moved under you (floor px): across, and back (pulled back, it's negative).
  // (It starts again from where the board first lies each time it opens: this is only drawn while it's open.)
  const [pan, setPan] = useState({ x: 0, d: 0 });
  const limits = useMemo(() => {
    const minX = fits ? 0 : -(onScreen - floor.width) / near;
    const want = depthAt(finalPose, floor.bottom - 8 - INFO_GAP - infoH);
    const minD = want == null ? -deep : Math.max(-deep - 200, Math.min(0, want - deep));
    return { minX, minD };
    // finalPose is made fresh each render from the values listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fits, onScreen, floor.width, floor.bottom, near, infoH, deep, finalPose.P, finalPose.hinge]);
  const clampPan = useCallback(
    (x: number, d: number) => ({ x: Math.min(0, Math.max(limits.minX, x)), d: Math.min(0, Math.max(limits.minD, d)) }),
    [limits]
  );
  // Kept inside as the board or what's under it changes size.
  const panned = clampPan(pan.x, pan.d);
  const offX = (home + panned.x) * look;
  const offD = panned.d * look;

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

  const projector = useCallback(
    (bw: number) =>
      (x: number, y: number, h = 0): [number, number, number] => {
        const [sx, sy, s] = seen(pose, RW, (x - bw / 2) * BOARD_ZOOM + offX, y * BOARD_ZOOM + offD, h * BOARD_ZOOM);
        return [sx, sy, s * BOARD_ZOOM];
      },
    // A new one every frame it moves, as it should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pose.tilt, pose.P, pose.hinge, offX, offD, RW]
  );
  const nearY = seen(pose, RW, 0, deep + offD)[1];

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

  return (
    <>
      <svg className="pointer-events-none fixed inset-0 h-full w-full" style={{ zIndex: -1 }} aria-hidden={!data || undefined}>
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={0} y={clipTop} width={RW} height={Math.max(0, RH - clipTop)} />
          </clipPath>
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
          <path d={path} stroke={`url(#${id}-fade)`} strokeWidth={wire} fill="none" />
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
              onFloor={{ width: floor.width, projector, sink, labels, rise, onLayout }}
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
          style={{ top: finalPose.hinge - OVER_HINGE, bottom: RH - floor.bottom, left: floor.left, width: floor.width, opacity: labels }}
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
            style={{ top: nearY + INFO_GAP - (finalPose.hinge - OVER_HINGE), transform: `translateY(${(1 - labels) * 8}px)` }}
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
