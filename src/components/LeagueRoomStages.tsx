"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui/Icon";
import { CloseButton, FloorTile, FloorTiles } from "@/components/LeagueRoomFloor";
import { FLOOR_RISE_MS, SeasonLine } from "@/components/FloorCareer";
import { MatchupGraph, MatchupSide } from "@/components/MatchupGraph";
import type { LineupNumbers } from "@/components/PlayerCareer";
import { collegeLogo } from "@/lib/college-logos";
import { nflLogoUrl } from "@/lib/nfl-logos";
import { ordinal } from "@/lib/format";
import { playerHeadshotUrl } from "@/lib/sleeper";
import { CareerWeek, getCareer, getSeasonWeeks, seasonPoints, seasonRank } from "@/lib/career-stats";
import { FLOOR_TILT, floorDepth, floorPoint, floorScale, floorY, HORIZON_SHARE, PERSPECTIVE_PX } from "@/lib/grid-room";
import { LIST_MOVE, listPosition, useListScroll } from "@/hooks/useListScroll";
import { getPlayerBio, PlayerBio, ResolvedPlayer } from "@/lib/players";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import type { ResolvedSlot } from "@/hooks/useLeagueMatchupCarousel";
import type { NFLGame } from "@/lib/nfl-schedule";
import type { Span } from "@/lib/matchup-timeline";

/** How long a stage takes to come in, or go (ms) — as the room's panels rise. */
export const STAGE_MS = 450;

/**
 * Where a full-room stage goes (the bench's, the score graph's): on the back wall where the lineups were (`wall`, as
 * CSS), and on the floor in front (`floor`, screen px) — in a room `room` big.
 */
export interface StagePlaces {
  wall: React.CSSProperties;
  floor: { top: number; bottom: number; left: number; width: number };
  room: { width: number; height: number };
}

/** In (or on its way), and drawn at all: kept drawn while it goes. */
export function useStageShown(open: boolean) {
  const [up, setUp] = useState(false);
  const [drawn, setDrawn] = useState(open);
  useEffect(() => {
    if (open) {
      const show = requestAnimationFrame(() => {
        setDrawn(true);
        requestAnimationFrame(() => setUp(true));
      });
      return () => cancelAnimationFrame(show);
    }
    const hide = requestAnimationFrame(() => setUp(false));
    const gone = window.setTimeout(() => setDrawn(false), STAGE_MS);
    return () => {
      cancelAnimationFrame(hide);
      window.clearTimeout(gone);
    };
  }, [open]);
  return { up, drawn: drawn || open };
}

/** A stage's title on the floor, upright across its top: what it is, what's shown, and its way out (and back). */
function FloorTitle({ title, sub, onClose, back, extra }: { title: string; sub?: string; onClose: () => void; back?: boolean; extra?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-1 border border-ink-primary bg-page/70 px-1.5 py-1 backdrop-blur-[3px]">
      {back ? (
        <button type="button" onClick={onClose} aria-label="Back" title="Back" className="-ml-0.5 flex h-6 w-6 items-center justify-center text-ink-secondary transition-colors hover:text-ink-primary">
          <ChevronLeftIcon width={16} height={16} />
        </button>
      ) : null}
      <h2 className="min-w-0 truncate text-xs font-bold uppercase tracking-wide text-ink-primary">
        {title}
        {sub ? <span className="font-semibold text-ink-secondary"> · {sub}</span> : null}
      </h2>
      {extra}
      <span className={extra ? "flex" : "ml-auto flex"}>
        <CloseButton onClose={onClose} label={`Close ${title.toLowerCase()}`} />
      </span>
    </div>
  );
}

/** Where `el` is on the screen — measured as it changes size, and as the window does. */
function useScreenBox(el: HTMLElement | null) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((was) => (was && was.left === r.left && was.top === r.top && was.width === r.width && was.height === r.height ? was : { left: r.left, top: r.top, width: r.width, height: r.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [el]);
  return box;
}

/** Split into rows of at most `per`. */
const rowsOf = <T,>(items: T[], per: number): T[][] => Array.from({ length: Math.ceil(items.length / per) }, (_, i) => items.slice(i * per, (i + 1) * per));

/**
 * The score graph as a stage: the whole of it on the back wall, where the lineups were — and on the floor in front,
 * a tile for each of the week's kickoff blocks (Thursday night, Sunday 1:00...), picked to spread just that block
 * across the graph, its scoring plays marked to step through (the ‹ › tiles, the arrow keys, or a drag along it), and
 * a tile for the whole week again.
 */
export function RoomGraph({
  places,
  up,
  onClose,
  back,
  mine,
  theirs,
  weekGames,
  scoring,
}: {
  places: StagePlaces;
  up: boolean;
  onClose: () => void;
  back?: boolean;
  mine: MatchupSide;
  theirs: MatchupSide | null;
  weekGames: NFLGame[];
  scoring?: Record<string, number>;
}) {
  const [blocks, setBlocks] = useState<(Span & { label: string })[]>([]);
  const [focus, setFocus] = useState<(Span & { label: string }) | null>(null);
  const step = useRef<((by: -1 | 1) => void) | null>(null);
  const { floor, room } = places;
  // Three to a row on a phone, more wider.
  const per = floor.width < 520 ? 3 : 5;
  const blockTiles: FloorTile[] = blocks.map((b) => ({
    key: String(b.from),
    label: b.label,
    title: `Zoom into the ${b.label} games`,
    on: focus?.from === b.from,
    onPick: () => setFocus(focus?.from === b.from ? null : b),
  }));
  const controls: FloorTile[] = [
    { key: "prev", label: "‹ Play", title: "The play before", disabled: !focus, onPick: () => step.current?.(-1) },
    { key: "all", label: "Whole week", title: "The whole week again", on: !focus, onPick: () => setFocus(null) },
    { key: "next", label: "Play ›", title: "The next play", disabled: !focus, onPick: () => step.current?.(1) },
  ];
  const TITLE_H = 36;
  return (
    <>
      {/* The graph on the back wall. */}
      <div
        data-floor-ui
        className={`fixed z-[6] flex flex-col transition-[opacity,transform] ease-out ${up ? "opacity-100" : "translate-y-2 opacity-0"}`}
        style={{ ...places.wall, transitionDuration: `${STAGE_MS}ms` }}
      >
        <MatchupGraph mine={mine} theirs={theirs} weekGames={weekGames} scoring={scoring} focus={focus} onBlocks={setBlocks} stepRef={step} />
      </div>
      {/* Its title and tiles on the floor. */}
      <div
        data-floor-ui
        className={`fixed z-[7] transition-opacity ease-out ${up ? "opacity-100" : "opacity-0"}`}
        style={{ top: floor.top, left: floor.left, width: floor.width, transitionDuration: `${STAGE_MS}ms` }}
      >
        <FloorTitle title="Score graph" sub={focus ? focus.label : "Whole week"} onClose={onClose} back={back} />
      </div>
      <div className={`transition-opacity ease-out ${up ? "opacity-100" : "pointer-events-none opacity-0"}`} style={{ transitionDuration: `${STAGE_MS}ms` }}>
        <FloorTiles
          label="Zoom into the graph"
          rows={[...rowsOf(blockTiles, per), controls]}
          room={room}
          top={floor.top + TITLE_H + 6}
          bottom={floor.bottom}
          left={floor.left}
          right={floor.left + floor.width}
        />
      </div>
    </>
  );
}

/** "6'2\"" from inches. */
const feet = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;

/** His college's logo (see collegeLogo) — its name instead, small, if there's none to show. */
function CollegeMark({ college }: { college: string | null }) {
  const [logo, setLogo] = useState<{ college: string; src: string | null } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!college) return;
    let cancelled = false;
    collegeLogo(college).then((src) => !cancelled && setLogo({ college, src }));
    return () => {
      cancelled = true;
    };
  }, [college]);
  if (!college) return null;
  const src = logo?.college === college ? logo.src : null;
  if (src && failed !== src) {
    // eslint-disable-next-line @next/next/no-img-element -- a remote ESPN logo on a static export
    return <img src={src} alt={college} title={college} onError={() => setFailed(src)} className="h-9 w-9 shrink-0 object-contain sm:h-11 sm:w-11" />;
  }
  return <span className="max-w-[5rem] shrink-0 text-right text-[0.625rem] font-bold uppercase leading-tight text-ink-secondary">{college}</span>;
}

/**
 * Who a player is, across the top of his stage, in two lines: his photo over his team's logo beside them both; his
 * name and position, and his way out at the end of that line; under them his height and weight (and number). On the
 * right, each two lines level with those two: his trade-value rank over his season rank, his age over his years in
 * the league, and his college's logo between the two.
 */
function PlayerHeader({ player, bio, numbers, onClose }: { player: ResolvedPlayer; bio: PlayerBio | null; numbers: LineupNumbers | null; onClose: () => void }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const size = bio?.height && bio.weight ? `${feet(bio.height)} ${bio.weight} lb` : null;
  const under = [size, bio?.number ? `#${bio.number}` : null].filter(Boolean).join(" · ");
  const years = bio?.yearsExp != null ? (bio.yearsExp === 0 ? "Rookie" : `${ordinal(bio.yearsExp + 1)} yr`) : null;
  const small = "whitespace-nowrap text-right text-[0.6875rem] font-semibold uppercase leading-tight";
  const rank = (value: number | null | undefined, className: string, label: string, said: string) =>
    value != null ? (
      <span className={small} title={said}>
        <span className={`font-extrabold ${className}`}>
          {player.position}
          {value}
        </span>
        <span className="sr-only"> {label}</span>
      </span>
    ) : (
      <span />
    );
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] grid-rows-[auto_auto] items-end gap-x-1.5 sm:gap-x-2.5">
      {/* His photo in front of his team's logo, both centered. */}
      <div className="relative row-span-2 h-14 w-14 self-center sm:h-16 sm:w-16">
        {player.team ? (
          // eslint-disable-next-line @next/next/no-img-element -- a static SVG on a static export
          <img src={nflLogoUrl(player.team)} alt={player.team} className="absolute inset-0 h-full w-full object-contain opacity-90" />
        ) : null}
        {photoFailed ? null : (
          // eslint-disable-next-line @next/next/no-img-element -- a remote Sleeper photo on a static export
          <img src={playerHeadshotUrl(player.playerId)} alt="" onError={() => setPhotoFailed(true)} className="absolute inset-[8%] h-[84%] w-[84%] object-cover object-top" />
        )}
      </div>
      <h3 className="col-start-2 row-start-1 flex min-w-0 items-baseline gap-1.5 leading-tight text-ink-primary">
        <span className="truncate text-sm font-extrabold uppercase tracking-wide sm:text-xl">{player.name}</span>
        <span className={`shrink-0 text-sm font-extrabold ${POSITION_TEXT_COLOR[player.position] ?? "text-ink-secondary"}`}>{player.position}</span>
      </h3>
      <p className="col-start-2 row-start-2 truncate text-[0.6875rem] font-semibold uppercase leading-tight text-ink-secondary">{under}</p>
      {/* His trade-value rank over his season rank. */}
      <div className="col-start-3 row-start-1">
        {rank(numbers?.valueRank, "text-series-4", `${numbers?.dynasty ? "dynasty" : "redraft"} rank`, `${numbers?.dynasty ? "Dynasty" : "Redraft"} rank, by trade value`)}
      </div>
      <div className="col-start-3 row-start-2">{rank(numbers?.seasonRank, "text-series-1", "season rank", "Season rank, by points this season")}</div>
      {/* His age over his years in the league. */}
      <span className={`col-start-4 row-start-1 text-ink-secondary ${small}`}>{bio?.age ? `${bio.age} yrs` : ""}</span>
      <span className={`col-start-4 row-start-2 text-ink-secondary ${small}`}>{years ?? ""}</span>
      {/* His college, between the two. */}
      <div className="col-start-5 row-span-2 row-start-1 self-center">
        <CollegeMark college={bio?.college ?? null} />
      </div>
      {/* His way out, on his name's line. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${player.name}`}
        title="Close"
        className="col-start-6 row-start-1 flex h-7 w-6 items-center justify-center self-center text-xl font-bold leading-none text-ink-primary transition-transform active:scale-90"
      >
        ×
      </button>
    </div>
  );
}

/** A stat on the floor: its name, and its value from a game's (or a season's) stats. */
interface FloorStat {
  label: string;
  value: (stats: Record<string, number>) => number | undefined;
}
const stat = (label: string, key: string): FloorStat => ({ label, value: (s) => s[key] });
/** Each position's stats on the floor, a column each. */
const FLOOR_STATS: Record<string, FloorStat[]> = {
  QB: [stat("Pass", "pass_yd"), stat("TD", "pass_td"), stat("Int", "pass_int"), stat("Rush", "rush_yd")],
  RB: [stat("Rush", "rush_yd"), stat("Rec", "rec"), stat("Rec yd", "rec_yd"), { label: "TD", value: (s) => (s.rush_td ?? 0) + (s.rec_td ?? 0) }],
  WR: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("Yds", "rec_yd"), stat("TD", "rec_td")],
  TE: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("Yds", "rec_yd"), stat("TD", "rec_td")],
  K: [stat("FG", "fgm"), stat("FGA", "fga"), stat("XP", "xpm")],
  DEF: [stat("Sack", "sack"), stat("Int", "int"), stat("PA", "pts_allow")],
};

/** A game (or a season) of his — or a gap, a week he didn't play: a column at the back, a row on the floor. */
interface FloorColumn {
  key: string;
  /** Its fantasy points — null for a gap. */
  value: number | null;
  /** Its row on the floor: a team's logo (the opponent's, or his team's that season), its week (or year), and stats. */
  logo: string | null;
  tag: string;
  cells: string[];
  /** Read out for it, as a button — and, picked, in short along the floor's front. */
  label: string;
  short: string;
}

/** How far into the floor the columns stand from the horizon (px down the screen), and how deep each is (floor px). */
const COLUMN_FOOT_PX = 10;
const COLUMN_DEPTH = 8;

/**
 * His games (or seasons) as columns at the back of the room: standing on the floor at the horizon, rising up the
 * wall to `top` (screen y), across `left`..`right` — each as tall as his fantasy points, a gap for a week he didn't
 * play. Those whose rows are on the floor (`inView`) stand out; the picked one's lit. Each is a button (the arrow keys
 * move along them).
 */
function ColumnBars({
  columns,
  room,
  top,
  left,
  right,
  picked,
  inView,
  onPick,
  label,
}: {
  columns: FloorColumn[];
  room: { width: number; height: number };
  top: number;
  left: number;
  right: number;
  picked: number;
  inView: [number, number];
  onPick: (i: number) => void;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  const { width: W, height: H } = room;
  const yBase = H * HORIZON_SHARE + COLUMN_FOOT_PX;
  const dF = floorDepth(yBase, H);
  const dB = Math.max(0, dF - COLUMN_DEPTH);
  const sF = floorScale(dF);
  const sB = floorScale(dB);
  const yBack = floorPoint(0, dB, W, H)[1];
  const n = Math.max(1, columns.length);
  const a0 = (left + 4 - W / 2) / sF;
  const a1 = (right - 4 - W / 2) / sF;
  const slot = (a1 - a0) / n;
  const half = slot * 0.3;
  const tallest = Math.max(8, yBase - top - 16);
  const most = Math.max(1, ...columns.map((c) => c.value ?? 0));
  const best = Math.max(...columns.map((c) => c.value ?? -1));
  const pts = (ps: [number, number][]) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const x = (a: number, sc: number) => W / 2 + a * sc;
  return (
    <svg className="pointer-events-none fixed inset-0 z-[7] h-full w-full overflow-visible" role="group" aria-label={label}>
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="var(--ink-primary)" stopOpacity="0.14" />
          <stop offset="1" stopColor="var(--ink-primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* A pool of light on the floor where they stand. */}
      <ellipse cx={(left + right) / 2} cy={yBase + 4} rx={(right - left) * 0.5} ry={24} fill={`url(#${id}-glow)`} />
      {columns.map((c, i) => {
        const mid = a0 + slot * (i + 0.5);
        const [fl, fr, bl, br] = [x(mid - half, sF), x(mid + half, sF), x(mid - half, sB), x(mid + half, sB)];
        const slotL = x(a0 + slot * i, sF);
        const slotR = x(a0 + slot * (i + 1), sF);
        if (c.value === null) {
          // A week he didn't play: its footprint on the floor, empty.
          return <polygon key={c.key} points={pts([[fl, yBase], [fr, yBase], [br, yBack], [bl, yBack]])} fill="none" stroke="var(--ink-muted)" strokeOpacity={0.5} strokeDasharray="2 2" aria-hidden />;
        }
        const hF = Math.max(2, (tallest * Math.max(0, c.value)) / most);
        const hB = (hF * sB) / sF;
        const lit = i === picked;
        const near = i >= inView[0] && i <= inView[1];
        const right_ = (fl + fr) / 2 < W / 2;
        const narrow = slotR - slotL < 30;
        return (
          <g
            key={c.key}
            role="button"
            tabIndex={0}
            aria-label={c.label}
            aria-pressed={lit}
            data-col={i}
            className="group pointer-events-auto cursor-pointer outline-none"
            onClick={() => onPick(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick(i);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                e.stopPropagation();
                const by = e.key === "ArrowLeft" ? -1 : 1;
                let next = i + by;
                while (next >= 0 && next < columns.length && columns[next].value === null) next += by;
                if (next < 0 || next >= columns.length) return;
                onPick(next);
                e.currentTarget.parentElement?.querySelector<SVGGElement>(`[data-col="${next}"]`)?.focus();
              }
            }}
          >
            {/* The whole of its slot, to tap. */}
            <rect x={slotL} y={yBase - tallest - 16} width={slotR - slotL} height={tallest + 20} fill="transparent" />
            <g className="floor-bar" style={{ transformOrigin: `${(fl + fr) / 2}px ${yBase}px`, animationDelay: `${FLOOR_RISE_MS * 0.6 + i * 40}ms` }}>
              <polygon
                points={right_ ? pts([[fr, yBase], [br, yBack], [br, yBack - hB], [fr, yBase - hF]]) : pts([[fl, yBase], [bl, yBack], [bl, yBack - hB], [fl, yBase - hF]])}
                fill={lit || near ? "var(--ink-primary)" : "var(--ink-secondary)"}
                fillOpacity={lit ? 0.55 : near ? 0.3 : 0.12}
              />
              <polygon
                points={pts([[bl, yBack - hB], [br, yBack - hB], [fr, yBase - hF], [fl, yBase - hF]])}
                fill={lit || near ? "var(--ink-primary)" : "var(--ink-secondary)"}
                fillOpacity={lit ? 0.8 : near ? 0.45 : 0.2}
              />
              <polygon
                points={pts([[fl, yBase], [fr, yBase], [fr, yBase - hF], [fl, yBase - hF]])}
                fill={lit ? "var(--ink-primary)" : near ? "var(--ink-secondary)" : "var(--page)"}
                fillOpacity={lit ? 1 : near ? 0.45 : 0.45}
                stroke={lit || near ? "var(--ink-primary)" : "var(--ink-muted)"}
                strokeOpacity={lit || near ? 1 : 0.6}
                strokeWidth={1}
                strokeLinejoin="round"
                className="transition-[fill-opacity,stroke-opacity] duration-200"
              />
            </g>
            <rect
              x={slotL + 1}
              y={yBase - tallest - 16}
              width={slotR - slotL - 2}
              height={tallest + 16}
              fill="none"
              stroke="var(--ink-primary)"
              strokeDasharray="3 3"
              className="opacity-0 group-focus-visible:opacity-100"
            />
            <text
              x={(fl + fr) / 2}
              y={Math.min(yBase - hF, yBack - hB) - 4}
              textAnchor="middle"
              className={`floor-bar-label tabular-nums ${lit ? "fill-[var(--ink-primary)] font-extrabold" : near ? "fill-[var(--ink-primary)] font-semibold" : "fill-[var(--ink-muted)] font-semibold"}`}
              style={{ fontSize: narrow ? "0.5625rem" : "0.625rem", animationDelay: `${FLOOR_RISE_MS * 0.6 + i * 40 + 450}ms` }}
            >
              {c.value === best && best > 0 ? "★" : ""}
              {narrow && c.value >= 10 ? String(Math.round(c.value)) : c.value >= 100 ? String(Math.round(c.value)) : c.value.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The floor's table, in floor px: a row's depth; how far the table's first row is from the columns' foot. */
const ROW_DEPTH = 26;
const TABLE_GAP = 12;
/** How much the table's letters are drawn taller than wide, as a road's are, to read along a floor laid so far back. */
const FLOOR_LETTERING = 2.4;
/** The table reaches no nearer than where the floor's this many times as wide as at the horizon (its far rows legible). */
const TABLE_NEAR_SCALE = 3;
/** A screen px of drag moves the table this many floor px. */
const DRAG_TO_FLOOR = 1.6;

/** The floor's rows moved `off` floor px along it (on the graphics card, not re-rendered). */
function slideRows(el: HTMLElement | null, off: number) {
  if (el) el.style.transform = `translateY(${-off}px)`;
}
/** A scrolling box put at `top`, there and then. */
function scrollTo(el: HTMLElement, top: number) {
  el.scrollTop = top;
}

/**
 * His games (or seasons) as rows of a table lying on the floor in front of the columns — drawn in the room's own
 * perspective (laid back as the floor is, under the same lens: see grid-room.ts), its letters long as a road's are.
 * The column names along its near edge; the rows above, scrolled along the floor by a drag or a wheel — farther rows
 * smaller, nearer bigger. Tapping a row picks it. Tells `onView` which rows are on the floor as it moves, and scrolls
 * to bring row `bring.i` forward when asked.
 */
function FloorTable({
  columns,
  heads,
  room,
  left,
  right,
  picked,
  onPick,
  onView,
  bring,
}: {
  columns: FloorColumn[];
  heads: string[];
  room: { width: number; height: number };
  left: number;
  right: number;
  picked: number;
  onPick: (i: number) => void;
  onView: (range: [number, number]) => void;
  bring: { i: number; at: number } | null;
}) {
  const { width: W, height: H } = room;
  const horizon = H * HORIZON_SHARE;
  const yBase = horizon + COLUMN_FOOT_PX;
  // The table's band of floor, far edge to near.
  const dTop = floorDepth(yBase, H) + TABLE_GAP;
  const dNear = (PERSPECTIVE_PX / Math.sin((FLOOR_TILT * Math.PI) / 180)) * (1 - 1 / TABLE_NEAR_SCALE);
  const dBottom = Math.max(dTop + ROW_DEPTH * 3, dNear);
  const headDepth = ROW_DEPTH * 0.8;
  const band = dBottom - headDepth - dTop;
  // As wide as fits the screen at its nearest edge.
  const planeW = (right - left - 8) / floorScale(dBottom);
  const cols = heads.length;
  const grid = `1.3fr 0.9fr 1.1fr ${Array.from({ length: cols - 3 }, () => "1fr").join(" ")}`;
  const maxScroll = Math.max(0, columns.length * ROW_DEPTH - band);

  // Scrolled by a box over the table's stretch of screen, moved as an iPhone moves a list (see useListScroll).
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  useListScroll(scroller);
  const rowsRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<[number, number]>([-1, -1]);
  const onViewLatest = useRef(onView);
  useEffect(() => {
    onViewLatest.current = onView;
  });
  useEffect(() => {
    if (!scroller) return;
    const move = () => {
      // Fewer rows than fit: they sit along the near edge, by the column names.
      const off = listPosition(scroller) * DRAG_TO_FLOOR + Math.min(0, columns.length * ROW_DEPTH - band);
      slideRows(rowsRef.current, off);
      const first = Math.max(0, Math.floor(Math.max(0, off) / ROW_DEPTH));
      const last = Math.min(columns.length - 1, Math.floor((off + band - 1) / ROW_DEPTH));
      if (first !== viewRef.current[0] || last !== viewRef.current[1]) {
        viewRef.current = [first, last];
        onViewLatest.current([first, last]);
      }
    };
    // Starts with his latest nearest.
    scrollTo(scroller, maxScroll / DRAG_TO_FLOOR);
    move();
    scroller.addEventListener(LIST_MOVE, move);
    scroller.addEventListener("scroll", move, { passive: true });
    return () => {
      scroller.removeEventListener(LIST_MOVE, move);
      scroller.removeEventListener("scroll", move);
    };
  }, [scroller, columns.length, band, maxScroll]);
  // A column at the back tapped: its row brought forward, nearest but one.
  useEffect(() => {
    if (!bring || !scroller) return;
    const target = Math.min(maxScroll, Math.max(0, (bring.i + 2) * ROW_DEPTH - band));
    scroller.scrollTo({ top: target / DRAG_TO_FLOOR, behavior: "smooth" });
  }, [bring, scroller, maxScroll, band]);

  const yTop = floorY(dTop, H);
  const yBottom = floorY(dBottom, H);
  // A tap: the row under it, through the floor's lens.
  const tap = (e: React.MouseEvent) => {
    if (!scroller) return;
    const d = floorDepth(Math.max(e.clientY, horizon + 1), H);
    const i = Math.floor((d - dTop + listPosition(scroller) * DRAG_TO_FLOOR + Math.min(0, columns.length * ROW_DEPTH - band)) / ROW_DEPTH);
    if (i >= 0 && i < columns.length && columns[i].value !== null) onPick(i);
  };
  const cell = "flex items-center justify-center overflow-hidden whitespace-nowrap tabular-nums";
  const lettering = { transform: `scaleY(${FLOOR_LETTERING})` };
  return (
    <>
      {/* The table, laid on the floor: hinged at the horizon, laid back as the floor is, under its lens. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[7] overflow-hidden"
        style={{ perspective: `${PERSPECTIVE_PX}px`, perspectiveOrigin: `${W / 2}px ${horizon}px` }}
      >
        <div
          className="absolute"
          style={{ left: W / 2 - planeW / 2, top: horizon, width: planeW, height: dBottom, transformOrigin: "50% 0", transform: `rotateX(${FLOOR_TILT}deg)` }}
        >
          {/* The rows, fading out toward the back. */}
          <div
            className="absolute inset-x-0 overflow-hidden"
            style={{ top: dTop, height: band, maskImage: `linear-gradient(to bottom, transparent, black ${ROW_DEPTH * 1.5}px)` }}
          >
            <div ref={rowsRef} className="will-change-transform">
              {columns.map((c, i) => {
                const lit = i === picked;
                return (
                  <div
                    key={c.key}
                    className={`grid border-b border-ink-muted/30 ${lit ? "bg-ink-primary/10" : ""}`}
                    style={{ gridTemplateColumns: grid, height: ROW_DEPTH, fontSize: 7 }}
                  >
                    <span className={cell}>
                      {c.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a static SVG on a static export
                        <img src={c.logo} alt="" className="h-[80%] w-auto object-contain" style={{ transform: "scaleY(1.6)" }} />
                      ) : null}
                    </span>
                    <span className={`${cell} ${lit ? "font-extrabold text-ink-primary" : "font-bold text-ink-muted"}`}>
                      <span style={lettering}>{c.tag}</span>
                    </span>
                    <span className={`${cell} ${lit ? "font-extrabold text-ink-primary" : c.value === null ? "text-ink-muted" : "font-bold text-ink-primary"}`}>
                      <span style={lettering}>{c.value === null ? "–" : c.value.toFixed(1)}</span>
                    </span>
                    {c.cells.map((v, k) => (
                      <span key={k} className={`${cell} ${lit ? "font-extrabold text-ink-primary" : "font-semibold text-ink-secondary"}`}>
                        <span style={lettering}>{v}</span>
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          {/* The column names, along the table's near edge. */}
          <div
            className="absolute inset-x-0 grid border-t border-ink-primary/60 font-bold uppercase text-ink-muted"
            style={{ top: dTop + band, height: headDepth, gridTemplateColumns: grid, fontSize: 6 }}
          >
            {heads.map((h, k) => (
              <span key={k} className={cell}>
                <span style={lettering}>{h}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      {/* What's dragged: a box over the table's stretch of the screen, scrolled by the page (see useListScroll). */}
      <div
        ref={setScroller}
        data-floor-ui
        onClick={tap}
        className="fixed z-[8] touch-none overflow-y-auto overscroll-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ top: yTop, height: Math.max(0, yBottom - yTop), left, width: right - left }}
        aria-label="Drag along the floor to see every game"
      >
        <div style={{ height: Math.max(0, yBottom - yTop) + maxScroll / DRAG_TO_FLOOR }} />
      </div>
    </>
  );
}

/** A stat's value as it's painted: whole (Sleeper leaves a stat out when it's none). */
const whole = (v: number | undefined) => String(Math.round(v !== undefined && Number.isFinite(v) ? v : 0));

/**
 * A player as a stage: on the back wall (under `picker`, if there is one), who he is (see PlayerHeader), his numbers
 * in the lineup, and the seasons he's played to pick from (his latest, at first, or his whole career). At the back of
 * the room, the season picked as columns, a week's each (gaps for weeks he didn't play) — or his career, a season's
 * each (a season's column picks that season) — their stats painted on the floor under them (see FloorColumns). With
 * `details`, a Table button swaps the floor for every number there is.
 */
export function PlayerStage({
  places,
  up,
  onClose,
  player,
  numbers,
  season,
  scoring,
  picker,
  details,
}: {
  places: StagePlaces;
  up: boolean;
  onClose: () => void;
  /** Kept for the stages' shared props (the × in the header is the way back). */
  back?: boolean;
  title?: string;
  player: ResolvedPlayer;
  numbers: LineupNumbers | null;
  /** The league's season, counted through. */
  season: number;
  scoring?: Record<string, number>;
  picker?: React.ReactNode;
  details?: React.ReactNode;
}) {
  // His bio and his seasons, as they load.
  const [bio, setBio] = useState<PlayerBio | null>(null);
  const [seasons, setSeasons] = useState<SeasonLine[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPlayerBio(player.playerId).then((b) => !cancelled && setBio(b));
    getCareer(player.playerId, season)
      .then((c) => !cancelled && setSeasons(c.map((s) => ({ ...s, points: seasonPoints(s.stats, scoring), rank: seasonRank(s.stats, scoring) }))))
      .catch(() => !cancelled && setSeasons([]));
    return () => {
      cancelled = true;
    };
  }, [player.playerId, season, scoring]);

  // The season looked into — his latest until another's picked — or his career; and that season's weeks as they load.
  const [chosen, setChosen] = useState<string | null>(null);
  const latest = seasons?.at(-1)?.season ?? null;
  const shown = chosen ?? latest;
  const openSeason = shown === "career" ? null : shown;
  const [weeks, setWeeks] = useState<{ season: string; weeks: CareerWeek[] } | null>(null);
  useEffect(() => {
    if (!openSeason) return;
    let cancelled = false;
    getSeasonWeeks(player.playerId, Number(openSeason)).then((w) => !cancelled && setWeeks({ season: openSeason, weeks: w }));
    return () => {
      cancelled = true;
    };
  }, [player.playerId, openSeason]);
  const seasonWeeks = openSeason && weeks?.season === openSeason ? weeks.weeks : null;
  const [table, setTable] = useState(false);

  const statRows = FLOOR_STATS[player.position] ?? FLOOR_STATS.WR;
  // The columns: every week of the season picked (its whole length — or, this season, through his latest game), a
  // gap where he didn't play; or every season of his.
  const columns: FloorColumn[] | null = (() => {
    if (seasons === null) return null;
    if (!openSeason) {
      return seasons.map((s) => ({
        key: s.season,
        value: s.points,
        logo: s.team ? nflLogoUrl(s.team) : null,
        tag: s.season,
        cells: [whole(s.stats.gp), ...statRows.map((r) => whole(r.value(s.stats)))],
        label: `${s.season}${s.team ? `, ${s.team}` : ""}: ${s.points.toFixed(1)} points${s.rank ? `, ${player.position}${s.rank}` : ""}`,
        short: `${s.season}${s.team ? ` · ${s.team}` : ""} · ${Math.round(s.stats.gp ?? 0)} GP · ${s.points.toFixed(1)} pts · ${
          s.stats.gp ? (s.points / s.stats.gp).toFixed(1) : "–"
        } a game${s.rank ? ` · ${player.position}${s.rank}` : ""}`,
      }));
    }
    if (!seasonWeeks) return null;
    const byWeek = new Map(seasonWeeks.map((w) => [w.week, w]));
    const last = Math.max(0, ...seasonWeeks.map((w) => w.week));
    const length = Number(openSeason) === season ? last : Math.max(last, Number(openSeason) >= 2021 ? 18 : 17);
    return Array.from({ length }, (_, k) => {
      const week = k + 1;
      const w = byWeek.get(week);
      if (!w) return { key: `w${week}`, value: null, logo: null, tag: String(week), cells: statRows.map(() => "–"), label: `Week ${week}: didn't play`, short: `Week ${week}` };
      const points = seasonPoints(w.stats, scoring);
      return {
        key: `w${week}`,
        value: points,
        logo: w.opponent ? nflLogoUrl(w.opponent) : null,
        tag: String(week),
        cells: statRows.map((r) => whole(r.value(w.stats))),
        label: `Week ${week}${w.opponent ? ` against ${w.opponent}` : ""}: ${points.toFixed(1)} points, ${statRows.map((r) => `${whole(r.value(w.stats))} ${r.label}`).join(", ")}`,
        short: `${openSeason} · Week ${week}${w.opponent ? ` · vs ${w.opponent}` : ""} · ${points.toFixed(1)} pts`,
      };
    });
  })();
  // The table's column names: the team, the week (or year), points, then the stats.
  const heads = openSeason ? ["Opp", "Wk", "Pts", ...statRows.map((r) => r.label)] : ["Team", "Year", "Pts", "GP", ...statRows.map((r) => r.label)];
  // Which rows are on the floor (their columns stand out), and a column's row to bring forward.
  const [inView, setInView] = useState<[number, number]>([-1, -1]);
  const [bring, setBring] = useState<{ i: number; at: number } | null>(null);

  // The column read out: his latest, until another's picked — in whatever's shown.
  const [pickedCol, setPickedCol] = useState<{ view: string; i: number } | null>(null);
  const view = shown ?? "loading";
  const lastPlayed = columns ? columns.map((c, i) => (c.value === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1) : -1;
  const pick = pickedCol?.view === view && columns?.[pickedCol.i]?.value != null ? pickedCol.i : lastPlayed;
  const readout = !columns ? "Loading…" : lastPlayed < 0 ? (openSeason ? `No games in ${openSeason}` : "No regular-season stats yet") : columns[pick].short;

  // Where the wall's words end: the columns rise to just under them.
  const [wallEl, setWallEl] = useState<HTMLElement | null>(null);
  const wallBox = useScreenBox(wallEl);
  const { floor, room } = places;
  const seasonButton = (key: string, label: string, on: boolean, onPick: () => void, buttonTitle?: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={on}
      title={buttonTitle}
      onClick={onPick}
      className={`shrink-0 border px-2 py-1 text-[0.6875rem] font-bold tabular-nums transition-colors ${
        on ? "border-ink-primary bg-ink-primary text-page" : "border-border bg-page/60 text-ink-secondary hover:text-ink-primary"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Who he is and his seasons, on the back wall. */}
      <div
        data-floor-ui
        className={`fixed z-[6] overflow-y-auto transition-[opacity,transform] ease-out [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${up ? "opacity-100" : "translate-y-2 opacity-0"}`}
        style={{ ...places.wall, transitionDuration: `${STAGE_MS}ms` }}
      >
        <div ref={setWallEl} className="flex flex-col gap-2">
          {picker}
          <section aria-label={player.name} className="flex flex-col gap-2">
            <PlayerHeader player={player} bio={bio} numbers={numbers} onClose={onClose} />
            <div className="flex flex-col gap-1">
              <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">Seasons played</span>
              <div className="flex flex-wrap gap-1">
                {seasons === null ? (
                  <span className="text-xs text-ink-muted">Loading…</span>
                ) : seasons.length === 0 ? (
                  <span className="text-xs text-ink-muted">None yet</span>
                ) : (
                  <>
                    {seasonButton("career", "Career", !table && shown === "career", () => (setChosen("career"), setTable(false)), "Every season he's played")}
                    {[...seasons].reverse().map((s) =>
                      seasonButton(s.season, s.season, !table && shown === s.season, () => (setChosen(s.season), setTable(false)), `His ${s.season} week by week`)
                    )}
                    {details ? seasonButton("table", "Table", table, () => setTable((t) => !t), "Every number there is") : null}
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
      {table && details ? (
        <div
          data-floor-ui
          className={`fixed z-[7] overflow-y-auto border border-border bg-surface-raised/90 backdrop-blur-[3px] transition-opacity ease-out ${up ? "opacity-100" : "opacity-0"}`}
          style={{ top: floor.top, left: floor.left, width: floor.width, height: Math.max(0, floor.bottom - floor.top), transitionDuration: `${STAGE_MS}ms` }}
        >
          {details}
        </div>
      ) : (
        <div className={`transition-opacity ease-out ${up ? "opacity-100" : "pointer-events-none opacity-0"}`} style={{ transitionDuration: `${STAGE_MS}ms` }}>
          {columns && wallBox && columns.length > 0 ? (
            <>
              <ColumnBars
                key={`bars-${view}`}
                columns={columns}
                room={room}
                top={wallBox.top + wallBox.height + 18}
                left={floor.left}
                right={floor.left + floor.width}
                picked={pick}
                inView={inView}
                onPick={(i) => {
                  setPickedCol({ view, i });
                  // A season's column looks into that season; a game's brings its row forward on the floor.
                  if (!openSeason && seasons?.[i]) setChosen(seasons[i].season);
                  else setBring({ i, at: Date.now() });
                }}
                label={openSeason ? `${player.name}'s ${openSeason}, week by week` : `${player.name}'s fantasy points by season`}
              />
              <FloorTable
                key={`table-${view}`}
                columns={columns}
                heads={heads}
                room={room}
                left={floor.left}
                right={floor.left + floor.width}
                picked={pick}
                onPick={(i) => setPickedCol({ view, i })}
                onView={setInView}
                bring={bring}
              />
            </>
          ) : null}
          {/* The column picked, read out along the floor's front. */}
          <p
            aria-live="polite"
            data-floor-ui
            className="fixed z-[7] truncate text-center text-[0.6875rem] font-semibold tabular-nums text-ink-secondary"
            style={{ top: floor.bottom - 16, left: floor.left, width: floor.width }}
          >
            {readout}
          </p>
        </div>
      )}
    </>
  );
}

/** Your bench as a stage: your bench players to pick from across the top of the wall, the one picked a PlayerStage. */
export function RoomBench({
  bench,
  numbersOf,
  ...stage
}: Omit<React.ComponentProps<typeof PlayerStage>, "title" | "player" | "numbers" | "picker" | "details"> & {
  bench: ResolvedSlot[];
  numbersOf: (resolved: ResolvedSlot) => LineupNumbers;
}) {
  const players = bench.filter((b) => b.player);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const slot = players.find((b) => b.player!.playerId === pickedId) ?? players[0];
  if (!slot) {
    return (
      <div data-floor-ui className="fixed z-[7] flex items-center gap-2 text-sm text-ink-secondary" style={{ top: stage.places.floor.top, left: stage.places.floor.left, width: stage.places.floor.width }}>
        <span className="min-w-0 flex-1">No one&rsquo;s on your bench.</span>
        <CloseButton onClose={stage.onClose} />
      </div>
    );
  }
  const picker = (
    <ul className="flex flex-wrap gap-1" aria-label="Your bench">
      {players.map((b) => {
        const p = b.player!;
        const on = p.playerId === slot.player!.playerId;
        return (
          <li key={p.playerId}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => setPickedId(p.playerId)}
              className={`flex items-baseline gap-1 border px-1.5 py-1 text-[0.6875rem] font-bold transition-colors ${
                on ? "border-ink-primary bg-ink-primary text-page" : "border-border bg-page/60 text-ink-primary hover:border-ink-primary"
              }`}
            >
              <span className={on ? "" : (POSITION_TEXT_COLOR[p.position] ?? "text-ink-secondary")}>{p.position}</span>
              <span className="max-w-[9rem] truncate">{p.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
  return <PlayerStage key={slot.player!.playerId} {...stage} player={slot.player!} numbers={numbersOf(slot)} picker={picker} />;
}
