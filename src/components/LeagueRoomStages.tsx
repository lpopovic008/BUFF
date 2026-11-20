"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui/Icon";
import { CloseButton } from "@/components/LeagueRoomFloor";
import { SeasonLine } from "@/components/FloorCareer";
import { MatchupGraph, MatchupSide } from "@/components/MatchupGraph";
import type { LineupNumbers } from "@/components/PlayerCareer";
import { type LineNote, LineupPlayerRow } from "@/components/LeagueMatchupCarousel";
import { BenchCandidate, BenchFilterKey, benchFilters, benchList, StarterInSlot } from "@/lib/bench-groups";
import { ChartGame, ChartStat, chartColumn, FloorStairs, FloorStatBars, stairStep, statRows, useChartPan, useStairs, ValueLine, WallLine } from "@/components/PlayerStageCharts";
import { loadValueHistory } from "@/hooks/useLeagueTrades";
import { normalizeName } from "@/lib/name-match";
import { nflLogoUrl } from "@/lib/nfl-logos";
import { ordinal } from "@/lib/format";
import { StatTier, statTier } from "@/lib/stat-tiers";
import { playerHeadshotUrl } from "@/lib/sleeper";
import { CareerWeek, getCareer, getSeasonProjections, getSeasonWeeks, seasonPoints, seasonRank } from "@/lib/career-stats";
import { HORIZON_SHARE } from "@/lib/grid-room";
import { getPlayerBio, PlayerBio, ResolvedPlayer } from "@/lib/players";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import type { ResolvedSlot } from "@/hooks/useLeagueMatchupCarousel";
import type { NFLGame } from "@/lib/nfl-schedule";

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
  /** Told while a stage draws the floor itself (a player's stairs, see FloorStairs): the room's own grid put away. */
  onFloorAway?: (away: boolean) => void;
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
/**
 * The score graph as a stage: the whole week of it on the back wall, where the lineups were, and its title on the
 * floor in front.
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
  const { floor } = places;
  return (
    <>
      {/* The graph on the back wall. */}
      <div
        data-floor-ui
        className={`fixed z-[6] flex flex-col transition-[opacity,transform] ease-out ${up ? "opacity-100" : "translate-y-2 opacity-0"}`}
        style={{ ...places.wall, transitionDuration: `${STAGE_MS}ms` }}
      >
        <MatchupGraph mine={mine} theirs={theirs} weekGames={weekGames} scoring={scoring} />
      </div>
      {/* Its title on the floor. */}
      <div
        data-floor-ui
        className={`fixed z-[7] transition-opacity ease-out ${up ? "opacity-100" : "opacity-0"}`}
        style={{ top: floor.top, left: floor.left, width: floor.width, transitionDuration: `${STAGE_MS}ms` }}
      >
        <FloorTitle title="Score graph" sub="Whole week" onClose={onClose} back={back} />
      </div>
    </>
  );
}

/** "6'2\"" from inches. */
const feet = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;

/** His college's whole name, "St." spelled out as State. */
const collegeName = (college: string | null | undefined) => college?.trim().replace(/\bSt\.(?=\s|$)/g, "State") || null;

/**
 * Who a player is, across the top of his stage, in two lines: his photo over his team's logo beside them both; his
 * name and position, and his way out at the end of that line; under them his height and weight (and number). On the
 * right, each two lines level with those two: his trade-value rank over his season rank, his age over his years in
 * the league, and his college's name between the two — on a phone, where there's no room for it there, on a line of
 * its own under his height and weight.
 */
function PlayerHeader({ player, bio, numbers, onClose }: { player: ResolvedPlayer; bio: PlayerBio | null; numbers: LineupNumbers | null; onClose: () => void }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const size = bio?.height && bio.weight ? `${feet(bio.height)} ${bio.weight} lb` : null;
  const under = [size, bio?.number ? `#${bio.number}` : null].filter(Boolean).join(" · ");
  const years = bio?.yearsExp != null ? (bio.yearsExp === 0 ? "Rookie" : `${ordinal(bio.yearsExp + 1)} yr`) : null;
  const small = "whitespace-nowrap text-right text-[0.6875rem] font-semibold uppercase leading-tight";
  const college = collegeName(bio?.college);
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
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] grid-rows-[auto_auto_auto] items-end gap-x-1.5 sm:grid-rows-[auto_auto] sm:gap-x-2.5">
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
      {/* His college, between the two — on a phone, under his height and weight. */}
      {college ? (
        <>
          <span className="col-start-5 row-span-2 row-start-1 hidden max-w-[9rem] self-center text-right text-[0.6875rem] font-bold uppercase leading-tight text-ink-primary sm:block">{college}</span>
          <span className="col-span-3 col-start-2 row-start-3 truncate text-[0.6875rem] font-bold uppercase leading-tight text-ink-primary sm:hidden">{college}</span>
        </>
      ) : null}
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
 * Each position's stats on the floor's bars (see FloorStatBars), as Sleeper's game logs show them: the ones it leads
 * with (a passer's passing, a back's rushing, a receiver's receiving) as the primary ones, and the rest it shows
 * behind them — no fumbles or two-point conversions, which it doesn't.
 */
const CHART_STATS: Record<string, { primary: ChartStat[]; secondary: ChartStat[] }> = {
  QB: {
    primary: [stat("Cmp", "pass_cmp"), stat("Att", "pass_att"), stat("PYd", "pass_yd"), stat("PTD", "pass_td"), stat("Int", "pass_int")],
    secondary: [stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td")],
  },
  RB: {
    primary: [stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td")],
    secondary: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("RcYd", "rec_yd"), stat("RcTD", "rec_td")],
  },
  WR: {
    primary: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("RcYd", "rec_yd"), stat("RcTD", "rec_td")],
    secondary: [stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td")],
  },
  TE: {
    primary: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("RcYd", "rec_yd"), stat("RcTD", "rec_td")],
    secondary: [stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td")],
  },
  K: {
    primary: [stat("FG", "fgm"), stat("FGA", "fga"), stat("XP", "xpm"), stat("XPA", "xpa")],
    secondary: [stat("40-49", "fgm_40_49"), stat("50+", "fgm_50p")],
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
  startOn,
  valueFormat = "superflex",
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
  /** Opened on his value over time (from the Values page), not his current season. */
  startOn?: "value";
  /** Whose values his value over time is: superflex leagues' or 1QB's. */
  valueFormat?: "superflex" | "oneQB";
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
  // What Sleeper projected him for each week of it, as it loads.
  const [projections, setProjections] = useState<{ season: string; byWeek: Map<number, Record<string, number>> } | null>(null);
  useEffect(() => {
    if (!openSeason) return;
    let cancelled = false;
    getSeasonProjections(player.playerId, Number(openSeason)).then((byWeek) => !cancelled && setProjections({ season: openSeason, byWeek }));
    return () => {
      cancelled = true;
    };
  }, [player.playerId, openSeason]);
  const seasonProjections = openSeason && projections?.season === openSeason ? projections.byWeek : null;
  const [table, setTable] = useState(false);
  // His value over time (KTC's, see value-history.ts), in place of his seasons while it's picked.
  const [valueView, setValueView] = useState(startOn === "value");
  const [valuePoints, setValuePoints] = useState<{ day: number; value: number }[] | null>(null);
  useEffect(() => {
    if (!valueView) return;
    let cancelled = false;
    loadValueHistory().then((history) => {
      if (cancelled) return;
      const name = normalizeName(player.name);
      const series = history ? Object.values(history.players).find((p) => p.p === player.position && normalizeName(p.n) === name) : undefined;
      const values = series ? (valueFormat === "oneQB" ? series.q : series.sf) : [];
      setValuePoints(history ? values.flatMap((v, i) => (v == null ? [] : [{ day: history.from + i * history.step, value: v }])) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [valueView, player.name, player.position, valueFormat]);

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
      const projectedLine = seasonProjections?.get(week);
      const projected = projectedLine ? seasonPoints(projectedLine, scoring) : null;
      return {
        key: `w${week}`,
        value: points,
        projected,
        tag: String(week),
        stats: w.stats,
        tiers: tiersOf(player.position, allStats, w.stats),
        label: `Week ${week}${w.opponent ? ` against ${w.opponent}` : ""}: ${points.toFixed(1)} points${projected !== null ? ` (projected ${projected.toFixed(1)})` : ""}, ${chartStats.primary.map((r) => `${whole(w.stats[r.key])} ${r.label}`).join(", ")}`,
        short: `${openSeason} · Week ${week}${w.opponent ? ` · vs ${w.opponent}` : ""} · ${points.toFixed(1)} pts`,
      };
    });
  })();

  // The column read out: his latest, until another's picked — in whatever's shown.
  const [pickedCol, setPickedCol] = useState<{ view: string; i: number } | null>(null);
  const view = shown ?? "loading";
  const lastPlayed = columns ? columns.map((c, i) => (c.value === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1) : -1;
  const pick = pickedCol?.view === view && columns?.[pickedCol.i]?.value != null ? pickedCol.i : lastPlayed;
  const readout = valueView
    ? valuePoints === null
      ? "Loading…"
      : valuePoints.length > 0
        ? `KTC ${valueFormat === "oneQB" ? "1QB" : "superflex"} value now · ${Math.floor(valuePoints[valuePoints.length - 1].value / 100)}`
        : "No value history for him"
    : !columns
      ? "Loading…"
      : lastPlayed < 0
        ? openSeason
          ? `No games in ${openSeason}`
          : "No regular-season stats yet"
        : columns[pick].short;

  const { floor, room } = places;
  // The wall's line and the floor's bars: every game across, the middle one in the middle of the screen, each game's
  // column as wide as lets them all fit (see chartColumn); each of the stairs' steps as big as lets every stat's row fit
  // (see stairStep).
  const horizon = room.height * HORIZON_SHARE;
  const games = columns?.length ?? 0;
  const { pan, set: setPan, settle: settlePan } = useChartPan(view, (games - 1) / 2);
  const step = stairStep(statRows(chartStats.primary.length, chartStats.secondary.length), horizon, floor.bottom - 20);
  const col = chartColumn(games, horizon, floor.bottom - 20, floor.left, floor.left + floor.width, step);
  // The floor made stairs for his stats while they're up on it.
  const stairs = useStairs(up && !floorless && !table && !valueView);
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
        <div className="flex h-full min-h-fit flex-col gap-2">
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
                    {seasonButton("career", "Career", !table && !valueView && shown === "career", () => (setChosen("career"), setTable(false), setValueView(false)), "Every season he's played")}
                    {[...seasons].reverse().map((s) =>
                      seasonButton(s.season, s.season, !table && !valueView && shown === s.season, () => (setChosen(s.season), setTable(false), setValueView(false)), `His ${s.season} week by week`)
                    )}
                    {details ? seasonButton("table", "Table", table, () => (setTable((t) => !t), setValueView(false)), "Every number there is") : null}
                  </>
                )}
              </div>
              {/* His value over time: KTC's, from when it first listed him. */}
              <div className="flex gap-1 pt-0.5">
                {seasonButton("value", "Value over time", valueView, () => (setValueView(true), setTable(false)), "His trade value, KTC's, over time")}
              </div>
            </div>
          </section>
          {/* His points game by game, a line across the rest of the wall down to the floor (see WallLine) — or his value
              over time (see ValueLine). */}
          {valueView ? (
            <div className="relative min-h-[8rem] flex-1">
              {valuePoints ? <ValueLine points={valuePoints} label={`${player.name}'s trade value over time`} /> : null}
            </div>
          ) : columns && columns.length > 0 ? (
            <div className="relative min-h-[8rem] flex-1">
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
                col={col}
                screenWidth={room.width}
              />
            </div>
          ) : null}
        </div>
      </div>
      {floorless ? null : <FloorStairs room={room} horizon={horizon} pan={pan} q={stairs} col={col} step={step} onAway={places.onFloorAway} />}
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
          {columns && columns.length > 0 && !valueView ? (
            <FloorStatBars
              key={`bars-${view}`}
              games={columns}
              primary={chartStats.primary}
              secondary={chartStats.secondary}
              screenWidth={room.width}
              horizon={horizon}
              bottom={floor.bottom - 20}
              left={floor.left}
              right={floor.left + floor.width}
              col={col}
              step={step}
              picked={pick}
              onPick={(i) => setPickedCol({ view, i })}
              pan={pan}
              onPan={setPan}
              onSettle={settlePan}
              q={stairs}
              up={up}
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
 * Your bench as a stage: your bench players to pick from across the top of the wall, each once, most projected first —
 * or looked through another way (see benchList: the best matchups, who could outscore a starter, the hottest, who's on
 * bye) — the one picked a PlayerStage (at first, the first in the list).
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
  const [filter, setFilter] = useState<BenchFilterKey>("projected");
  const { filters, list } = useMemo(() => {
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
    const candidates = players.map(candidate);
    const filters = benchFilters(candidates, lineup);
    const key = filters.some((f) => f.key === filter) ? filter : "projected";
    return { filters, list: { key, entries: benchList(candidates, lineup, key) } };
  }, [players, starters, noteOf, filter]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  // The one picked while he's in the list; else the list's first.
  const shownId = pickedId && list.entries.some((e) => e.id === pickedId) ? pickedId : list.entries[0]?.id;
  const slot = players.find((b) => b.player!.playerId === shownId) ?? players[0];
  if (!slot) {
    return (
      <div data-floor-ui className="fixed z-[7] flex items-center gap-2 text-sm text-ink-secondary" style={{ top: stage.places.wall.top, left: stage.places.wall.left, width: stage.places.wall.width }}>
        <span className="min-w-0 flex-1">No one&rsquo;s on your bench.</span>
        <CloseButton onClose={stage.onClose} />
      </div>
    );
  }
  const byId = new Map(players.map((b) => [b.player!.playerId, b]));
  const filterRow = (
    <div role="group" aria-label="Look through your bench by" className="flex flex-wrap gap-1">
      {filters.map((f) => {
        const on = f.key === list.key;
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={on}
            onClick={() => setFilter(f.key)}
            className={`border px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide transition-colors ${
              on ? "border-ink-primary text-ink-primary" : "border-transparent text-ink-muted hover:text-ink-primary"
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
  // Just on the wall (beside the lineups, from laptop width up): the list alone, a player to a row, each laid out as
  // the lineups' right-hand side is (his photo at the right edge) and opening his card where theirs do.
  if (stage.floorless) {
    return (
      <div
        data-floor-ui
        className={`fixed z-[7] flex flex-col gap-2 transition-opacity ease-out ${stage.up ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={{ ...stage.places.wall, transitionDuration: `${STAGE_MS}ms` }}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{filterRow}</div>
          <CloseButton onClose={stage.onClose} />
        </div>
        {list.entries.length === 0 ? (
          <span className="text-xs text-ink-muted">No one.</span>
        ) : (
          <ul aria-label="Your bench" className="flex min-h-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden py-1">
            {list.entries.map(({ id, note }) => {
              const b = byId.get(id);
              if (!b?.player) return null;
              return (
                <li key={id} className="ml-auto flex w-full max-w-[19rem] flex-col items-stretch">
                  <LineupPlayerRow resolved={b} />
                  {/* What only this list says (who he'd outscore): under him, at the right. */}
                  {list.key === "outscore" && note ? <span className="pr-[2.75rem] text-right text-[0.5625rem] font-semibold tabular-nums text-ink-muted">{note}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
  const picker = (
    <div className="flex flex-col gap-1.5" aria-label="Your bench">
      {filterRow}
      {list.entries.length === 0 ? (
        <span className="text-xs text-ink-muted">No one.</span>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {list.entries.map(({ id, note }) => {
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
      )}
    </div>
  );
  return <PlayerStage key={slot.player!.playerId} {...stage} player={slot.player!} numbers={numbersOf(slot)} picker={picker} />;
}
