"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui/Icon";
import { CloseButton } from "@/components/LeagueRoomFloor";
import { SeasonLine } from "@/components/FloorCareer";
import { MatchupGraph, MatchupSide } from "@/components/MatchupGraph";
import type { LineupNumbers } from "@/components/PlayerCareer";
import { type LineNote, LineupPlayerRow } from "@/components/LeagueMatchupCarousel";
import { BenchCandidate, BenchFilterKey, benchFilters, benchList, StarterInSlot } from "@/lib/bench-groups";
import { ChartGame, ChartStat, ValueLine, WallLine } from "@/components/PlayerStageCharts";
import { loadValueHistory } from "@/hooks/useLeagueTrades";
import { normalizeName } from "@/lib/name-match";
import { nflLogoUrl } from "@/lib/nfl-logos";
import { ordinal } from "@/lib/format";
import { getNFLState, playerHeadshotUrl, playerPhotoUrl } from "@/lib/sleeper";
import { CareerWeek, getCareer, getSeasonProjections, getSeasonWeeks, seasonPoints, seasonRank, type WeekProjection } from "@/lib/career-stats";
import { getPlayerBio, PlayerBio, ResolvedPlayer } from "@/lib/players";
import { FLOOR_TILT, floorDepth, floorScale, HORIZON_SHARE, PERSPECTIVE_PX } from "@/lib/grid-room";
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
  /** Where the room's horizon is (a share of its height), if not the stages' own (HORIZON_SHARE). */
  share?: number;
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

/** Something risen up out of the floor (`up`), else sunk back into it — `order` pieces after the first, a moment apart. */
function Upright({ up, order, className = "", children }: { up: boolean; order: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <div
        className="h-full transition-transform motion-reduce:transition-none"
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

const TILT_SIN = Math.sin((FLOOR_TILT * Math.PI) / 180);
const TILT_COS = Math.cos((FLOOR_TILT * Math.PI) / 180);
/** How much of what stands on the floor its reflection shows, under it (a share of its height). */
const REFLECTION_SHARE = 0.45;
/** A reflection's fade: faint at the foot of what it reflects, gone a little way down. */
const REFLECTION_FADE = `linear-gradient(to top, rgba(0, 0, 0, 0.3), transparent ${REFLECTION_SHARE * 100}%)`;
/** A photo's edges faded out, so it stands free of its own background. */
const PHOTO_FADE = "radial-gradient(ellipse 72% 78% at 50% 46%, #000 62%, transparent 100%)";
/** Free-floating text kept clear of the floor's lines behind it. */
const OVER_FLOOR: React.CSSProperties = { textShadow: "0 0 3px var(--page), 0 0 6px var(--page)" };

/**
 * Who a player is, standing up off the room's floor in a strip, risen out of it one piece after another — free of any
 * box, each piece standing on the floor and square to it, seen as the floor is (the room's own perspective, see
 * grid-room.ts, its horizon `share` of the way down): on its left his photo over his team's logo, turned to face the
 * middle; in the middle his name on a line (his jersey number at its end), his position, height and weight under it
 * smaller; and on its right, turned to face the middle too, his college, age and years in the league, and his
 * trade-value and season ranks. All of it as big as the floor's strip lets it stand. A soft shadow on the floor at each
 * one's foot.
 */
function PlayerDossier({
  player,
  bio,
  numbers,
  floor,
  room,
  share,
  up,
}: {
  player: ResolvedPlayer;
  bio: PlayerBio | null;
  numbers: LineupNumbers | null;
  floor: StagePlaces["floor"];
  room: StagePlaces["room"];
  share: number;
  up: boolean;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  // How tall his facts stand as they're set: drawn smaller where that's taller than the floor's strip lets them be.
  const [factsBox, setFactsBox] = useState<HTMLDivElement | null>(null);
  const [factsHeight, setFactsHeight] = useState(0);
  useEffect(() => {
    if (!factsBox) return;
    const measure = () => setFactsHeight(factsBox.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(factsBox);
    return () => observer.disconnect();
  }, [factsBox]);
  const horizon = room.height * share;
  // How tall it stands, and where: in the middle of the floor, it and its reflection under it together — how far back
  // that is on the floor, and how much nearer than the wall it shows things there.
  const floorTall = floor.bottom - floor.top;
  const tall = Math.max(24, Math.min(160, (floorTall - 8) / (1 + REFLECTION_SHARE)));
  const foot = floor.top + (floorTall - tall * (1 + REFLECTION_SHARE)) / 2 + tall;
  const depth = floorDepth(foot, room.height, share);
  const scale = floorScale(depth);
  const side = floor.width * 0.24;
  const middle = floor.width - 2 * side;
  const number = bio?.number ? ` #${bio.number}` : "";
  // The name on a line, as big as fits across the middle and up the strip over what's under it.
  const subSize = Math.max(9, Math.min(15, tall * 0.18));
  const name = player.name.toUpperCase();
  const size = Math.max(11, Math.min(48, (middle - 8) / (`${name}${number}`.length * 0.64), (tall - subSize * 1.4 - 4) / 1.05));
  const sub = [player.position, bio?.height ? feet(bio.height) : null, bio?.weight ? `${bio.weight} lb` : null].filter(Boolean);
  const photo = Math.min(side * 0.8, tall);
  const years = bio?.yearsExp != null ? (bio.yearsExp === 0 ? "Rookie" : `${ordinal(bio.yearsExp + 1)} yr`) : null;
  // His facts, in short lines: college; age; years; his ranks.
  const factSize = Math.max(8, Math.min(13, tall / 4.6));
  const ranks = [
    numbers?.valueRank != null ? { label: numbers.dynasty ? "Dynasty" : "Redraft", value: `${player.position}${numbers.valueRank}`, className: "text-series-4" } : null,
    numbers?.seasonRank != null ? { label: "Season", value: `${player.position}${numbers.seasonRank}`, className: "text-series-1" } : null,
  ].filter((r): r is { label: string; value: string; className: string } => r !== null);
  const ageYears = [bio?.age ? `${bio.age} yrs` : null, years].filter((part): part is string => !!part);
  const college = collegeName(bio?.college);
  // A piece standing on the floor at screen x `x` (its foot's middle): put there in the room, square to the floor
  // (leaning back with it from upright), turned `turn` degrees to face the middle, and drawn as big there as it's sized.
  const standing = (x: number, turn = 0): React.CSSProperties => ({
    left: room.width / 2,
    top: horizon,
    transform: `translate3d(${(x - room.width / 2) / scale}px, ${depth * TILT_COS}px, ${depth * TILT_SIN}px) rotateX(${FLOOR_TILT - 90}deg) rotateY(${turn}deg) scale(${1 / scale})`,
  });
  // A piece standing on the floor, and its reflection in the floor under it: the same, turned over about its foot,
  // faint and fading away from it. Its content (`draw`) told which it's drawing.
  const piece = (key: string, x: number, turn: number, draw: (reflected: boolean) => React.ReactNode) => (
    <Fragment key={key}>
      <div aria-hidden className="absolute" style={{ ...standing(x, turn), transform: `${standing(x, turn).transform} scaleY(-1)` }}>
        <div className="absolute bottom-0 left-0" style={{ maskImage: REFLECTION_FADE, WebkitMaskImage: REFLECTION_FADE }}>
          {draw(true)}
        </div>
      </div>
      <div className="absolute" style={standing(x, turn)}>
        <div className="absolute bottom-0 left-0">{draw(false)}</div>
      </div>
    </Fragment>
  );
  // The sides a little in from the floor's edges: turned, their outer edges come toward you, and grow.
  const [leftX, middleX, rightX] = [floor.left + side * 0.55, floor.left + floor.width / 2, floor.left + floor.width - side * 0.55];
  const sideWide = side * 0.8;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[7]"
      style={{ perspective: PERSPECTIVE_PX, perspectiveOrigin: `${room.width / 2}px ${horizon}px` }}
    >
      {/* His photo, over his team's logo, facing the middle. */}
      {piece("photo", leftX, SIDE_TURN, () => (
        <div className="-translate-x-1/2">
          <Upright up={up} order={0}>
            <div className="relative" style={{ width: sideWide, height: photo }}>
              {player.team ? (
                // eslint-disable-next-line @next/next/no-img-element -- a static SVG on a static export
                <img
                  src={nflLogoUrl(player.team)}
                  alt=""
                  // Behind his photo, faint; standing on the floor in its place, without one.
                  className={`absolute object-contain ${photoFailed ? "inset-x-[6%] bottom-0 h-[80%] w-[88%] object-bottom opacity-90" : "inset-[6%] h-[88%] w-[88%] opacity-35"}`}
                />
              ) : null}
              {photoFailed ? null : (
                // eslint-disable-next-line @next/next/no-img-element -- a remote Sleeper photo on a static export
                <img
                  src={playerPhotoUrl(player.playerId)}
                  alt=""
                  onError={() => setPhotoFailed(true)}
                  className="absolute inset-x-0 bottom-0 h-[96%] w-full object-contain object-bottom"
                  // Its edges faded into the floor, so it stands free of its picture's own background.
                  style={{ maskImage: PHOTO_FADE, WebkitMaskImage: PHOTO_FADE }}
                />
              )}
            </div>
          </Upright>
        </div>
      ))}
      {/* His name on a line, his number at its end; his position, height and weight under it. */}
      {piece("name", middleX, 0, (reflected) => (
        <div className="flex -translate-x-1/2 flex-col items-center text-center" style={{ width: middle }}>
          <Upright up={up} order={1}>
            {reflected ? (
              <span aria-hidden className="block whitespace-nowrap font-extrabold uppercase leading-[1.05] tracking-wide text-ink-primary" style={{ fontSize: size }}>
                {name}
                {number ? <span className="text-ink-muted">{number}</span> : null}
              </span>
            ) : (
              <h3 className="whitespace-nowrap font-extrabold uppercase leading-[1.05] tracking-wide text-ink-primary" style={{ fontSize: size, ...OVER_FLOOR }}>
                {name}
                {number ? <span className="text-ink-muted">{number}</span> : null}
              </h3>
            )}
          </Upright>
          <Upright up={up} order={2}>
            <p className="whitespace-nowrap font-bold uppercase tracking-wide text-ink-secondary" style={{ fontSize: subSize, ...(reflected ? {} : OVER_FLOOR) }}>
              {sub.map((part, i) => (
                <span key={i}>
                  {i > 0 ? " · " : ""}
                  <span className={i === 0 ? (POSITION_TEXT_COLOR[player.position] ?? "") : ""}>{part}</span>
                </span>
              ))}
            </p>
          </Upright>
        </div>
      ))}
      {/* His college, age and years, and ranks, facing the middle — drawn smaller where they'd stand taller than he does. */}
      {piece("facts", rightX, -SIDE_TURN, (reflected) => (
        <div style={{ transform: `translateX(-50%) scale(${factsHeight > tall ? tall / factsHeight : 1})`, transformOrigin: "50% 100%" }}>
          <Upright up={up} order={3}>
            <div
              ref={reflected ? undefined : setFactsBox}
              className="flex flex-col font-extrabold uppercase leading-tight"
              style={{ width: sideWide, fontSize: factSize, ...(reflected ? {} : OVER_FLOOR) }}
            >
              {college ? <span className="break-words text-ink-primary">{college}</span> : null}
              {ageYears.map((part) => (
                <span key={part} className="whitespace-nowrap text-ink-secondary">
                  {part}
                </span>
              ))}
              {ranks.length > 0 ? (
                // Each rank whole, the next on a line of its own where they don't fit side by side.
                <span className="flex flex-wrap gap-x-[0.6em]">
                  {ranks.map((r) => (
                    <span key={r.label} className="whitespace-nowrap">
                      <span className="text-ink-muted" style={{ fontSize: factSize * 0.8 }}>
                        {r.label}{" "}
                      </span>
                      <span className={r.className}>{r.value}</span>
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </Upright>
        </div>
      ))}
    </div>
  );
}

const stat = (label: string, key: string): ChartStat => ({ label, key });
/**
 * Each position's stats, a row of bars each under his points on the wall (see WallLine), as Sleeper's game logs show
 * them: the ones it leads with (a passer's passing, a back's rushing, a receiver's receiving) first, then the rest it
 * shows — no fumbles or two-point conversions, which it doesn't.
 */
const CHART_STATS: Record<string, ChartStat[]> = {
  QB: [stat("Cmp", "pass_cmp"), stat("Att", "pass_att"), stat("PYd", "pass_yd"), stat("PTD", "pass_td"), stat("Int", "pass_int"), stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td")],
  RB: [stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td"), stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("RcYd", "rec_yd"), stat("RcTD", "rec_td")],
  WR: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("RcYd", "rec_yd"), stat("RcTD", "rec_td"), stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td")],
  TE: [stat("Tgt", "rec_tgt"), stat("Rec", "rec"), stat("RcYd", "rec_yd"), stat("RcTD", "rec_td"), stat("Car", "rush_att"), stat("RYd", "rush_yd"), stat("RTD", "rush_td")],
  K: [stat("FG", "fgm"), stat("FGA", "fga"), stat("XP", "xpm"), stat("XPA", "xpa"), stat("40-49", "fgm_40_49"), stat("50+", "fgm_50p")],
  DEF: [stat("Sack", "sack"), stat("Int", "int"), stat("FR", "fum_rec"), stat("TD", "def_td"), stat("PA", "pts_allow"), stat("Saf", "safe"), stat("Blk", "blk_kick"), stat("YdA", "yds_allow")],
};

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
  const columns: ChartGame[] | null = (() => {
    if (seasons === null) return null;
    if (!openSeason) {
      return seasons.map((s) => ({
        key: s.season,
        value: s.points,
        stats: s.stats,
        tag: `'${s.season.slice(-2)}`,
        label: `${s.season}${s.team ? `, ${s.team}` : ""}: ${s.points.toFixed(1)} points${s.rank ? `, ${player.position}${s.rank}` : ""}`,
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
    return Array.from({ length }, (_, k): ChartGame => {
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
        };
      }
      const points = seasonPoints(w.stats, scoring);
      return {
        key: `w${week}`,
        value: points,
        stats: w.stats,
        projected,
        opponent: w.opponent ?? game?.opponent ?? null,
        tag: String(week),
        label: `Week ${week}${w.opponent ? ` against ${w.opponent}` : ""}: ${points.toFixed(1)} points${projected !== null ? ` (projected ${projected.toFixed(1)})` : ""}`,
      };
    });
  })();

  const view = shown ?? "loading";
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

  // Over his charts: his seasons to look into (or his career) and every number there is; at the right, his value over
  // time, and the card's way out.
  const controls = (
    <div className="flex flex-wrap items-center gap-1">
      {seasons === null ? (
        <span className="text-xs text-ink-muted">Loading…</span>
      ) : seasons.length === 0 ? (
        <span className="text-xs text-ink-muted">No seasons yet</span>
      ) : (
        <>
          {seasonButton("career", "Career", !table && !valueView && shown === "career", () => (setChosen("career"), setTable(false), setValueView(false)), "Every season he's played")}
          {[...seasons].reverse().map((s) =>
            seasonButton(s.season, s.season, !table && !valueView && shown === s.season, () => (setChosen(s.season), setTable(false), setValueView(false)), `His ${s.season} week by week`)
          )}
          {details ? seasonButton("table", "Table", table, () => (setTable((t) => !t), setValueView(false)), "Every number there is") : null}
        </>
      )}
      {/* His value over time (KTC's, from when it first listed him), and the way out: at the right. */}
      <span className="ml-auto flex items-center gap-1">
        {seasonButton("value", "Value over time", valueView, () => (setValueView(true), setTable(false)), "His trade value, KTC's, over time")}
        {floorless ? null : (
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${player.name}`}
            title="Close"
            className="flex h-7 w-6 shrink-0 items-center justify-center text-xl font-bold leading-none text-ink-primary transition-transform active:scale-90"
          >
            ×
          </button>
        )}
      </span>
    </div>
  );
  // His points game by game, with his stats under them (see WallLine) — or every number there is, or his value over
  // time (see ValueLine).
  const chart = table && details ? (
    <div data-floor-ui className="min-h-[8rem] flex-1 overflow-y-auto border border-border bg-surface-raised/90">
      {details}
    </div>
  ) : valueView ? (
    <div className="relative min-h-[8rem] flex-1">{valuePoints ? <ValueLine points={valuePoints} label={`${player.name}'s trade value over time`} /> : null}</div>
  ) : columns && columns.length > 0 ? (
    <div className="relative min-h-[8rem] flex-1">
      <WallLine
        key={`line-${view}`}
        games={columns}
        label={openSeason ? `${player.name}'s ${openSeason}, week by week` : `${player.name}'s fantasy points by season`}
        stats={CHART_STATS[player.position] ?? CHART_STATS.WR}
      />
    </div>
  ) : null;

  return floorless ? (
    // No floor: who he is, his seasons and his chart, all on the wall.
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
            {controls}
          </div>
        </section>
        {chart}
      </div>
    </div>
  ) : (
    <>
      {/* The wall: the bench to pick from (if it's the bench's), his seasons and his value over time over his charts. */}
      <div
        data-floor-ui
        aria-label={player.name}
        className={`fixed z-[6] flex flex-col gap-2 transition-[opacity,transform] ease-out ${up ? "opacity-100" : "translate-y-2 opacity-0"}`}
        style={{ ...places.wall, transitionDuration: `${STAGE_MS}ms` }}
      >
        {picker}
        {controls}
        {chart}
      </div>
      {/* Who he is, standing up off the floor. */}
      <div className={`transition-opacity ease-out ${up ? "opacity-100" : "pointer-events-none opacity-0"}`} style={{ transitionDuration: `${STAGE_MS}ms` }}>
        <PlayerDossier player={player} bio={bio} numbers={numbers} floor={floor} room={places.room} share={places.share ?? HORIZON_SHARE} up={up} />
      </div>
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
