"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { floorDepth, floorPoint, floorScale } from "@/lib/grid-room";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { ordinal } from "@/lib/format";
import type { ResolvedPlayer } from "@/lib/players";
import type { LineupNumbers } from "@/components/PlayerCareer";
import type { StagePlaces } from "@/components/LeagueRoomStages";

/**
 * Where a player's card comes up out of the floor (see PlayerCareer's `stage`): between these screen y's, placed
 * across by `className`, in a room `room` big (whose floor its seasons stand on).
 */
export interface CareerStage {
  top: number;
  bottom: number;
  className?: string;
  room: { width: number; height: number };
  /** Told when a card comes up, and when it's gone — so what's on the floor there can make way. */
  onShow?: (up: boolean) => void;
  /** Where a player stage goes, wall and floor (see PlayerStage) — the card's one, the lineups stepping aside for it. */
  places?: StagePlaces;
  /** Its own back button too (from laptop width up, where the header has none). */
  back?: boolean;
}

/** A season of his, as his card shows it: his team, stats, fantasy points under the league's scoring, and finish. */
export interface SeasonLine {
  season: string;
  team: string | null;
  stats: Record<string, number>;
  points: number;
  rank: number | null;
}

/** How long it takes to come up out of the floor, or go back down into it (ms) — as the League Room's panels do. */
export const FLOOR_RISE_MS = 450;

/** A starter's numbers in the lineup, each on a tile: what it is, the number in its lineup color, and what it's out of. */
export function LineupTiles({ position, numbers }: { position: string; numbers: LineupNumbers }) {
  const { valueRank, dynasty, seasonRank, ppg, opponent, bye, defenseRank, opponentColor } = numbers;
  const tiles: { label: string; value: string; sub: string; className?: string; style?: React.CSSProperties; said: string }[] = [];
  if (valueRank !== null)
    tiles.push({
      label: `${dynasty ? "Dynasty" : "Redraft"} rank`,
      value: `${position}${valueRank}`,
      sub: "by trade value",
      className: "text-series-4",
      said: `${dynasty ? "Dynasty" : "Redraft"} rank: ${ordinal(valueRank)} among ${position}s by trade value`,
    });
  if (seasonRank !== null)
    tiles.push({
      label: "Season rank",
      value: `${position}${seasonRank}`,
      sub: "in points",
      className: "text-series-1",
      said: `Season rank: ${ordinal(seasonRank)} among ${position}s in points this season`,
    });
  if (ppg !== null) tiles.push({ label: "A game", value: ppg.toFixed(1), sub: "points this season", className: "text-ink-primary", said: `${ppg.toFixed(1)} points a game this season` });
  if (bye) tiles.push({ label: "This week", value: "BYE", sub: "no game", className: "text-ink-muted", said: "On a bye this week" });
  else if (opponent)
    tiles.push({
      label: "This week",
      value: `vs ${opponent}`,
      sub: defenseRank !== null ? `${ordinal(defenseRank)} D vs ${position}s` : "opponent",
      style: opponentColor ? { color: opponentColor } : undefined,
      said:
        defenseRank !== null
          ? `This week against ${opponent}, the ${ordinal(defenseRank)} defense against ${position}s (1st allows the fewest points)`
          : `This week against ${opponent}`,
    });
  if (tiles.length === 0) return null;
  return (
    <ul className="grid shrink-0 gap-1" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }} aria-label="In this lineup">
      {tiles.map((t) => (
        <li key={t.label} title={t.said} className="flex min-w-0 flex-col items-center border border-border bg-page/70 px-1 py-1 text-center leading-tight backdrop-blur-[3px]">
          <span className="sr-only">{t.said}</span>
          <span aria-hidden className="w-full truncate text-[0.5625rem] font-bold uppercase tracking-wide text-ink-muted">
            {t.label}
          </span>
          <span aria-hidden className={`w-full truncate text-sm font-extrabold tabular-nums sm:text-base ${t.className ?? ""}`} style={t.style}>
            {t.value}
          </span>
          <span aria-hidden className="w-full truncate text-[0.5625rem] font-semibold text-ink-muted">
            {t.sub}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Points as a bar's label: whole from 100 up, to a tenth under. */
const barPoints = (p: number) => (p >= 100 ? String(Math.round(p)) : p.toFixed(1));
/** The narrowest a season's bar's slot may be (px) — as many seasons as fit, the latest, up to the most shown. */
const SLOT_MIN_PX = 30;
const MOST_SEASONS = 12;
/** How deep a bar stands on the floor (floor px). */
const BAR_DEPTH = 8;

/** A bar on the floor (see FloorBars): what it's called, how tall, what's under it on the floor. */
export interface FloorBar {
  key: string;
  value: number;
  /** On the floor in front of it: its name ("'24", "W5"), and under that, if there's room, a note ("QB3"). */
  foot: string;
  note?: string;
  noteClassName?: string;
  /** Read out for it, as a button. */
  label: string;
}

/**
 * Bars standing on the room's floor, in its perspective — each as tall as its value, its name (and a note) on the
 * floor in front of it, its value on top, the tallest starred; the one picked lit, the rest glass. They rise out of the
 * floor one after another, reflected in it as the room's columns are. Each is a button (the arrow keys move along
 * them). As many as fit (`slotMin` px a bar), the last of them. `box` is where it's drawn on the screen, `reserve` px
 * kept clear across its top (for a readout).
 */
export function FloorBars({
  bars: all,
  room,
  box,
  picked,
  onPick,
  label,
  slotMin = SLOT_MIN_PX,
  most = MOST_SEASONS,
  reserve = 18,
}: {
  bars: FloorBar[];
  room: { width: number; height: number };
  box: { left: number; top: number; width: number; height: number };
  picked: number;
  onPick: (i: number) => void;
  label: string;
  slotMin?: number;
  most?: number;
  reserve?: number;
}) {
  const id = useId().replace(/:/g, "");
  const { width: W, height: H } = room;
  const n = Math.max(1, Math.min(all.length, most, Math.floor(box.width / slotMin)));
  const first = all.length - n;
  const shown = all.slice(first);
  const narrow = box.width / n < 34;
  // Their foot on the floor, with room in front for the names and notes; their tops up to under the values.
  const LABELS = narrow && !shown.some((b) => b.note) ? 14 : 26;
  const yBase = box.top + box.height - LABELS;
  const dFront = floorDepth(yBase, H);
  const dBack = Math.max(0, dFront - BAR_DEPTH);
  const sF = floorScale(dFront);
  const sB = floorScale(dBack);
  const yBack = floorPoint(0, dBack, W, H)[1];
  const across = (box.left + box.width / 2 - W / 2) / sF;
  const span = (box.width - 12) / sF;
  const slot = span / n;
  const half = (slot * 0.6) / 2;
  const top = Math.max(1, ...shown.map((b) => b.value));
  // Screen x of a floor point `a` across at the bar's front or back, in the box.
  const xAt = (a: number, s: number) => W / 2 + a * s - box.left;
  const yF = yBase - box.top;
  const yB = yBack - box.top;
  // As tall as leaves the tallest's value (over its top's far edge too) clear of what's kept across the top.
  const clear = reserve + 14;
  const tallest = Math.max(4, Math.min(yF - clear, (yB - clear) / (sB / sF)));
  const bars = shown.map((bar, i) => {
    const mid = across - span / 2 + slot * (i + 0.5);
    const [fl, fr, bl, br] = [xAt(mid - half, sF), xAt(mid + half, sF), xAt(mid - half, sB), xAt(mid + half, sB)];
    const hF = Math.max(2, (tallest * Math.max(0, bar.value)) / top);
    const hB = (hF * sB) / sF;
    const pts = (ps: [number, number][]) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const topFace = pts([[bl, yB - hB], [br, yB - hB], [fr, yF - hF], [fl, yF - hF]]);
    const front = pts([[fl, yF], [fr, yF], [fr, yF - hF], [fl, yF - hF]]);
    // The side facing the middle of the room (where the viewer stands).
    const right = (fl + fr) / 2 < W / 2 - box.left;
    const side = right ? pts([[fr, yF], [br, yB], [br, yB - hB], [fr, yF - hF]]) : pts([[fl, yF], [bl, yB], [bl, yB - hB], [fl, yF - hF]]);
    // Its value over the whole of it, its top's far edge too.
    const labelY = Math.min(yF - hF, yB - hB) - 4;
    return { bar, i: first + i, cx: (fl + fr) / 2, labelY, top: topFace, front, side, slotL: xAt(mid - slot / 2, sF), slotR: xAt(mid + slot / 2, sF) };
  });
  const best = Math.max(...shown.map((b) => b.value));

  const drawBar = (b: (typeof bars)[number], k: number, mirrored: boolean) => {
    const lit = b.i === picked;
    return (
      <g key={`${mirrored ? "m" : "b"}${b.bar.key}`} className="floor-bar" style={{ transformOrigin: `${b.cx}px ${yF}px`, animationDelay: `${FLOOR_RISE_MS * 0.6 + k * 70}ms` }}>
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
    );
  };

  return (
    <svg className="absolute inset-0 h-full w-full overflow-visible" role="group" aria-label={label}>
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="var(--ink-primary)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--ink-primary)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-fade`} gradientUnits="userSpaceOnUse" x1="0" y1={yF} x2="0" y2={yF + tallest * 0.45}>
          <stop offset="0" stopColor="white" stopOpacity="1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={-W} y={yF} width={3 * W} height={H}>
          <rect x={-W} y={yF} width={3 * W} height={H} fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      {/* A pool of light on the floor where they stand. */}
      <ellipse cx={box.width / 2} cy={(yF + yB) / 2} rx={box.width * 0.48} ry={Math.max(10, (yF - yB) * 2.2)} fill={`url(#${id}-glow)`} />
      {/* Their reflection in the floor. */}
      <g mask={`url(#${id}-mask)`} opacity={0.22} aria-hidden>
        <g transform={`matrix(1 0 0 -1 0 ${2 * yF})`}>{bars.map((b, k) => drawBar(b, k, true))}</g>
      </g>
      {bars.map((b, k) => {
        const lit = b.i === picked;
        return (
          <g
            key={b.bar.key}
            role="button"
            tabIndex={0}
            aria-label={b.bar.label}
            aria-pressed={lit}
            className="group cursor-pointer outline-none"
            onClick={() => onPick(b.i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick(b.i);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                e.stopPropagation();
                const next = Math.min(all.length - 1, Math.max(first, b.i + (e.key === "ArrowLeft" ? -1 : 1)));
                onPick(next);
                (e.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[role=button]")[next - first])?.focus();
              }
            }}
          >
            {/* The whole of its slot, to tap. */}
            <rect x={b.slotL} y={yF - tallest - 14} width={b.slotR - b.slotL} height={tallest + 14 + LABELS} fill="transparent" />
            {drawBar(b, k, false)}
            {/* Focused from the keyboard: an outline round its slot. */}
            <rect
              x={b.slotL + 1}
              y={yF - tallest - 14}
              width={b.slotR - b.slotL - 2}
              height={tallest + 14 + LABELS}
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
              style={{ fontSize: narrow ? "0.5625rem" : "0.625rem", animationDelay: `${FLOOR_RISE_MS * 0.6 + k * 70 + 450}ms` }}
            >
              {b.bar.value === best && b.bar.value > 0 ? "★" : ""}
              {narrow && b.bar.value >= 10 ? String(Math.round(b.bar.value)) : barPoints(b.bar.value)}
            </text>
            <text x={b.cx} y={yF + 11} textAnchor="middle" className={lit ? "fill-[var(--ink-primary)] font-bold" : "fill-[var(--ink-muted)] font-semibold"} style={{ fontSize: "0.5625rem" }}>
              {b.bar.foot}
            </text>
            {LABELS > 14 && b.bar.note ? (
              <text x={b.cx} y={yF + 22} textAnchor="middle" className={`fill-current font-bold ${b.bar.noteClassName ?? "text-ink-secondary"}`} style={{ fontSize: "0.5625rem" }}>
                {b.bar.note}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** His seasons as bars on the floor (see FloorBars): each as tall as his fantasy points, its year and finish in front. */
export function seasonBars(seasons: SeasonLine[], position: string): FloorBar[] {
  return seasons.map((s) => ({
    key: s.season,
    value: s.points,
    foot: `'${s.season.slice(-2)}`,
    note: s.rank ? `${position}${s.rank}` : undefined,
    noteClassName: POSITION_TEXT_COLOR[position],
    label: `${s.season}: ${s.points.toFixed(1)} points${s.rank ? `, ${position}${s.rank}` : ""}`,
  }));
}

/**
 * A player's card in the room: up out of the floor (see CareerStage), not over the page — a see-through plate with
 * who he is, his numbers in the lineup it came from on tiles, and his seasons standing on the floor as bars (see
 * FloorBars), the one picked (his latest, at first) read out across the top. "Table" swaps the bars for every number
 * there is (`details`, PlayerCareer's own), to scroll through.
 */
export function FloorCareer({
  player,
  bio,
  seasons,
  numbers,
  details,
  stage,
  up,
  onClose,
}: {
  player: ResolvedPlayer;
  /** Who he is in a line (see PlayerCareer's bioLine). */
  bio: string;
  /** Oldest first — null while they load. */
  seasons: SeasonLine[] | null;
  numbers?: LineupNumbers;
  details: React.ReactNode;
  stage: CareerStage;
  up: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<"floor" | "table">("floor");
  // The season read out: his latest, until another's picked.
  const [picked, setPicked] = useState<{ playerId: string; i: number } | null>(null);
  const list = seasons ?? [];
  const pick = picked && picked.playerId === player.playerId && picked.i < list.length ? picked.i : list.length - 1;
  const line = list[pick];

  // Where the bars are drawn on the screen: the stage's place (not where it's slid to as it rises), and the box in it.
  const outer = useRef<HTMLDivElement>(null);
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const o = outer.current;
    if (!o || !boxEl) return;
    const measure = () => {
      const r = o.getBoundingClientRect();
      // The box's place in the stage, less the rise's slide (a transform on the way, not where it stands).
      let top = 0;
      let left = 0;
      for (let el: HTMLElement | null = boxEl; el && el !== o; el = el.offsetParent as HTMLElement | null) {
        top += el.offsetTop;
        left += el.offsetLeft;
      }
      setBox({ left: r.left + left, top: r.top + top, width: boxEl.clientWidth, height: boxEl.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(boxEl);
    observer.observe(o);
    return () => observer.disconnect();
  }, [boxEl, stage.top, stage.bottom]);

  return (
    <div ref={outer} data-floor-ui className={`fixed z-[7] overflow-hidden ${stage.className ?? ""}`} style={{ top: stage.top, height: Math.max(0, stage.bottom - stage.top) }}>
      <div
        role="dialog"
        aria-label={`${player.name}'s career`}
        className="flex h-full flex-col gap-1.5 transition-transform ease-out"
        style={{ transform: up ? "translateY(0)" : "translateY(100%)", transitionDuration: `${FLOOR_RISE_MS}ms` }}
      >
        {/* Who he is, on a see-through plate — and the way to every number, and out. */}
        <div className="flex shrink-0 items-center gap-2 border border-ink-primary bg-page/70 px-1.5 py-1 backdrop-blur-[3px]">
          <PlayerHeadshot playerId={player.playerId} sizeClass="h-8 w-8" square />
          <div className="min-w-0 flex-1 leading-tight">
            <h2 className="truncate text-sm font-extrabold uppercase tracking-wide text-ink-primary">{player.name}</h2>
            <p className="truncate text-[0.625rem] font-semibold uppercase text-ink-secondary">{bio}</p>
          </div>
          <button
            type="button"
            onClick={() => setView((v) => (v === "floor" ? "table" : "floor"))}
            aria-pressed={view === "table"}
            className="shrink-0 border border-ink-primary px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wide text-ink-primary transition-colors hover:bg-ink-primary hover:text-page"
          >
            {view === "floor" ? "Table" : "Floor"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center border border-ink-primary text-base font-bold leading-none text-ink-primary active:scale-90"
          >
            ×
          </button>
        </div>
        {view === "table" ? (
          // Every number there is, to scroll through.
          <div className="min-h-0 flex-1 overflow-y-auto border border-border bg-surface-raised/90 backdrop-blur-[3px]">{details}</div>
        ) : (
          <>
            {numbers ? <LineupTiles position={player.position} numbers={numbers} /> : null}
            {/* His seasons on the floor, the one picked read out over them. */}
            <div ref={setBoxEl} className="relative min-h-0 flex-1">
              <p aria-live="polite" className="relative z-[1] truncate text-center text-[0.6875rem] font-semibold tabular-nums text-ink-secondary">
                {seasons === null ? (
                  "Loading career…"
                ) : !line ? (
                  "No regular-season stats yet"
                ) : (
                  <>
                    <span className="font-extrabold text-ink-primary">{line.season}</span>
                    {line.team ? ` · ${line.team}` : ""} · {Math.round(line.stats.gp ?? 0)} GP ·{" "}
                    <span className="font-extrabold text-ink-primary">{line.points.toFixed(1)}</span> pts ·{" "}
                    {line.stats.gp ? (line.points / line.stats.gp).toFixed(1) : "–"} a game
                    {line.rank ? (
                      <>
                        {" · "}
                        <span className={`font-bold ${POSITION_TEXT_COLOR[player.position] ?? ""}`}>
                          {player.position}
                          {line.rank}
                        </span>
                      </>
                    ) : null}
                  </>
                )}
              </p>
              {box && list.length > 0 ? (
                <FloorBars
                  key={player.playerId}
                  bars={seasonBars(list, player.position)}
                  label="Fantasy points by season"
                  room={stage.room}
                  box={box}
                  picked={pick}
                  onPick={(i) => setPicked({ playerId: player.playerId, i })}
                />
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
