"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui/Icon";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { CloseButton, FloorTile, FloorTiles } from "@/components/LeagueRoomFloor";
import { FloorBar, FloorBars, LineupTiles, seasonBars, SeasonLine } from "@/components/FloorCareer";
import { MatchupGraph, MatchupSide } from "@/components/MatchupGraph";
import { bioLine, LineupNumbers } from "@/components/PlayerCareer";
import { CareerWeek, getCareer, getSeasonWeeks, seasonPoints, seasonRank } from "@/lib/career-stats";
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
 * A player as a stage: on the back wall (under `picker`, if there is one), who he is — every bit of his bio — his
 * numbers in the lineup, and the seasons he's played to pick from (his latest, at first, or his whole career). On the
 * floor in front, the season picked as bars standing on it, a week's each (see FloorBars) — or his career, a season's
 * each (a season's bar picks that season). With `details`, a Table button swaps the bars for every number there is.
 */
export function PlayerStage({
  places,
  up,
  onClose,
  back,
  title,
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
  back?: boolean;
  /** What the stage is called, on the floor ("Bench", "Player"). */
  title: string;
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

  // The bar read out: the last, until another's picked — in whatever's shown.
  const [pickedBar, setPickedBar] = useState<{ view: string; i: number } | null>(null);
  const view = shown ?? "loading";
  const bars = seasons === null ? null : openSeason ? (seasonWeeks ? weekBars(seasonWeeks, scoring) : null) : seasonBars(seasons, player.position);
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
    } a game${s.rank ? ` · ${player.position}${s.rank}` : ""}`;
  })();

  const [barsEl, setBarsEl] = useState<HTMLDivElement | null>(null);
  const box = useScreenBox(barsEl);
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
        className={`fixed z-[6] flex flex-col gap-2 overflow-y-auto transition-[opacity,transform] ease-out [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${up ? "opacity-100" : "translate-y-2 opacity-0"}`}
        style={{ ...places.wall, transitionDuration: `${STAGE_MS}ms` }}
      >
        {picker}
        <section aria-label={player.name} className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <PlayerHeadshot playerId={player.playerId} sizeClass="h-12 w-12" square />
            <div className="min-w-0 leading-tight">
              <h3 className="truncate text-lg font-extrabold uppercase tracking-wide text-ink-primary sm:text-xl">{player.name}</h3>
              <p className="text-[0.6875rem] font-semibold uppercase text-ink-secondary">{bioLine(player, bio)}</p>
            </div>
          </div>
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
                  {seasonButton("career", "Career", shown === "career", () => setChosen("career"), "Every season he's played")}
                  {[...seasons].reverse().map((s) => seasonButton(s.season, s.season, shown === s.season, () => setChosen(s.season), `His ${s.season} week by week`))}
                </>
              )}
            </div>
          </div>
        </section>
      </div>
      {/* The season picked (or his career) standing on the floor. */}
      <div
        data-floor-ui
        className={`fixed z-[7] flex flex-col gap-1 transition-opacity ease-out ${up ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={{ top: floor.top, left: floor.left, width: floor.width, height: Math.max(0, floor.bottom - floor.top), transitionDuration: `${STAGE_MS}ms` }}
      >
        <FloorTitle
          title={title}
          sub={`${player.name} · ${table ? "Table" : openSeason ?? "Career"}`}
          onClose={onClose}
          back={back}
          extra={
            details ? (
              <button
                type="button"
                onClick={() => setTable((t) => !t)}
                aria-pressed={table}
                className="ml-auto shrink-0 border border-ink-primary px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wide text-ink-primary transition-colors hover:bg-ink-primary hover:text-page"
              >
                {table ? "Floor" : "Table"}
              </button>
            ) : null
          }
        />
        {table && details ? (
          <div className="min-h-0 flex-1 overflow-y-auto border border-border bg-surface-raised/90 backdrop-blur-[3px]">{details}</div>
        ) : (
          <>
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
                    if (!openSeason && seasons?.[i]) setChosen(seasons[i].season);
                  }}
                />
              ) : null}
            </div>
          </>
        )}
      </div>
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
  return <PlayerStage key={slot.player!.playerId} {...stage} title="Bench" player={slot.player!} numbers={numbersOf(slot)} picker={picker} />;
}
