"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui/Icon";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { CloseButton, FloorTile, FloorTiles } from "@/components/LeagueRoomFloor";
import { FloorBar, FloorBars, LineupTiles, seasonBars, SeasonLine } from "@/components/FloorCareer";
import { MatchupGraph, MatchupSide } from "@/components/MatchupGraph";
import { bioLine, LineupNumbers } from "@/components/PlayerCareer";
import { CareerWeek, getCareer, getSeasonWeeks, seasonPoints, seasonRank } from "@/lib/career-stats";
import { getPlayerBio, PlayerBio } from "@/lib/players";
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
function FloorTitle({ title, sub, onClose, back }: { title: string; sub?: string; onClose: () => void; back?: boolean }) {
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
      <CloseButton onClose={onClose} label={`Close ${title.toLowerCase()}`} />
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

/** A week of a player's as a bar on the floor: as tall as his points, the week and who he played in front. */
function weekBars(weeks: CareerWeek[], scoring?: Record<string, number>): FloorBar[] {
  return weeks.map((w) => {
    const points = seasonPoints(w.stats, scoring);
    return {
      key: `w${w.week}`,
      value: points,
      foot: `W${w.week}`,
      note: w.opponent ?? undefined,
      label: `Week ${w.week}${w.opponent ? ` against ${w.opponent}` : ""}: ${points.toFixed(1)} points`,
    };
  });
}

/**
 * Your bench as a stage: on the back wall, your bench players to pick from, and the one picked — who he is (every bit
 * of his bio), his numbers in the lineup, and the seasons he's played, to pick from. On the floor in front, his
 * career as bars standing on it (see FloorBars), a season's each; a season picked (on the wall, or its bar), that
 * season's weeks instead, a bar each.
 */
export function RoomBench({
  places,
  up,
  onClose,
  back,
  bench,
  numbersOf,
  season,
  scoring,
}: {
  places: StagePlaces;
  up: boolean;
  onClose: () => void;
  back?: boolean;
  bench: ResolvedSlot[];
  numbersOf: (resolved: ResolvedSlot) => LineupNumbers;
  /** The league's season, counted through. */
  season: number;
  scoring?: Record<string, number>;
}) {
  const players = bench.filter((b) => b.player);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const slot = players.find((b) => b.player!.playerId === pickedId) ?? players[0];
  const player = slot?.player ?? null;

  // His bio and his seasons, as they load.
  const [bio, setBio] = useState<{ id: string; bio: PlayerBio | null } | null>(null);
  const [career, setCareer] = useState<{ id: string; seasons: SeasonLine[] } | null>(null);
  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    const id = player.playerId;
    getPlayerBio(id).then((b) => !cancelled && setBio({ id, bio: b }));
    getCareer(id, season)
      .then((c) => !cancelled && setCareer({ id, seasons: c.map((s) => ({ ...s, points: seasonPoints(s.stats, scoring), rank: seasonRank(s.stats, scoring) })) }))
      .catch(() => !cancelled && setCareer({ id, seasons: [] }));
    return () => {
      cancelled = true;
    };
  }, [player, season, scoring]);
  const seasons = career && player && career.id === player.playerId ? career.seasons : null;

  // The season looked into (none: his career), and its weeks as they load.
  const [into, setInto] = useState<{ id: string; season: string } | null>(null);
  const openSeason = player && into?.id === player.playerId ? into.season : null;
  const [weeks, setWeeks] = useState<{ key: string; weeks: CareerWeek[] } | null>(null);
  useEffect(() => {
    if (!player || !openSeason) return;
    let cancelled = false;
    const key = `${player.playerId}-${openSeason}`;
    getSeasonWeeks(player.playerId, Number(openSeason)).then((w) => !cancelled && setWeeks({ key, weeks: w }));
    return () => {
      cancelled = true;
    };
  }, [player, openSeason]);
  const seasonWeeks = player && openSeason && weeks?.key === `${player.playerId}-${openSeason}` ? weeks.weeks : null;

  // The bar read out: the last, until another's picked — in whatever's shown.
  const [pickedBar, setPickedBar] = useState<{ view: string; i: number } | null>(null);
  const view = `${player?.playerId}-${openSeason ?? "career"}`;
  const bars = openSeason ? (seasonWeeks ? weekBars(seasonWeeks, scoring) : null) : seasons && player ? seasonBars(seasons, player.position) : null;
  const pick = pickedBar?.view === view && bars && pickedBar.i < bars.length ? pickedBar.i : (bars?.length ?? 0) - 1;
  const readout = (() => {
    if (!bars) return "Loading…";
    if (bars.length === 0) return openSeason ? `No games in ${openSeason}` : "No regular-season stats yet";
    if (openSeason && seasonWeeks) {
      const w = seasonWeeks[pick];
      const pts = seasonPoints(w.stats, scoring);
      return `${openSeason} · Week ${w.week}${w.opponent ? ` · vs ${w.opponent}` : ""} · ${pts.toFixed(1)} pts`;
    }
    const s = seasons![pick];
    return `${s.season}${s.team ? ` · ${s.team}` : ""} · ${Math.round(s.stats.gp ?? 0)} GP · ${s.points.toFixed(1)} pts · ${
      s.stats.gp ? (s.points / s.stats.gp).toFixed(1) : "–"
    } a game${s.rank ? ` · ${player!.position}${s.rank}` : ""}`;
  })();

  const [barsEl, setBarsEl] = useState<HTMLDivElement | null>(null);
  const box = useScreenBox(barsEl);
  const { floor, room } = places;
  const seasonButton = (key: string, label: string, on: boolean, onPick: () => void, title?: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={on}
      title={title}
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
      {/* The bench and the one picked, on the back wall. */}
      <div
        data-floor-ui
        className={`fixed z-[6] flex flex-col gap-2 overflow-y-auto transition-[opacity,transform] ease-out [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${up ? "opacity-100" : "translate-y-2 opacity-0"}`}
        style={{ ...places.wall, transitionDuration: `${STAGE_MS}ms` }}
      >
        {players.length === 0 ? (
          <p className="text-sm text-ink-secondary">No one&rsquo;s on your bench.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-1" aria-label="Your bench">
              {players.map((b) => {
                const p = b.player!;
                const on = p.playerId === player?.playerId;
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
            {player ? (
              <section aria-label={player.name} className="flex flex-col gap-2">
                {/* Who he is. */}
                <div className="flex items-center gap-2.5">
                  <PlayerHeadshot playerId={player.playerId} sizeClass="h-12 w-12" square />
                  <div className="min-w-0 leading-tight">
                    <h3 className="truncate text-lg font-extrabold uppercase tracking-wide text-ink-primary sm:text-xl">{player.name}</h3>
                    <p className="text-[0.6875rem] font-semibold uppercase text-ink-secondary">{bioLine(player, bio?.id === player.playerId ? bio.bio : null)}</p>
                  </div>
                </div>
                {slot ? <LineupTiles position={player.position} numbers={numbersOf(slot)} /> : null}
                {/* The seasons he's played, to look into — or his whole career. */}
                <div className="flex flex-col gap-1">
                  <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">Seasons played</span>
                  <div className="flex flex-wrap gap-1">
                    {seasons === null ? (
                      <span className="text-xs text-ink-muted">Loading…</span>
                    ) : seasons.length === 0 ? (
                      <span className="text-xs text-ink-muted">None yet</span>
                    ) : (
                      <>
                        {seasonButton("career", "Career", !openSeason, () => setInto(null), "Every season he's played")}
                        {[...seasons].reverse().map((s) => seasonButton(s.season, s.season, openSeason === s.season, () => setInto({ id: player.playerId, season: s.season }), `His ${s.season} week by week`))}
                      </>
                    )}
                  </div>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
      {/* His career, or a season's weeks, standing on the floor. */}
      {player ? (
        <div
          data-floor-ui
          className={`fixed z-[7] flex flex-col gap-1 transition-opacity ease-out ${up ? "opacity-100" : "pointer-events-none opacity-0"}`}
          style={{ top: floor.top, left: floor.left, width: floor.width, height: Math.max(0, floor.bottom - floor.top), transitionDuration: `${STAGE_MS}ms` }}
        >
          <FloorTitle title="Bench" sub={`${player.name} · ${openSeason ?? "Career"}`} onClose={onClose} back={back} />
          <p aria-live="polite" className="truncate text-center text-[0.6875rem] font-semibold tabular-nums text-ink-secondary">
            {readout}
          </p>
          <div ref={setBarsEl} className="relative min-h-0 flex-1">
            {box && bars && bars.length > 0 ? (
              <FloorBars
                key={view}
                bars={bars}
                label={openSeason ? `${player.name}'s ${openSeason}, week by week` : `${player.name}'s fantasy points by season`}
                room={room}
                box={box}
                reserve={0}
                picked={pick}
                slotMin={openSeason ? 18 : 30}
                most={openSeason ? 18 : 12}
                onPick={(i) => {
                  setPickedBar({ view, i });
                  // A season's bar looks into that season.
                  if (!openSeason && seasons?.[i]) setInto({ id: player.playerId, season: seasons[i].season });
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
