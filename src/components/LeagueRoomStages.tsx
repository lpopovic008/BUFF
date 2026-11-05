"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui/Icon";
import { CloseButton, FloorTile, FloorTiles } from "@/components/LeagueRoomFloor";
import { FLOOR_RISE_MS, LineupTiles, SeasonLine } from "@/components/FloorCareer";
import { MatchupGraph, MatchupSide } from "@/components/MatchupGraph";
import type { LineupNumbers } from "@/components/PlayerCareer";
import { collegeLogo } from "@/lib/college-logos";
import { nflLogoUrl } from "@/lib/nfl-logos";
import { ordinal } from "@/lib/format";
import { playerHeadshotUrl } from "@/lib/sleeper";
import { CareerWeek, getCareer, getSeasonWeeks, seasonPoints, seasonRank } from "@/lib/career-stats";
import { floorDepth, floorPoint, floorScale, HORIZON_SHARE } from "@/lib/grid-room";
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
 * Who a player is, across the top of his stage: his photo over his team's logo; his name, his position beside it in
 * its color, and under them his height and weight (then his team and number); his way out at the top right, and
 * under it his age over his years in the league, then his college's logo at the right edge.
 */
function PlayerHeader({ player, bio, onClose }: { player: ResolvedPlayer; bio: PlayerBio | null; onClose: () => void }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const size = bio?.height && bio.weight ? `${feet(bio.height)} ${bio.weight} lb` : null;
  const under = [size, player.team, bio?.number ? `#${bio.number}` : null].filter(Boolean).join(" · ");
  const years = bio?.yearsExp != null ? (bio.yearsExp === 0 ? "Rookie" : `${ordinal(bio.yearsExp + 1)} season`) : null;
  return (
    <div className="relative flex items-end gap-2.5 pr-0.5">
      {/* His photo in front of his team's logo, both centered. */}
      <div className="relative h-14 w-14 shrink-0 sm:h-16 sm:w-16">
        {player.team ? (
          // eslint-disable-next-line @next/next/no-img-element -- a static SVG on a static export
          <img src={nflLogoUrl(player.team)} alt={player.team} className="absolute inset-0 h-full w-full object-contain opacity-90" />
        ) : null}
        {photoFailed ? null : (
          // eslint-disable-next-line @next/next/no-img-element -- a remote Sleeper photo on a static export
          <img src={playerHeadshotUrl(player.playerId)} alt="" onError={() => setPhotoFailed(true)} className="absolute inset-[8%] h-[84%] w-[84%] object-cover object-top" />
        )}
      </div>
      <div className="min-w-0 flex-1 self-center leading-tight">
        <h3 className="flex min-w-0 items-baseline gap-1.5 text-ink-primary">
          <span className="truncate text-lg font-extrabold uppercase tracking-wide sm:text-xl">{player.name}</span>
          <span className={`shrink-0 text-sm font-extrabold ${POSITION_TEXT_COLOR[player.position] ?? "text-ink-secondary"}`}>{player.position}</span>
        </h3>
        {under ? <p className="truncate text-[0.6875rem] font-semibold uppercase text-ink-secondary">{under}</p> : null}
      </div>
      {/* His way out, at the top right; under it, his age over his years, and his college. */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${player.name}`}
          title="Close"
          className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center text-xl font-bold leading-none text-ink-primary transition-transform active:scale-90"
        >
          ×
        </button>
        <div className="flex items-end gap-2">
          {bio?.age || years ? (
            <div className="flex flex-col items-end text-[0.6875rem] font-semibold uppercase leading-tight text-ink-secondary">
              {bio?.age ? <span>{bio.age} yrs old</span> : null}
              {years ? <span>{years}</span> : null}
            </div>
          ) : null}
          <CollegeMark college={bio?.college ?? null} />
        </div>
      </div>
    </div>
  );
}

/** A stat painted on the floor under each column: its name, and its value from a game's (or a season's) stats. */
interface FloorStat {
  label: string;
  value: (stats: Record<string, number>) => number | undefined;
}
const stat = (label: string, key: string): FloorStat => ({ label, value: (s) => s[key] });
/** Each position's stats on the floor, a row each. */
const FLOOR_STATS: Record<string, FloorStat[]> = {
  QB: [stat("Pass", "pass_yd"), stat("TD", "pass_td"), stat("Int", "pass_int"), stat("Rush", "rush_yd")],
  RB: [stat("Rush", "rush_yd"), stat("Rec", "rec"), stat("Rec yd", "rec_yd"), { label: "TD", value: (s) => (s.rush_td ?? 0) + (s.rec_td ?? 0) }],
  WR: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("Yds", "rec_yd"), stat("TD", "rec_td")],
  TE: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("Yds", "rec_yd"), stat("TD", "rec_td")],
  K: [stat("FG", "fgm"), stat("FGA", "fga"), stat("XP", "xpm")],
  DEF: [stat("Sack", "sack"), stat("Int", "int"), stat("PA", "pts_allow")],
};

/** A column on the floor: a game (or a season) — or a gap, a week he didn't play. */
interface FloorColumn {
  key: string;
  /** Its fantasy points — null for a gap. */
  value: number | null;
  /** Under it on the floor: a team's logo (the opponent's, or his team's that season), and its stats row by row. */
  logo: string | null;
  cells: string[];
  /** Read out for it, as a button — and, picked, in short along the floor's front. */
  label: string;
  short: string;
}

/** A row of the floor under the columns, at most this tall on the screen (px); the logos' row taller. */
const STAT_ROW_PX = 22;
const LOGO_ROW_PX = 30;
/** How far into the floor the columns stand from the horizon (px down the screen), and how deep each is (floor px). */
const COLUMN_FOOT_PX = 10;
const COLUMN_DEPTH = 8;
/** How much wider the painted floor is at its nearest row than at the columns' foot. */
const FLOOR_FAN = 0.16;
/** The room kept down the floor's left for the rows' names (px at the columns' foot). */
const GUTTER_PX = 34;

/**
 * His games (or seasons) as columns at the back of the room: standing on the floor at the horizon, rising up the
 * wall to `top` (screen y) — each as tall as his fantasy points, the picked one lit, a gap for a week he didn't play.
 * Under each, painted on the floor in its perspective (each row a lane of the floor, each cell the column's strip of
 * it, its words laid along it): the team's logo, then the stats, the rows' names down the left. Each column is a
 * button (the arrow keys move along them). Drawn across `left`..`right`, down to `bottom`.
 */
function FloorColumns({
  columns,
  rows,
  room,
  top,
  bottom,
  left,
  right,
  picked,
  onPick,
  label,
}: {
  columns: FloorColumn[];
  rows: string[];
  room: { width: number; height: number };
  top: number;
  bottom: number;
  left: number;
  right: number;
  picked: number;
  onPick: (i: number) => void;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  const { width: W, height: H } = room;
  const horizon = H * HORIZON_SHARE;
  const yBase = horizon + COLUMN_FOOT_PX;
  const dF = floorDepth(yBase, H);
  const dB = Math.max(0, dF - COLUMN_DEPTH);
  const sF = floorScale(dF);
  const sB = floorScale(dB);
  const yBack = floorPoint(0, dB, W, H)[1];
  const n = Math.max(1, columns.length);
  // The floor's lanes under the columns: the logos', then a row a stat — as deep as fits down to the bottom (a little
  // deeper where there's room).
  const lanes: { y0: number; y1: number }[] = [];
  let y = yBase + 6;
  const rowCount = rows.length + 1;
  const natural = LOGO_ROW_PX + rows.length * STAT_ROW_PX + rowCount * 2;
  const fit = Math.min(1.3, (bottom - y) / natural);
  for (let r = 0; r < rowCount; r++) {
    const h = (r === 0 ? LOGO_ROW_PX : STAT_ROW_PX) * fit;
    lanes.push({ y0: y, y1: y + h });
    y += h + 2 * fit;
  }
  const tableEnd = lanes[lanes.length - 1].y1;
  // The painted floor widens toward you a little, as the floor does (only gently: the floor's own lines spread too
  // fast just under the horizon for a table to stay on the screen).
  const spread = (yy: number) => 1 + FLOOR_FAN * Math.max(0, Math.min(1, (yy - yBase) / Math.max(1, tableEnd - yBase)));
  // Across the floor at the columns' foot: in from the sides (so its widest, nearest row still fits), the rows' names
  // in a gutter on the left.
  const a0 = (left + GUTTER_PX - W / 2) / (sF * (1 + FLOOR_FAN));
  const a1 = (right - 4 - W / 2) / (sF * (1 + FLOOR_FAN));
  const slot = (a1 - a0) / n;
  const half = slot * 0.3;
  const tallest = Math.max(8, yBase - top - 16);
  const most = Math.max(1, ...columns.map((c) => c.value ?? 0));
  const best = Math.max(...columns.map((c) => c.value ?? -1));
  const pts = (ps: [number, number][]) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const x = (a: number, sc: number) => W / 2 + a * sc;

  // Where floor point `a` across shows at screen y `yy` on the painted floor.
  const at = (a: number, yy: number): [number, number] => [W / 2 + a * sF * spread(yy), yy];
  // A cell of the floor: column i's strip of lane r (i -1: the gutter) — its corners, middle, and its lean.
  const cell = (i: number, r: number) => {
    const { y0, y1 } = lanes[r];
    const [l, rr] = i < 0 ? [(left + 4 - W / 2) / (sF * (1 + FLOOR_FAN)), a0 - slot * 0.1] : [a0 + slot * i + slot * 0.08, a0 + slot * (i + 1) - slot * 0.08];
    const corners = [at(l, y0), at(rr, y0), at(rr, y1), at(l, y1)];
    const far = at((l + rr) / 2, y0);
    const near = at((l + rr) / 2, y1);
    const lean = (near[0] - far[0]) / Math.max(1, near[1] - far[1]);
    const mid = at((l + rr) / 2, (y0 + y1) / 2);
    const width = (rr - l) * sF * spread((y0 + y1) / 2);
    return { corners, mid, lean, width, height: y1 - y0 };
  };
  // Words laid along the floor: leaning with the floor's lines, flattened a little.
  const painted = (c: ReturnType<typeof cell>, text: string, className: string, key: string) => {
    const size = Math.max(7, Math.min(c.height * 0.8, c.width / (text.length * 0.62 + 0.4), 14));
    return (
      <text
        key={key}
        transform={`translate(${c.mid[0].toFixed(1)} ${c.mid[1].toFixed(1)}) matrix(1 0 ${c.lean.toFixed(3)} 0.82 0 0)`}
        textAnchor="middle"
        dominantBaseline="central"
        className={`floor-bar-label tabular-nums ${className}`}
        style={{ fontSize: size }}
      >
        {text}
      </text>
    );
  };

  const bars = columns.map((c, i) => {
    const mid = a0 + slot * (i + 0.5);
    const [fl, fr, bl, br] = [x(mid - half, sF), x(mid + half, sF), x(mid - half, sB), x(mid + half, sB)];
    const hF = c.value === null ? 0 : Math.max(2, (tallest * Math.max(0, c.value)) / most);
    const hB = (hF * sB) / sF;
    const right = (fl + fr) / 2 < W / 2;
    return {
      c,
      i,
      cx: (fl + fr) / 2,
      hF,
      top: pts([[bl, yBack - hB], [br, yBack - hB], [fr, yBase - hF], [fl, yBase - hF]]),
      front: pts([[fl, yBase], [fr, yBase], [fr, yBase - hF], [fl, yBase - hF]]),
      side: right ? pts([[fr, yBase], [br, yBack], [br, yBack - hB], [fr, yBase - hF]]) : pts([[fl, yBase], [bl, yBack], [bl, yBack - hB], [fl, yBase - hF]]),
      foot: pts([[fl, yBase], [fr, yBase], [br, yBack], [bl, yBack]]),
      labelY: Math.min(yBase - hF, yBack - hB) - 4,
      slotL: x(a0 + slot * i, sF),
      slotR: x(a0 + slot * (i + 1), sF),
    };
  });

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
      {/* The floor under them, painted: every cell's outline, the rows' names down the left. */}
      <g aria-hidden>
        {lanes.map((_, r) =>
          columns.map((col, i) => {
            const c = cell(i, r);
            return (
              <polygon
                key={`cell${r}-${i}`}
                points={pts(c.corners as [number, number][])}
                fill={i === picked ? "var(--ink-primary)" : "none"}
                fillOpacity={0.07}
                stroke="var(--ink-muted)"
                strokeOpacity={0.28}
                strokeWidth={0.75}
              />
            );
          })
        )}
        {rows.map((name, r) => painted(cell(-1, r + 1), name.toUpperCase(), "fill-[var(--ink-muted)] font-bold", `row${r}`))}
        {columns.map((col, i) => {
          const lit = i === picked;
          const logoCell = cell(i, 0);
          const side = Math.min(logoCell.height, logoCell.width) * 0.9;
          return (
            <g key={`floor${col.key}`}>
              {col.logo ? (
                <image
                  href={col.logo}
                  x={-side / 2}
                  y={-side / 2}
                  width={side}
                  height={side}
                  preserveAspectRatio="xMidYMid meet"
                  opacity={col.value === null ? 0.35 : lit ? 1 : 0.85}
                  transform={`translate(${logoCell.mid[0].toFixed(1)} ${logoCell.mid[1].toFixed(1)}) matrix(1 0 ${logoCell.lean.toFixed(3)} 0.82 0 0)`}
                />
              ) : null}
              {col.cells.map((v, r) =>
                painted(cell(i, r + 1), v, lit ? "fill-[var(--ink-primary)] font-extrabold" : col.value === null ? "fill-[var(--ink-muted)]" : "fill-[var(--ink-secondary)] font-semibold", `v${col.key}-${r}`)
              )}
            </g>
          );
        })}
      </g>
      {/* The columns. */}
      {bars.map((b, k) => {
        const lit = b.i === picked;
        if (b.c.value === null) {
          // A week he didn't play: its footprint on the floor, empty.
          return <polygon key={b.c.key} points={b.foot} fill="none" stroke="var(--ink-muted)" strokeOpacity={0.5} strokeDasharray="2 2" aria-hidden />;
        }
        return (
          <g
            key={b.c.key}
            role="button"
            tabIndex={0}
            aria-label={b.c.label}
            aria-pressed={lit}
            className="group pointer-events-auto cursor-pointer outline-none"
            onClick={() => onPick(b.i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick(b.i);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                e.stopPropagation();
                const by = e.key === "ArrowLeft" ? -1 : 1;
                let next = b.i + by;
                while (next >= 0 && next < columns.length && columns[next].value === null) next += by;
                if (next < 0 || next >= columns.length) return;
                onPick(next);
                (e.currentTarget.parentElement?.querySelector<SVGGElement>(`[data-col="${next}"]`))?.focus();
              }
            }}
            data-col={b.i}
          >
            {/* The whole of its slot, to tap — the column and the floor under it. */}
            <rect x={b.slotL} y={yBase - tallest - 16} width={b.slotR - b.slotL} height={tallest + 16 + (lanes.at(-1)!.y1 - yBase)} fill="transparent" />
            <g className="floor-bar" style={{ transformOrigin: `${b.cx}px ${yBase}px`, animationDelay: `${FLOOR_RISE_MS * 0.6 + k * 40}ms` }}>
              <polygon points={b.side} fill={lit ? "var(--ink-primary)" : "var(--ink-secondary)"} fillOpacity={lit ? 0.55 : 0.18} />
              <polygon points={b.top} fill={lit ? "var(--ink-primary)" : "var(--ink-secondary)"} fillOpacity={lit ? 0.8 : 0.3} />
              <polygon
                points={b.front}
                fill={lit ? "var(--ink-primary)" : "var(--page)"}
                fillOpacity={lit ? 1 : 0.55}
                stroke={lit ? "var(--ink-primary)" : "var(--ink-secondary)"}
                strokeWidth={1}
                strokeLinejoin="round"
              />
            </g>
            <rect
              x={b.slotL + 1}
              y={yBase - tallest - 16}
              width={b.slotR - b.slotL - 2}
              height={tallest + 16}
              fill="none"
              stroke="var(--ink-primary)"
              strokeDasharray="3 3"
              className="opacity-0 group-focus-visible:opacity-100"
            />
            <text
              x={b.cx}
              y={b.labelY}
              textAnchor="middle"
              className={`floor-bar-label tabular-nums ${lit ? "fill-[var(--ink-primary)] font-extrabold" : "fill-[var(--ink-secondary)] font-semibold"}`}
              style={{ fontSize: (b.slotR - b.slotL) < 30 ? "0.5625rem" : "0.625rem", animationDelay: `${FLOOR_RISE_MS * 0.6 + k * 40 + 450}ms` }}
            >
              {b.c.value === best && best > 0 ? "★" : ""}
              {(b.slotR - b.slotL) < 30 && b.c.value! >= 10 ? String(Math.round(b.c.value!)) : b.c.value! >= 100 ? String(Math.round(b.c.value!)) : b.c.value!.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
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
        cells: [`'${s.season.slice(-2)}`, whole(s.stats.gp), ...statRows.map((r) => whole(r.value(s.stats)))],
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
      if (!w) return { key: `w${week}`, value: null, logo: null, cells: statRows.map(() => ""), label: `Week ${week}: didn't play`, short: `Week ${week}` };
      const points = seasonPoints(w.stats, scoring);
      return {
        key: `w${week}`,
        value: points,
        logo: w.opponent ? nflLogoUrl(w.opponent) : null,
        cells: statRows.map((r) => whole(r.value(w.stats))),
        label: `Week ${week}${w.opponent ? ` against ${w.opponent}` : ""}: ${points.toFixed(1)} points, ${statRows.map((r) => `${whole(r.value(w.stats))} ${r.label}`).join(", ")}`,
        short: `${openSeason} · Week ${week}${w.opponent ? ` · vs ${w.opponent}` : ""} · ${points.toFixed(1)} pts`,
      };
    });
  })();
  const rowNames = openSeason ? statRows.map((r) => r.label) : ["Year", "GP", ...statRows.map((r) => r.label)];

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
            <PlayerHeader player={player} bio={bio} onClose={onClose} />
            {numbers ? <LineupTiles position={player.position} numbers={numbers} /> : null}
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
            <FloorColumns
              key={view}
              columns={columns}
              rows={rowNames}
              room={room}
              top={wallBox.top + wallBox.height + 18}
              bottom={floor.bottom - 18}
              left={floor.left}
              right={floor.left + floor.width}
              picked={pick}
              onPick={(i) => {
                setPickedCol({ view, i });
                // A season's column looks into that season.
                if (!openSeason && seasons?.[i]) setChosen(seasons[i].season);
              }}
              label={openSeason ? `${player.name}'s ${openSeason}, week by week` : `${player.name}'s fantasy points by season`}
            />
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
