"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui/Icon";
import { CloseButton } from "@/components/LeagueRoomFloor";
import { SeasonLine } from "@/components/FloorCareer";
import { MatchupGraph, MatchupSide } from "@/components/MatchupGraph";
import type { LineupNumbers } from "@/components/PlayerCareer";
import { type LineNote, LineupPlayerRow } from "@/components/LeagueMatchupCarousel";
import { BenchCandidate, BenchFilterKey, benchFilters, benchList, StarterInSlot } from "@/lib/bench-groups";
import { ChartGame, ValueLine, WallLine } from "@/components/PlayerStageCharts";
import { loadValueHistory } from "@/hooks/useLeagueTrades";
import { normalizeName } from "@/lib/name-match";
import { nflLogoUrl } from "@/lib/nfl-logos";
import { ordinal } from "@/lib/format";
import { getNFLState, playerHeadshotUrl } from "@/lib/sleeper";
import { CareerWeek, getCareer, getSeasonProjections, getSeasonWeeks, seasonPoints, seasonRank, type WeekProjection } from "@/lib/career-stats";
import { getPlayerBio, PlayerBio, ResolvedPlayer } from "@/lib/players";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import type { ResolvedSlot } from "@/hooks/useLeagueMatchupCarousel";
import { getTeamSeason, type NFLGame, type TeamSeason } from "@/lib/nfl-schedule";

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

/** How long a piece of a player's dossier takes to rise up off the floor (ms), and how far apart they start. */
const RISE_MS = 650;
const RISE_STAGGER_MS = 90;
/** How far the dossier's side pieces are turned to face its middle (degrees). */
const SIDE_TURN = 28;
/** How near the eye the side pieces are seen from as they turn (px): near enough for the turn to show. */
const TURN_PERSPECTIVE = 380;

/**
 * Something standing up off the floor, its foot on it: risen out of the floor (`up`), else sunk back into it — `order`
 * pieces after the first, a moment apart. Turned `turn` degrees about its upright to face the floor's middle.
 */
function Upright({ up, order, turn = 0, className = "", style, children }: { up: boolean; order: number; turn?: number; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className={`overflow-hidden ${className}`} style={{ ...style, transform: turn ? `perspective(${TURN_PERSPECTIVE}px) rotateY(${turn}deg)` : undefined, transformOrigin: "50% 100%" }}>
      <div
        className="h-full transition-transform"
        style={{
          transform: up ? "translateY(0)" : "translateY(105%)",
          transitionDuration: `${RISE_MS}ms`,
          transitionDelay: `${up ? order * RISE_STAGGER_MS : 0}ms`,
          transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The name's lines (his first name over the rest, if one line would leave it small) and how big (px) to fit `width`. */
function nameFit(name: string, number: string, width: number): { lines: string[]; size: number } {
  // About how wide a letter of the name is, a share of its size (bold, uppercase, spaced out a little).
  const letter = 0.64;
  const MOST = 52;
  const one = `${name}${number}`;
  const oneSize = width / (one.length * letter);
  const words = name.split(" ");
  if (oneSize >= 22 || words.length < 2) return { lines: [name], size: Math.min(MOST, oneSize) };
  const lines = [words[0], words.slice(1).join(" ")];
  const longest = Math.max(lines[0].length, lines[1].length + number.length);
  return { lines, size: Math.min(MOST, width / (longest * letter)) };
}

/** A soft shadow on the floor at the foot of what stands there, `width` across. */
function FootShadow({ width }: { width: number }) {
  return <span aria-hidden className="absolute -bottom-1.5 left-1/2 h-3 -translate-x-1/2 rounded-[50%] bg-ink-primary/10 blur-[3px]" style={{ width }} />;
}

/**
 * Who a player is, standing up off the room's floor as a dossier, risen out of it one piece after another: on its
 * left his photo over his team's logo, turned to face the middle; in the middle his name, big (his jersey number at
 * its end), his position, height and weight under it smaller; and on its right, as tall as his photo and turned to
 * face the middle too, his college, age, years in the league, and his trade-value and season ranks.
 */
function PlayerDossier({ player, bio, numbers, floor, up }: { player: ResolvedPlayer; bio: PlayerBio | null; numbers: LineupNumbers | null; floor: StagePlaces["floor"]; up: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  // How tall what's on the right stands, for his photo to stand as tall.
  const [factsCell, setFactsCell] = useState<HTMLDivElement | null>(null);
  const [factsHeight, setFactsHeight] = useState(0);
  useEffect(() => {
    if (!factsCell) return;
    const measure = () => setFactsHeight(factsCell.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(factsCell);
    return () => observer.disconnect();
  }, [factsCell]);
  const height = floor.bottom - 24 - floor.top;
  // Where it all stands: well toward the front of the floor, over the column picked's readout.
  const foot = floor.top + height * 0.82;
  const side = floor.width * 0.24;
  const middle = floor.width - 2 * side;
  const number = bio?.number ? ` #${bio.number}` : "";
  const { lines, size } = nameFit(player.name.toUpperCase(), number, middle - 8);
  const sub = [player.position, bio?.height ? feet(bio.height) : null, bio?.weight ? `${bio.weight} lb` : null].filter(Boolean);
  const photo = Math.min(side - 8, (foot - floor.top) * 0.9);
  const years = bio?.yearsExp != null ? (bio.yearsExp === 0 ? "Rookie" : `${ordinal(bio.yearsExp + 1)} yr`) : null;
  const facts: { label: string; value: string | null; className?: string }[] = [
    { label: "College", value: collegeName(bio?.college) },
    { label: "Age", value: bio?.age ? String(bio.age) : null },
    { label: "Exp", value: years },
    { label: numbers?.dynasty ? "Dynasty" : "Redraft", value: numbers?.valueRank != null ? `${player.position}${numbers.valueRank}` : null, className: "text-series-4" },
    { label: "Season", value: numbers?.seasonRank != null ? `${player.position}${numbers.seasonRank}` : null, className: "text-series-1" },
  ];
  const panel = "border border-ink-primary/40 bg-page/75 backdrop-blur-[3px]";
  return (
    <div
      className="pointer-events-none fixed z-[7] grid items-end"
      style={{ top: floor.top, left: floor.left, width: floor.width, height: foot - floor.top, gridTemplateColumns: `${side}px ${middle}px ${side}px` }}
    >
      {/* His photo, over his team's logo, facing the middle — as tall as what's on the right. */}
      <div className="relative flex justify-center" style={{ height: Math.max(factsHeight, Math.min(photo, side - 10)) }}>
        <Upright up={up} order={0} turn={SIDE_TURN} className="h-full">
          <div className={`relative h-full ${panel}`} style={{ width: side - 10, minHeight: Math.min(photo, side - 10) }}>
            {player.team ? (
              // eslint-disable-next-line @next/next/no-img-element -- a static SVG on a static export
              <img src={nflLogoUrl(player.team)} alt="" className="absolute inset-[8%] h-[84%] w-[84%] object-contain opacity-40" />
            ) : null}
            {photoFailed ? null : (
              // eslint-disable-next-line @next/next/no-img-element -- a remote Sleeper photo on a static export
              <img src={playerHeadshotUrl(player.playerId)} alt="" onError={() => setPhotoFailed(true)} className="absolute inset-x-0 bottom-0 h-[90%] w-full object-cover object-top" />
            )}
          </div>
        </Upright>
        <FootShadow width={side - 4} />
      </div>
      {/* His name, big, his number at its end; his position, height and weight under it. */}
      <div className="relative flex flex-col items-center gap-1 text-center">
        <Upright up={up} order={1}>
          <h3 className="font-extrabold uppercase leading-[1.05] tracking-wide text-ink-primary" style={{ fontSize: size }}>
            {lines.map((line, i) => (
              <span key={i} className="block whitespace-nowrap">
                {line}
                {i === lines.length - 1 && number ? <span className="text-ink-muted">{number}</span> : null}
              </span>
            ))}
          </h3>
        </Upright>
        <Upright up={up} order={2}>
          <p className="whitespace-nowrap pb-0.5 font-bold uppercase tracking-wide text-ink-secondary" style={{ fontSize: Math.max(11, Math.min(18, size * 0.42)) }}>
            {sub.map((part, i) => (
              <span key={i}>
                {i > 0 ? " · " : ""}
                <span className={i === 0 ? (POSITION_TEXT_COLOR[player.position] ?? "") : ""}>{part}</span>
              </span>
            ))}
          </p>
        </Upright>
        <FootShadow width={middle * 0.7} />
      </div>
      {/* His college, age, years in the league and ranks, facing the middle. */}
      <div ref={setFactsCell} className="relative flex justify-center">
        <Upright up={up} order={3} turn={-SIDE_TURN}>
          <dl className={`flex flex-col justify-between gap-1 px-2 py-1.5 ${panel}`} style={{ width: side - 10, minHeight: Math.min(photo, side - 10) }}>
            {facts.map((f) =>
              f.value ? (
                <div key={f.label} className="leading-tight">
                  <dt className="text-[0.5625rem] font-bold uppercase tracking-wide text-ink-muted">{f.label}</dt>
                  <dd className={`text-[0.625rem] font-extrabold uppercase sm:text-xs ${f.className ?? "text-ink-primary"}`}>{f.value}</dd>
                </div>
              ) : null
            )}
          </dl>
        </Upright>
        <FootShadow width={side - 4} />
      </div>
    </div>
  );
}

/** A game (or a season) as the stage picks and reads it out. */
interface StageGame extends ChartGame {
  short: string;
}

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
  const [projections, setProjections] = useState<{ season: string; byWeek: Map<number, WeekProjection> } | null>(null);
  useEffect(() => {
    if (!openSeason) return;
    let cancelled = false;
    getSeasonProjections(player.playerId, Number(openSeason)).then((byWeek) => !cancelled && setProjections({ season: openSeason, byWeek }));
    return () => {
      cancelled = true;
    };
  }, [player.playerId, openSeason]);
  const seasonProjections = openSeason && projections?.season === openSeason ? projections.byWeek : null;
  // The schedules of the teams he was on that season (see getTeamSeason): their byes, and who they played each week.
  const seasonTeams = [...new Set((seasonWeeks ?? []).map((w) => w.team).filter((t): t is string => !!t))];
  const fallbackTeam = seasons?.find((s) => s.season === openSeason)?.team ?? player.team ?? null;
  if (seasonTeams.length === 0 && fallbackTeam) seasonTeams.push(fallbackTeam);
  const teamsKey = seasonWeeks ? seasonTeams.join(",") : "";
  const [schedules, setSchedules] = useState<{ key: string; byTeam: Map<string, TeamSeason | null> } | null>(null);
  useEffect(() => {
    if (!openSeason || !teamsKey) return;
    let cancelled = false;
    const teams = teamsKey.split(",");
    Promise.all(teams.map((t) => getTeamSeason(t, Number(openSeason)))).then(
      (found) => !cancelled && setSchedules({ key: `${openSeason}:${teamsKey}`, byTeam: new Map(teams.map((t, i) => [t, found[i]])) })
    );
    return () => {
      cancelled = true;
    };
  }, [openSeason, teamsKey]);
  const teamSchedules = schedules?.key === `${openSeason}:${teamsKey}` ? schedules.byTeam : null;
  // The NFL's week now (this season's weeks before it are behind us): a week past the last in the playoffs or after.
  const [nflNow, setNflNow] = useState<{ season: string; week: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getNFLState().then((s) => {
      if (cancelled || !s) return;
      const week = s.season_type === "regular" ? s.week : s.season_type === "pre" ? 0 : 99;
      setNflNow({ season: s.season, week });
    });
    return () => {
      cancelled = true;
    };
  }, []);
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

  // The games: every week of the season picked (all of it, the weeks still to come too), a gap where he didn't play;
  // or every season of his.
  const columns: StageGame[] | null = (() => {
    if (seasons === null) return null;
    if (!openSeason) {
      return seasons.map((s) => ({
        key: s.season,
        value: s.points,
        tag: `'${s.season.slice(-2)}`,
        label: `${s.season}${s.team ? `, ${s.team}` : ""}: ${s.points.toFixed(1)} points${s.rank ? `, ${player.position}${s.rank}` : ""}`,
        short: `${s.season}${s.team ? ` · ${s.team}` : ""} · ${Math.round(s.stats.gp ?? 0)} GP · ${s.points.toFixed(1)} pts · ${
          s.stats.gp ? (s.points / s.stats.gp).toFixed(1) : "–"
        } a game${s.rank ? ` · ${player.position}${s.rank}` : ""}`,
      }));
    }
    if (!seasonWeeks) return null;
    const byWeek = new Map(seasonWeeks.map((w) => [w.week, w]));
    const last = Math.max(0, ...seasonWeeks.filter((w) => w.played).map((w) => w.week));
    const length = Math.max(last, Number(openSeason) >= 2021 ? 18 : 17);
    const thisSeason = Number(openSeason) === season;
    const now = nflNow?.season === openSeason ? nflNow.week : null;
    // The team he was on a week: his that week, or the nearest week's he has one for.
    const teamOn = (week: number) => {
      for (let d = 0; d < length; d++) {
        const t = byWeek.get(week - d)?.team ?? byWeek.get(week + d)?.team;
        if (t) return t;
      }
      return fallbackTeam;
    };
    return Array.from({ length }, (_, k): StageGame => {
      const week = k + 1;
      const w = byWeek.get(week);
      const projectedLine = seasonProjections?.get(week);
      const projected = projectedLine ? seasonPoints(projectedLine.stats, scoring) : null;
      const team = teamOn(week);
      const schedule = team ? teamSchedules?.get(team) : null;
      const game = schedule?.games.get(week);
      if (!w?.played) {
        // A week with no game for him: his team's bye (the line runs on across it), one still to come, or one he
        // missed — counted as none, when his team played it (its schedule says, or Sleeper has him down for it).
        const behind = game?.final || !thisSeason || (now !== null ? week < now : week <= last);
        const bye = schedule ? schedule.byeWeek === week || !game : false;
        const hadGame = !!game || !!w || !!projectedLine?.opponent;
        const opponent = game?.opponent ?? w?.opponent ?? projectedLine?.opponent ?? null;
        if (!bye && hadGame && behind) {
          return {
            key: `w${week}`,
            value: 0,
            missed: true,
            projected,
            opponent,
            tag: String(week),
            label: `Week ${week}${opponent ? ` against ${opponent}` : ""}: didn't play, 0 points`,
            short: `${openSeason} · Week ${week}${opponent ? ` · vs ${opponent}` : ""} · Didn't play · 0 pts`,
          };
        }
        const future = !behind && !bye;
        return {
          key: `w${week}`,
          value: null,
          future,
          bye: !future,
          opponent: future ? opponent : null,
          tag: String(week),
          label: `Week ${week}: ${future ? `still to come${opponent ? `, against ${opponent}` : ""}` : "bye"}`,
          short: `Week ${week}`,
        };
      }
      const points = seasonPoints(w.stats, scoring);
      return {
        key: `w${week}`,
        value: points,
        projected,
        opponent: w.opponent ?? game?.opponent ?? null,
        tag: String(week),
        label: `Week ${week}${w.opponent ? ` against ${w.opponent}` : ""}: ${points.toFixed(1)} points${projected !== null ? ` (projected ${projected.toFixed(1)})` : ""}`,
        short: `${openSeason} · Week ${week}${w.opponent ? ` · vs ${w.opponent}` : ""} · ${points.toFixed(1)} pts`,
      };
    });
  })();

  // The column read out: his latest, until another's picked — in whatever's shown.
  const [pickedCol, setPickedCol] = useState<{ view: string; i: number } | null>(null);
  const view = shown ?? "loading";
  const lastPlayed = columns ? columns.map((c, i) => (c.value === null || c.missed ? -1 : i)).reduce((a, b) => Math.max(a, b), -1) : -1;
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
        <div className="flex h-full min-h-fit flex-col gap-2">
          {picker}
          <section aria-label={player.name} className="flex flex-col gap-2">
            {/* Who he is: here when there's no floor for it (else standing on the floor, see PlayerDossier). */}
            {floorless ? <PlayerHeader player={player} bio={bio} numbers={numbers} onClose={onClose} /> : null}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">Seasons played</span>
                {floorless ? null : (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={`Close ${player.name}`}
                    title="Close"
                    className="-my-1 flex h-7 w-6 items-center justify-center text-xl font-bold leading-none text-ink-primary transition-transform active:scale-90"
                  >
                    ×
                  </button>
                )}
              </div>
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
          {/* Who he is, standing up off the floor. */}
          <PlayerDossier player={player} bio={bio} numbers={numbers} floor={floor} up={up} />
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
