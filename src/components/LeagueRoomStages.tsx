"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui/Icon";
import { CloseButton, FloorTile, FloorTiles } from "@/components/LeagueRoomFloor";
import { SeasonLine } from "@/components/FloorCareer";
import { MatchupGraph, MatchupSide } from "@/components/MatchupGraph";
import type { LineupNumbers } from "@/components/PlayerCareer";
import type { LineNote } from "@/components/LeagueMatchupCarousel";
import { BenchCandidate, benchGroups, StarterInSlot } from "@/lib/bench-groups";
import { ChartGame, ChartStat, FloorStatBars, WallLine } from "@/components/PlayerStageCharts";
import { collegeLogo } from "@/lib/college-logos";
import { nflLogoUrl } from "@/lib/nfl-logos";
import { ordinal } from "@/lib/format";
import { StatTier, statTier } from "@/lib/stat-tiers";
import { playerHeadshotUrl } from "@/lib/sleeper";
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
export function FloorTitle({ title, sub, onClose, back, extra }: { title: string; sub?: string; onClose: () => void; back?: boolean; extra?: React.ReactNode }) {
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

const stat = (label: string, key: string): ChartStat => ({ label, key });
/**
 * Each position's stats on the floor's bars (see FloorStatBars): its primary ones, as Sleeper leads with them, and its
 * secondary ones behind them.
 */
const CHART_STATS: Record<string, { primary: ChartStat[]; secondary: ChartStat[] }> = {
  QB: {
    primary: [stat("PYd", "pass_yd"), stat("PTD", "pass_td"), stat("Int", "pass_int"), stat("RYd", "rush_yd"), stat("RTD", "rush_td")],
    secondary: [stat("Cmp", "pass_cmp"), stat("Att", "pass_att"), stat("Car", "rush_att"), stat("Sack", "pass_sack"), stat("Fum", "fum_lost")],
  },
  RB: {
    primary: [stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td"), stat("Rec", "rec"), stat("RcYd", "rec_yd"), stat("RcTD", "rec_td")],
    secondary: [stat("Tgt", "rec_tgt"), stat("Fum", "fum_lost"), stat("2Pt", "rush_2pt")],
  },
  WR: {
    primary: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("RcYd", "rec_yd"), stat("RcTD", "rec_td")],
    secondary: [stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td"), stat("Fum", "fum_lost")],
  },
  TE: {
    primary: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("RcYd", "rec_yd"), stat("RcTD", "rec_td")],
    secondary: [stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td"), stat("Fum", "fum_lost")],
  },
  K: {
    primary: [stat("FG", "fgm"), stat("FGA", "fga"), stat("XP", "xpm")],
    secondary: [stat("50+", "fgm_50p"), stat("XPA", "xpa"), stat("Miss", "fgmiss")],
  },
  DEF: {
    primary: [stat("Sack", "sack"), stat("Int", "int"), stat("FR", "fum_rec"), stat("TD", "def_td"), stat("PA", "pts_allow")],
    secondary: [stat("Saf", "safe"), stat("Blk", "blk_kick"), stat("YdA", "yds_allow")],
  },
};

/** A game (or a season) as the stage picks and reads it out. */
interface StageGame extends ChartGame {
  short: string;
}

/** A stat's value as it's painted: whole (Sleeper leaves a stat out when it's none). */
const whole = (v: number | undefined) => String(Math.round(v !== undefined && Number.isFinite(v) ? v : 0));
/** How good each of a game's stats was (see statTier) — or a season's, by what it came to a game (`games`). */
const tiersOf = (position: string, stats: ChartStat[], line: Record<string, number>, games = 1): Record<string, StatTier | null> =>
  Object.fromEntries(stats.map((r) => [r.key, games > 0 ? statTier(position, r.key, (Number.isFinite(line[r.key]) ? line[r.key] : 0) / games) : null]));

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
  floorless = false,
}: {
  places: StagePlaces;
  up: boolean;
  onClose: () => void;
  /** Just who he is and his seasons, on the wall: nothing of him on the floor (his seasons' bars and table). */
  floorless?: boolean;
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

  const chartStats = CHART_STATS[player.position] ?? CHART_STATS.WR;
  const allStats = [...chartStats.primary, ...chartStats.secondary];
  // The games: every week of the season picked (all of it, the weeks still to come too), a gap where he didn't play;
  // or every season of his.
  const columns: StageGame[] | null = (() => {
    if (seasons === null) return null;
    if (!openSeason) {
      return seasons.map((s) => ({
        key: s.season,
        value: s.points,
        tag: `'${s.season.slice(-2)}`,
        stats: s.stats,
        tiers: tiersOf(player.position, allStats, s.stats, s.stats.gp ?? 0),
        label: `${s.season}${s.team ? `, ${s.team}` : ""}: ${s.points.toFixed(1)} points${s.rank ? `, ${player.position}${s.rank}` : ""}`,
        short: `${s.season}${s.team ? ` · ${s.team}` : ""} · ${Math.round(s.stats.gp ?? 0)} GP · ${s.points.toFixed(1)} pts · ${
          s.stats.gp ? (s.points / s.stats.gp).toFixed(1) : "–"
        } a game${s.rank ? ` · ${player.position}${s.rank}` : ""}`,
      }));
    }
    if (!seasonWeeks) return null;
    const byWeek = new Map(seasonWeeks.map((w) => [w.week, w]));
    const last = Math.max(0, ...seasonWeeks.map((w) => w.week));
    const length = Math.max(last, Number(openSeason) >= 2021 ? 18 : 17);
    const thisSeason = Number(openSeason) === season;
    return Array.from({ length }, (_, k) => {
      const week = k + 1;
      const w = byWeek.get(week);
      if (!w) {
        const future = thisSeason && week > last;
        return { key: `w${week}`, value: null, tag: String(week), stats: null, tiers: {}, future, label: `Week ${week}: ${future ? "still to come" : "didn't play"}`, short: `Week ${week}` };
      }
      const points = seasonPoints(w.stats, scoring);
      return {
        key: `w${week}`,
        value: points,
        tag: String(week),
        stats: w.stats,
        tiers: tiersOf(player.position, allStats, w.stats),
        label: `Week ${week}${w.opponent ? ` against ${w.opponent}` : ""}: ${points.toFixed(1)} points, ${chartStats.primary.map((r) => `${whole(w.stats[r.key])} ${r.label}`).join(", ")}`,
        short: `${openSeason} · Week ${week}${w.opponent ? ` · vs ${w.opponent}` : ""} · ${points.toFixed(1)} pts`,
      };
    });
  })();

  // The column read out: his latest, until another's picked — in whatever's shown.
  const [pickedCol, setPickedCol] = useState<{ view: string; i: number } | null>(null);
  const view = shown ?? "loading";
  const lastPlayed = columns ? columns.map((c, i) => (c.value === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1) : -1;
  const pick = pickedCol?.view === view && columns?.[pickedCol.i]?.value != null ? pickedCol.i : lastPlayed;
  const readout = !columns ? "Loading…" : lastPlayed < 0 ? (openSeason ? `No games in ${openSeason}` : "No regular-season stats yet") : columns[pick].short;

  const { floor } = places;
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
        <div className="flex min-h-full flex-col gap-2">
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
          {/* His points game by game, a line across the rest of the wall (see WallLine). */}
          {columns && columns.length > 0 ? (
            <div className="min-h-[8rem] flex-1 pb-1">
              <WallLine
                key={`line-${view}`}
                games={columns}
                picked={pick}
                onPick={(i) => {
                  setPickedCol({ view, i });
                  // A season's dot looks into that season.
                  if (!openSeason && seasons?.[i]) setChosen(seasons[i].season);
                }}
                label={openSeason ? `${player.name}'s ${openSeason}, week by week` : `${player.name}'s fantasy points by season`}
              />
            </div>
          ) : null}
        </div>
      </div>
      {floorless ? null : table && details ? (
        <div
          data-floor-ui
          className={`fixed z-[7] overflow-y-auto border border-border bg-surface-raised/90 backdrop-blur-[3px] transition-opacity ease-out ${up ? "opacity-100" : "opacity-0"}`}
          style={{ top: floor.top, left: floor.left, width: floor.width, height: Math.max(0, floor.bottom - floor.top), transitionDuration: `${STAGE_MS}ms` }}
        >
          {details}
        </div>
      ) : (
        <div className={`transition-opacity ease-out ${up ? "opacity-100" : "pointer-events-none opacity-0"}`} style={{ transitionDuration: `${STAGE_MS}ms` }}>
          {columns && columns.length > 0 ? (
            <FloorStatBars
              key={`bars-${view}`}
              games={columns}
              primary={chartStats.primary}
              secondary={chartStats.secondary}
              top={floor.top}
              bottom={floor.bottom - 20}
              left={floor.left}
              right={floor.left + floor.width}
              picked={pick}
              onPick={(i) => setPickedCol({ view, i })}
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

/**
 * Your bench as a stage: your bench players to pick from across the top of the wall, in groups of what's worth
 * knowing (see benchGroups) — who could outscore a starter, who's projected most, the best matchups, the hottest, who's
 * on bye, then everyone — the one picked a PlayerStage (at first, the first in the first group).
 */
export function RoomBench({
  bench,
  starters,
  numbersOf,
  noteOf,
  ...stage
}: Omit<React.ComponentProps<typeof PlayerStage>, "title" | "player" | "numbers" | "picker" | "details"> & {
  bench: ResolvedSlot[];
  /** Your starters in their slots: who a bench player could outscore. */
  starters: ResolvedSlot[];
  numbersOf: (resolved: ResolvedSlot) => LineupNumbers;
  noteOf: (playerId: string) => LineNote | undefined;
}) {
  const players = bench.filter((b) => b.player);
  const groups = useMemo(() => {
    const candidate = (b: ResolvedSlot): BenchCandidate => {
      const note = noteOf(b.player!.playerId);
      return {
        id: b.player!.playerId,
        name: b.player!.name,
        position: b.player!.position,
        projected: note?.projected ?? null,
        matchup: note?.share ?? null,
        opponent: note?.opponent ?? null,
        bye: note?.bye ?? false,
        ppg: b.ppg,
      };
    };
    const lineup: StarterInSlot[] = starters.flatMap((s) =>
      s.player ? [{ slot: s.slot, id: s.player.playerId, name: s.player.name, projected: noteOf(s.player.playerId)?.projected ?? null }] : []
    );
    return benchGroups(players.map(candidate), lineup);
  }, [players, starters, noteOf]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const firstId = groups[0]?.players[0]?.id;
  const slot = players.find((b) => b.player!.playerId === (pickedId ?? firstId)) ?? players[0];
  if (!slot) {
    return (
      <div data-floor-ui className="fixed z-[7] flex items-center gap-2 text-sm text-ink-secondary" style={{ top: stage.places.wall.top, left: stage.places.wall.left, width: stage.places.wall.width }}>
        <span className="min-w-0 flex-1">No one&rsquo;s on your bench.</span>
        <CloseButton onClose={stage.onClose} />
      </div>
    );
  }
  const byId = new Map(players.map((b) => [b.player!.playerId, b]));
  const picker = (
    <div className="flex flex-col gap-1.5" aria-label="Your bench">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label} className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">{group.label}</span>
          <ul className="flex flex-wrap gap-1">
            {group.players.map(({ id, note }) => {
              const p = byId.get(id)?.player;
              if (!p) return null;
              const on = id === slot.player!.playerId;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPickedId(id)}
                    className={`flex items-baseline gap-1 border px-1.5 py-1 text-[0.6875rem] font-bold transition-colors ${
                      on ? "border-ink-primary bg-ink-primary text-page" : "border-border bg-page/60 text-ink-primary hover:border-ink-primary"
                    }`}
                  >
                    <span className={on ? "" : (POSITION_TEXT_COLOR[p.position] ?? "text-ink-secondary")}>{p.position}</span>
                    <span className="max-w-[9rem] truncate">{p.name}</span>
                    {note ? <span className={`font-semibold tabular-nums ${on ? "opacity-80" : "text-ink-muted"}`}>{note}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
  return <PlayerStage key={slot.player!.playerId} {...stage} player={slot.player!} numbers={numbersOf(slot)} picker={picker} />;
}
