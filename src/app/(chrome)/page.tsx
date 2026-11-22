"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { MappedGame } from "@/components/GameMap";
import { FloorProjection, FloorProjectionTags } from "@/components/FloorProjector";
import { ProjectorPlace, fitProjector } from "@/lib/projector";
import { HORIZON_SHARE, lowestGridLine } from "@/lib/grid-room";
import { FloorGrid } from "@/components/FloorGrid";
import { FloorCameraControls, RED_ZONE_PLAYS_AT_MS, RED_ZONE_PLAYS_MS, RED_ZONE_SINK_MS } from "@/components/FloorCameraControls";
import { FloorReflection } from "@/components/FloorReflection";
import { FloorFields } from "@/components/FloorFields";
import { ScrollThumb } from "@/components/ScrollThumb";
import { useListScroll } from "@/hooks/useListScroll";
import { createFloorCameraStore } from "@/lib/floor-camera";
import { createFloorTiltStore } from "@/lib/floor-tilt";
import { LeagueTicker, TickerLeague } from "@/components/LeagueTicker";
import { ByeTeam, LeagueLegendEntry, StartersByGame, viewPlayers } from "@/components/StartersByGame";
import { NFL_TEAMS } from "@/lib/nfl-logos";
import { PointsGraphGrid } from "@/components/PointsGraph";
import { RedZone } from "@/components/RedZone";
import type { FeedEntry } from "@/hooks/useRedZoneFeed";
import type { GamePlay } from "@/lib/play-by-play";
import type { NFLGame } from "@/lib/nfl-schedule";
import { useConfig } from "@/hooks/useConfig";
import { MatchupTarget, useDashboardMatchups } from "@/hooks/useDashboardMatchups";
import { useAsItStands, useSummariesAsItStands } from "@/hooks/useAsItStands";
import { StarterSource, useMyStarters } from "@/hooks/useMyStarters";
import { useNFLState } from "@/hooks/useNFLState";
import { useWeekGames } from "@/hooks/useWeekGames";
import { useLivePlayerLines } from "@/hooks/useLivePlayerLines";
import { useLivePlayPoints } from "@/hooks/useLivePlayPoints";
import { getLeagueSummary, lastFinishedWeek, LeagueSummary, teamStandings } from "@/lib/league-data";
import { GameStarters, groupStartersByGame, GroupedStarter, startersListGames, withSides } from "@/lib/my-starters";
import { avatarUrl, getCurrentWeek, weighProjection } from "@/lib/sleeper";
import { kickoffBlockLabel } from "@/lib/game-map";
import { topFacing } from "@/lib/auto-graphs";
import { setHeaderWeek } from "@/lib/header-week";
import { getHomeView, saveHomeView, TrackedLeague, visibleLeagues } from "@/lib/localStore";

interface LoadedLeague {
  tracked: TrackedLeague;
  summary: LeagueSummary;
}

/** The NFL regular season's weeks, all of which the header's week picker offers. */
const NFL_WEEKS = 18;

/** How many players' graphs can be up at once, in place of the map. */
const MAX_GRAPHS = 4;

// From tablet width up, where the map and the Red Zone share a column the screen's height.
const DESKTOP = "(min-width: 768px)";
// The Red Zone, up: how far it floats over the floor (a couple of px), and how tall it is at first: a play of three
// players, under its header (on a tablet or wider, on fewer lines). (It rises once the floor's slid away from under
// it, see FloorCameraControls.)
// The Red Zone dragged by its header: how far before it's a drag (not a tap), px; and flung down to put it away — how
// fast (px/ms, over the last stretch of the drag) and at least how far, px.
const DRAG_START_PX = 6;
const FLING_PX_PER_MS = 0.8;
const FLING_WINDOW_MS = 100;
const FLING_MIN_PX = 24;
const RED_ZONE_FLOAT_REM = 0.125;
const RED_ZONE_REM = 10.5;
/** How long before its kickoff a game's field comes onto the floor (see FloorFields, which flies jets over it then). */
const FIELD_LEAD_MS = 5 * 60_000;
/** The longest a Red Zone play picked to be acted out again holds the floor, should its field never say it's over. */
const REPLAY_MOST_MS = 30_000;
// From tablet width up, the player graphs at the back of the room: from under the ticker down to the horizon.
// From tablet width up, how far down the starters list's first row sits: under the header and ticker, and the gap.
const UNDER_TICKER = "var(--header-h, 0px) + var(--ticker-h, 0px) + 0.625rem";
const COLUMN_TO_HORIZON = `(var(--room-h, 100vh) * ${HORIZON_SHARE} - var(--header-h, 0px) - var(--ticker-h, 0px) - 0.625rem)`;
const onDesktopChange = (listener: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

export default function DashboardPage() {
  const { config, loaded } = useConfig();
  const desktop = useSyncExternalStore(onDesktopChange, () => window.matchMedia(DESKTOP).matches, () => false);
  // The room fits the screen: the page itself never scrolls (nothing but the starters list and the Red Zone's plays do).
  useEffect(() => {
    const [html, body] = [document.documentElement.style, document.body.style];
    const was = [html.overflow, html.overscrollBehavior, body.overflow, body.overscrollBehavior];
    html.overflow = body.overflow = "hidden";
    html.overscrollBehavior = body.overscrollBehavior = "none";
    window.scrollTo(0, 0);
    return () => {
      [html.overflow, html.overscrollBehavior, body.overflow, body.overscrollBehavior] = was;
    };
  }, []);
  const [leagues, setLeagues] = useState<LoadedLeague[] | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  // The week shown: the current one, unless another's been picked from the header's "Week N".
  const [viewWeek, setViewWeek] = useState<number | null>(null);
  const shownWeek = viewWeek ?? week;
  useEffect(() => {
    setHeaderWeek(
      week != null && shownWeek != null
        ? { week: shownWeek, currentWeek: week, lastWeek: NFL_WEEKS, regularSeasonWeeks: null, onChange: setViewWeek }
        : null
    );
  }, [week, shownWeek]);
  useEffect(() => () => setHeaderWeek(null), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      if (config.leagues.length === 0) {
        setLeagues([]);
        return;
      }
      setLeagues(null);
      setError(null);
      try {
        const currentWeek = await getCurrentWeek();
        if (cancelled) return;
        setWeek(currentWeek);
        const summaries = await Promise.all(
          // Leagues hidden in Settings aren't loaded at all: out of the ticker, the starters, the map and the Red Zone.
          visibleLeagues(config.leagues).map(async (tracked) => {
            const summary = await getLeagueSummary(tracked.leagueId, currentWeek);
            return summary ? { tracked, summary } : null;
          })
        );
        if (cancelled) return;
        setLeagues(summaries.filter((s): s is LoadedLeague => s !== null));
      } catch {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, config.leagues]);

  const matchupTargets = useMemo<MatchupTarget[]>(() => {
    if (!leagues) return [];
    return leagues
      .map(({ tracked, summary }) => {
        const myRow = summary.standings.find((r) => r.ownerId === config.sleeperUserId);
        return myRow ? { leagueId: tracked.leagueId, myRosterId: myRow.rosterId } : null;
      })
      .filter((t): t is MatchupTarget => t !== null);
  }, [leagues, config.sleeperUserId]);
  const matchups = useDashboardMatchups(matchupTargets, shownWeek);
  // Each league's standings — counting the week being played, when "as it stands" is on.
  const officialSummaries = useMemo(() => leagues?.map((l) => l.summary) ?? null, [leagues]);
  const shownSummaries = useSummariesAsItStands(officialSummaries);
  const asItStands = useAsItStands();

  // Your starters across every league, filed under the NFL game each is
  // playing in — one box for all leagues, rather than a few faces per league.
  const starterSources = useMemo<StarterSource[]>(() => {
    if (!leagues) return [];
    return leagues
      .map(({ tracked, summary }) => {
        const myRow = summary.standings.find((r) => r.ownerId === config.sleeperUserId);
        return myRow
          ? { leagueId: tracked.leagueId, leagueName: summary.league.name, myRosterId: myRow.rosterId }
          : null;
      })
      .filter((s): s is StarterSource => s !== null);
  }, [leagues, config.sleeperUserId]);

  const nflPhase = useNFLState();
  const weekGames = useWeekGames(nflPhase.season ?? config.season, shownWeek);
  const { mine: myStarters, opponent: opponentStarters } = useMyStarters(starterSources, shownWeek);

  // Leagues hidden in Settings stay out of the starters, the map and the Red Zone.
  const effectiveSelected = useMemo(
    () => new Set(config.leagues.filter((l) => !l.hidden).map((l) => l.leagueId)),
    [config.leagues]
  );

  // Kickoff windows ("Sunday Noon") whose games are hidden from the map and
  // folded shut in the starters list — toggled from the list's block headers.
  // In the current week, a window closes itself once all its games are final
  // (a past week's are all final, so they all stay open); otherwise everything
  // shows. A header tap overrides that either way, and sticks — for that week.
  const [blockState, setBlockState] = useState<{ week: number | null; choices: Map<string, boolean> }>(() => ({ week: null, choices: new Map() }));
  const blockChoices = useMemo(
    () => (blockState.week === shownWeek ? blockState.choices : new Map<string, boolean>()),
    [blockState, shownWeek]
  );
  const finalBlocks = useMemo(() => {
    if (shownWeek !== week) return new Set<string>();
    const byLabel = new Map<string, boolean>();
    for (const game of weekGames) {
      const label = kickoffBlockLabel(game);
      byLabel.set(label, (byLabel.get(label) ?? true) && game.state === "post");
    }
    return new Set([...byLabel].filter(([, final]) => final).map(([label]) => label));
  }, [weekGames, shownWeek, week]);
  const hiddenBlocks = useMemo(() => {
    const hidden = new Set<string>();
    for (const label of finalBlocks) if (blockChoices.get(label) !== true) hidden.add(label);
    for (const [label, shown] of blockChoices) if (!shown) hidden.add(label);
    return hidden;
  }, [finalBlocks, blockChoices]);
  const toggleBlock = (label: string) => {
    setBlockState({ week: shownWeek, choices: new Map(blockChoices).set(label, hiddenBlocks.has(label)) });
  };
  // Single games hidden from the map and the Red Zone (their matchups swiped over in the starters list) — for
  // that week, and kept on this browser, so they're still hidden after a reload.
  const [mapOff, setMapOff] = useState<{ week: number | null; ids: Set<string> }>(() => ({ week: null, ids: new Set() }));
  useEffect(() => {
    const saved = getHomeView().hiddenGames;
    if (saved) queueMicrotask(() => setMapOff({ week: saved.week, ids: new Set(saved.ids) }));
  }, []);
  const offMap = useMemo(() => (mapOff.week === shownWeek ? mapOff.ids : new Set<string>()), [mapOff, shownWeek]);
  const toggleMap = (gameId: string) => {
    const ids = new Set(offMap);
    if (ids.has(gameId)) ids.delete(gameId);
    else ids.add(gameId);
    setMapOff({ week: shownWeek, ids });
    saveHomeView({ hiddenGames: shownWeek != null && ids.size > 0 ? { week: shownWeek, ids: [...ids] } : undefined });
  };
  // The players whose points-over-time graphs are up in place of the map (tapped in the starters list), up to four — for that week.
  // Kept on this browser, so they're still up after a reload until closed.
  const [graphPicks, setGraphPicksState] = useState<{ week: number | null; picks: { playerId: string; gameId: string }[] }>(() => ({ week: null, picks: [] }));
  const setGraphPicks = (next: { week: number | null; picks: { playerId: string; gameId: string }[] }) => {
    setGraphPicksState(next);
    saveHomeView({ graphs: next.week != null && next.picks.length > 0 ? { week: next.week, picks: next.picks } : undefined });
  };
  useEffect(() => {
    const saved = getHomeView().graphs;
    if (saved) queueMicrotask(() => setGraphPicksState(saved));
  }, []);
  const graphFor = useMemo(() => (graphPicks.week === shownWeek ? graphPicks.picks : []), [graphPicks, shownWeek]);
  const pickGraph = (playerId: string, gameId: string) => {
    const already = graphFor.some((p) => p.playerId === playerId && p.gameId === gameId);
    // Tapped again, theirs comes down; a fifth pushes the first one out.
    const picks = already
      ? graphFor.filter((p) => !(p.playerId === playerId && p.gameId === gameId))
      : [...graphFor, { playerId, gameId }].slice(-MAX_GRAPHS);
    // The page stays where it is, so more players can be picked; the graphs are up the page to scroll back to.
    setGraphPicks({ week: shownWeek, picks });
  };
  // The Red Zone up out of the floor in front of you (see redZoneStage); stretched (⇕) from there up over the screen,
  // the map out of its way.
  const [redZoneUp, setRedZoneUp] = useState(false);
  // ⇕ stretches it a step at a time: to just short of the horizon (from tablet width up, two of the floor's squares
  // back from its front line — where it comes up to, there), then up to the ticker (on a phone, the starters list sinking into the floor first, out of its
  // way), then back.
  const [redZoneLevel, setRedZoneLevel] = useState<0 | 1 | 2>(0);
  // Or dragged by its header to as tall as you like (no taller than stretched all the way): its top, while it's set so.
  const [redZoneDragTop, setRedZoneDragTop] = useState<number | null>(null);
  const [redZoneDragging, setRedZoneDragging] = useState(false);
  const stretchRedZone = () => {
    setRedZoneDragTop(null);
    setRedZoneLevel((level) => ((level + 1) % 3) as 0 | 1 | 2);
  };
  const redZoneFull = redZoneLevel === 2;
  // On its way back down into the floor (its reflection along with it, see redZoneStage).
  const [redZoneSinking, setRedZoneSinking] = useState(false);
  // Put away from wherever it stands (its header where it is, to the end); back to its first step only once it's gone.
  const switchRedZone = (on: boolean) => {
    setRedZoneUp(on);
    setRedZoneSinking(!on);
    if (!on) return;
    setRedZoneLevel(desktop ? 1 : 0);
    setRedZoneDragTop(null);
  };
  // A Red Zone play picked to be acted out again on its game's field (see FloorFields' replay) — a field of its own
  // laid for it if its game hasn't one, the map out of its way. On a phone, the Red Zone's let down to its first step
  // while it plays, so the floor's in sight; once it's over, the page goes back just as it was.
  const [replay, setReplay] = useState<{
    game: NFLGame;
    play: GamePlay;
    key: number;
    restore: { level: 0 | 1 | 2; dragTop: number | null } | null;
  } | null>(null);
  const pickPlay = (entry: FeedEntry) => {
    const lowered = !desktop && (redZoneLevel !== 0 || redZoneDragTop !== null);
    setReplay({
      game: entry.game,
      play: entry.play,
      key: (replay?.key ?? 0) + 1,
      restore: replay?.restore ?? (lowered ? { level: redZoneLevel, dragTop: redZoneDragTop } : null),
    });
    if (lowered) {
      setRedZoneLevel(0);
      setRedZoneDragTop(null);
    }
  };
  const replayed = (key: number) => {
    if (replay?.key !== key) return;
    if (replay.restore && redZoneUp) {
      setRedZoneLevel(replay.restore.level);
      setRedZoneDragTop(replay.restore.dragTop);
    }
    setReplay(null);
  };
  // (Never left hanging: a play's over in seconds, however it went.)
  const replayKey = replay?.key ?? null;
  useEffect(() => {
    if (replayKey === null) return;
    const id = window.setTimeout(() => setReplay((r) => (r?.key === replayKey ? null : r)), REPLAY_MOST_MS);
    return () => window.clearTimeout(id);
  }, [replayKey]);
  useEffect(() => {
    if (!redZoneSinking) return;
    const done = setTimeout(() => {
      setRedZoneSinking(false);
      setRedZoneLevel(0);
      setRedZoneDragTop(null);
    }, RED_ZONE_SINK_MS);
    return () => clearTimeout(done);
  }, [redZoneSinking]);
  // Up out of the floor on its own when the week's first game kicks off — once a week (remembered in this browser),
  // the week that's on, whether you're watching then or come by later.
  const weekUnderway = week !== null && shownWeek === week && weekGames.some((g) => g.state !== "pre");
  const season = nflPhase.season ?? config.season;
  useEffect(() => {
    if (!weekUnderway) return;
    const key = `commish:red-zone-up:${season}:${week}`;
    const up = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "1");
      } catch {
        return;
      }
      setRedZoneUp(true);
      setRedZoneSinking(false);
      if (window.matchMedia(DESKTOP).matches) setRedZoneLevel(1);
    });
    return () => cancelAnimationFrame(up);
  }, [weekUnderway, season, week]);
  // From tablet width up, it's up from the start, halfway back to the horizon — once there's a Red Zone to show.
  const redZoneReady = weekGames.length > 0 && myStarters !== null;
  const startedUp = useRef(false);
  useEffect(() => {
    if (!desktop || !redZoneReady || startedUp.current) return;
    startedUp.current = true;
    const up = requestAnimationFrame(() => {
      setRedZoneUp(true);
      setRedZoneSinking(false);
      setRedZoneLevel(1);
    });
    return () => cancelAnimationFrame(up);
  }, [desktop, redZoneReady]);
  // The Red Zone's place on the floor, reflected in it (see FloorReflection).
  const [redZoneBox, setRedZoneBox] = useState<HTMLDivElement | null>(null);
  // The room's height as it's drawn (not 100vh, which a browser's toolbars can make taller than the screen); how far up
  // from its bottom the floor's lowest grid line is — where the starters list stands from tablet width up, and the Red
  // Zone comes up; the horizon; the projected map over the floor (see projector.ts) and its top; and the root font
  // size — screen y's, from the top.
  const [stand, setStand] = useState<{
    room: number;
    on: number;
    horizon: number;
    projector: ProjectorPlace;
    /** The line on the floor the Red Zone comes up out of (see redZoneStage). */
    redZoneLine: number;
    /** Where the Red Zone stands while it's up: on that line from tablet width up; on a phone, down on the tab bar's
     * top, reflected from there. */
    redZoneFoot: number;
    /** The floor live games' fields are laid on (see FloorFields): across, and from its front back to its back. */
    fields: { left: number; right: number; front: number; back: number; centered?: boolean };
    rootPx: number;
  } | null>(null);
  // The room's only drawn once the leagues are in (not while the page is loading), so it's measured once it is.
  const [room, setRoom] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!room) return;
    const measure = () => {
      const height = room.clientHeight || window.innerHeight;
      const width = window.innerWidth;
      const css = getComputedStyle(document.documentElement);
      const tabBar = parseFloat(css.getPropertyValue("--tabbar-h")) || 0;
      const rootPx = parseFloat(css.fontSize) || 16;
      // The projector's spot in the middle of the floor near its front edge (the screen's bottom, or a phone's tab bar),
      // the map it throws floating over the floor above it, in the middle of the screen across: on a phone, as wide as
      // the screen, reaching up no higher than the horizon (the starters list over it); from tablet width up, between
      // the Red Zone's column and the starters list's (as wide as each other), as large as fits there under the ticker.
      const desk = window.matchMedia(DESKTOP).matches;
      const horizonY = height * HORIZON_SHARE;
      const column = rootPx * (window.matchMedia("(min-width: 1024px)").matches ? 18 : 16);
      const projector = desk
        ? fitProjector({
            width,
            height,
            share: HORIZON_SHARE,
            centerX: width / 2,
            bottom: height,
            maxWidth: width - 2 * (column + 2 * rootPx),
            // Under the ticker, the kickoff countdown over it.
            highest: Math.max(height * 0.24, (parseFloat(css.getPropertyValue("--header-h")) || 0) + (parseFloat(css.getPropertyValue("--ticker-h")) || 0) + 3 * rootPx),
          })
        : // On a phone, as big as fits across the screen and down from the horizon, its foot as low as leaves the beam
          // a little room over the spot.
          fitProjector({ width, height, share: HORIZON_SHARE, centerX: width / 2, bottom: height - tabBar, maxWidth: width - 1.5 * rootPx, highest: horizonY + 0.5 * rootPx, beamGap: 5.5 * rootPx });
      // Its switch's top: 0.75rem off the bottom (or a phone's tab bar), and 2.5rem tall.
      const redZoneLine = height - (desk ? 0 : tabBar) - 3.25 * rootPx;
      setStand({
        room: height,
        redZoneLine,
        redZoneFoot: desk ? redZoneLine : height - tabBar,
        // From tablet width up, centered north to south on the floor, the nearest row's outermost end lines on the Red
        // Zone's column's edge and the starters list's (each a column 1rem in from the screen's side, see layCentered);
        // on a phone, across the screen, down to the Red Zone's switch.
        fields: desk
          ? { left: rootPx + column, right: width - rootPx - column, front: height - 0.75 * rootPx, back: horizonY + 0.5 * rootPx, centered: true }
          : { left: rootPx, right: width - rootPx, front: redZoneLine - 0.5 * rootPx, back: horizonY + 0.25 * rootPx },
        on: height - lowestGridLine(height),
        horizon: height * HORIZON_SHARE,
        projector,
        rootPx,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [room, desktop]);
  // The Red Zone's header grabbed and dragged (while it's up): its top where it's dragged to, as high as stretched all
  // the way (under the ticker) and as low as leaves its header — flung down, put away. A drag isn't a tap on what it
  // started on (its title, its switch).
  const redZoneDrag = useRef({ up: false, line: 0, away: () => {} });
  useEffect(() => {
    redZoneDrag.current = { up: redZoneUp, line: stand?.redZoneFoot ?? 0, away: () => switchRedZone(false) };
  });
  useEffect(() => {
    const box = redZoneBox;
    // From tablet width up it's a column of its own, as tall as it is: nothing to drag.
    if (!box || desktop) return;
    let drag: { id: number; y0: number; top0: number; lowest: number; moved: boolean; trail: [number, number][] } | null = null;
    const highest = () => {
      const css = getComputedStyle(document.documentElement);
      const px = (name: string) => parseFloat(css.getPropertyValue(name)) || 0;
      return px("--header-h") + px("--ticker-h") + 0.625 * (parseFloat(css.fontSize) || 16);
    };
    const down = (e: PointerEvent) => {
      const head = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-rz-head]") : null;
      if (!redZoneDrag.current.up || !head || e.button > 0) return;
      const top0 = box.getBoundingClientRect().top;
      drag = { id: e.pointerId, y0: e.clientY, top0, lowest: redZoneDrag.current.line - head.offsetHeight - 8, moved: false, trail: [[e.timeStamp, e.clientY]] };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dy) < DRAG_START_PX) return;
      if (!drag.moved) {
        drag.moved = true;
        setRedZoneDragging(true);
      }
      drag.trail = [...drag.trail.filter(([t]) => e.timeStamp - t < FLING_WINDOW_MS), [e.timeStamp, e.clientY]];
      setRedZoneDragTop(Math.min(drag.lowest, Math.max(highest(), drag.top0 + dy)));
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const done = drag;
      drag = null;
      if (!done.moved) return;
      setRedZoneDragging(false);
      // Not a tap on whatever it started on.
      const swallow = (c: MouseEvent) => {
        c.stopPropagation();
        c.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      // Flung down: put away.
      const [t0, y0] = done.trail[0];
      const speed = (e.clientY - y0) / Math.max(1, e.timeStamp - t0);
      if (e.type === "pointerup" && speed > FLING_PX_PER_MS && e.clientY - done.y0 > FLING_MIN_PX) redZoneDrag.current.away();
    };
    box.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      box.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [redZoneBox, desktop]);
  // Stretched over the horizon (all the way, or dragged there): the starters list (on a phone) and the graphs (wider)
  // out of its way.
  const redZoneTall = redZoneFull || (redZoneDragTop !== null && stand !== null && redZoneDragTop < stand.horizon);
  // The play by the graph's cursor, shown in the Red Zone while the cursor's up.
  const [spotlight, setSpotlight] = useState<{ gameId: string; playId: string } | null>(null);
  const unpickGraph = (playerId: string) =>
    setGraphPicks({ week: shownWeek, picks: graphFor.filter((p) => p.playerId !== playerId) });
  // Escape takes every graph down and puts the map back.
  const anyGraph = graphFor.length > 0;
  useEffect(() => {
    if (!anyGraph) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setGraphPicksState({ week: null, picks: [] });
      saveHomeView({ graphs: undefined });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyGraph]);

  const filteredStarters = useMemo(
    () => (myStarters ?? []).filter((s) => effectiveSelected.has(s.leagueId)),
    [myStarters, effectiveSelected]
  );
  const filteredOpponentStarters = useMemo(
    () => (opponentStarters ?? []).filter((s) => effectiveSelected.has(s.leagueId)),
    [opponentStarters, effectiveSelected]
  );

  const grouped = useMemo(
    () => groupStartersByGame(filteredStarters, weekGames),
    [filteredStarters, weekGames]
  );
  // Same grouping, run again for the opponents' side — kept as its own pass
  // rather than merged into `grouped` so a player who happens to be both one
  // of your starters and one of an opponent's (in different leagues) still
  // shows up once on each side instead of being deduped into a single row
  // that loses which side they're on.
  const groupedOpponent = useMemo(
    () => groupStartersByGame(filteredOpponentStarters, weekGames),
    [filteredOpponentStarters, weekGames]
  );

  // Each game lists your own starters; opened up, everyone worth watching in
  // it — the starters you're facing and anyone else who's scored or is
  // projected well. Before kickoff, projections stand in for points.
  const gamesStarted = weekGames.some((g) => g.state !== "pre");
  const livePlayers = useLivePlayerLines(nflPhase.season ?? config.season, shownWeek, gamesStarted);
  // Projections in PPR, except your starters' and opponents', scored under
  // the (first) league they're started in, like their points are.
  const projected = useMemo(() => {
    const out = { ...livePlayers.projected };
    const scoringByLeague = new Map((leagues ?? []).map((l) => [l.tracked.leagueId, l.summary.league.scoring_settings]));
    const scored = new Set<string>();
    for (const s of [...(myStarters ?? []), ...(opponentStarters ?? [])]) {
      const stats = livePlayers.projectionStats[s.playerId];
      if (!stats || scored.has(s.playerId)) continue;
      scored.add(s.playerId);
      const pts = weighProjection(stats, scoringByLeague.get(s.leagueId));
      if (typeof pts === "number") out[s.playerId] = Math.round(pts * 100) / 100;
    }
    return out;
  }, [livePlayers, leagues, myStarters, opponentStarters]);
  const watchedGames = useMemo<GameStarters[]>(() => {
    const byGameId = new Map<string, GameStarters>();
    for (const { game, players } of [...grouped.games, ...groupedOpponent.games]) {
      const entry = byGameId.get(game.id);
      if (entry) entry.players = [...entry.players, ...players];
      else byGameId.set(game.id, { game, players });
    }
    return [...byGameId.values()];
  }, [grouped.games, groupedOpponent.games]);
  const listedRaw = useMemo(
    () => startersListGames(weekGames, grouped.games, groupedOpponent.games, livePlayers.lines, projected),
    [weekGames, grouped.games, groupedOpponent.games, livePlayers, projected]
  );
  // Everyone a game can list, whose Sleeper numbers the Red Zone points are reconciled against.
  const trackedRaw = useMemo(() => listedRaw.map((g) => ({ game: g.game, players: g.everyone ?? g.players })), [listedRaw]);
  // Points the Red Zone has seen that Sleeper hasn't counted yet go on top, until Sleeper catches up.
  const pendingPoints = useLivePlayPoints(watchedGames, trackedRaw);
  const listedGames = useMemo(
    () => startersListGames(weekGames, grouped.games, groupedOpponent.games, livePlayers.lines, projected, pendingPoints),
    [weekGames, grouped.games, groupedOpponent.games, livePlayers, projected, pendingPoints]
  );

  // Colour per league, keyed off the order leagues are tracked in so a
  // league keeps the same colour on the map, in the list, and in the legend —
  // the fallback for any league whose commish hasn't set a custom logo.
  const legend = useMemo<LeagueLegendEntry[]>(() => {
    const rawAvatarByLeagueId = new Map((leagues ?? []).map((l) => [l.tracked.leagueId, l.summary.league.avatar]));
    return starterSources.map((s, i) => ({
      leagueId: s.leagueId,
      leagueName: s.leagueName,
      colorIndex: i,
      leagueAvatar: avatarUrl(rawAvatarByLeagueId.get(s.leagueId)),
    }));
  }, [starterSources, leagues]);

  // The week's kickoffs, in order, for the countdown over the map.
  const kickoffs = useMemo(
    () => weekGames.map((g) => new Date(g.kickoff).getTime()).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b),
    [weekGames]
  );

  // The graphed players and their games, as they stand now — so a live graph moves with each tick.
  const scoringByLeague = useMemo(
    () => new Map((leagues ?? []).map((l) => [l.tracked.leagueId, l.summary.league.scoring_settings])),
    [leagues]
  );
  const graphed = useMemo(
    () =>
      graphFor.flatMap((pick) => {
        const listed = listedGames.find((g) => g.game.id === pick.gameId);
        const player = listed && [...(listed.everyone ?? []), ...listed.players].find((p) => p.playerId === pick.playerId);
        return listed && player ? [{ game: listed.game, player }] : [];
      }),
    [graphFor, listedGames]
  );

  // A kickoff window's games starting (this week's, as it's under way): its top scorers in your matchups put up as
  // graphs (see topFacing) — only if none are up already, and only once a window (closed, they stay down).
  useEffect(() => {
    if (shownWeek == null || shownWeek !== week) return;
    const live = [...new Set(weekGames.filter((g) => g.state === "in").map(kickoffBlockLabel))];
    if (live.length === 0) return;
    const seen = getHomeView().autoGraphs;
    const done = seen?.week === shownWeek ? seen.blocks : [];
    const fresh = live.filter((label) => !done.includes(label));
    if (fresh.length === 0) return;
    const markDone = () => saveHomeView({ autoGraphs: { week: shownWeek, blocks: [...done, ...fresh] } });
    // Graphs up already (or saved, about to be): left as they are.
    const saved = getHomeView().graphs;
    if (graphFor.length > 0 || (saved?.week === shownWeek && saved.picks.length > 0)) return markDone();
    // The latest of them to kick off.
    const kickoffOf = (label: string) => Math.max(...weekGames.filter((g) => kickoffBlockLabel(g) === label).map((g) => Date.parse(g.kickoff) || 0));
    const block = fresh.reduce((a, b) => (kickoffOf(b) > kickoffOf(a) ? b : a));
    const picks = topFacing(listedGames, new Set(weekGames.filter((g) => kickoffBlockLabel(g) === block).map((g) => g.id)), MAX_GRAPHS);
    // (Not till your lineups are in.)
    if (picks.length === 0) return;
    markDone();
    queueMicrotask(() => setGraphPicks({ week: shownWeek, picks }));
  }, [shownWeek, week, weekGames, listedGames, graphFor]);

  // The teams with no game this week, each with your starters on it — and any starter with no NFL team at all,
  // together last. The ones you face on a bye aren't listed (one who's yours in another league is).
  const byes = useMemo<ByeTeam[]>(() => {
    const playing = new Set(weekGames.flatMap((g) => [g.homeTeam, g.awayTeam]));
    const teams = NFL_TEAMS.filter((t) => !playing.has(t)).sort();
    const benched = withSides(grouped.notPlaying, groupedOpponent.notPlaying).filter((p) => p.side !== "opponent");
    const out: ByeTeam[] = teams.map((team) => {
      const players = benched.filter((p) => p.team === team);
      return { team, players, everyone: players };
    });
    const teamless = benched.filter((p) => !p.team || !teams.includes(p.team));
    if (teamless.length > 0) out.push({ team: null, players: teamless, everyone: teamless });
    return out;
  }, [weekGames, grouped.notPlaying, groupedOpponent.notPlaying]);

  // Each starters-list box's view (Team, VS, ALL — or shut), so each game's ring and stem on the map count who
  // its box shows; and those counts, kept as a string so the map only redraws when one changes.
  const [listViews, setListViews] = useState<Map<string, number> | null>(null);
  const shownCounts = listViews ? listedGames.map((g) => `${g.game.id}:${viewPlayers(g, listViews.get(g.game.id) ?? 0).length}`).join(",") : null;
  const mappedGames = useMemo<MappedGame[]>(() => {
    const counts = shownCounts === null ? null : new Map(shownCounts.split(",").filter(Boolean).map((e) => [e.slice(0, e.lastIndexOf(":")), Number(e.slice(e.lastIndexOf(":") + 1))]));
    const startersByGameId = new Map(grouped.games.map((g) => [g.game.id, g.players]));
    const opponentStartersByGameId = new Map(groupedOpponent.games.map((g) => [g.game.id, g.players]));
    const toMappedStarters = (players: GroupedStarter[]) =>
      players.map((p) => ({ playerId: p.playerId, name: p.name, leagueIds: p.leagueIds }));
    return weekGames.map((game) => ({
      game,
      starters: toMappedStarters(startersByGameId.get(game.id) ?? []),
      opponentStarters: toMappedStarters(opponentStartersByGameId.get(game.id) ?? []),
      count: counts ? (counts.get(game.id) ?? 0) : undefined,
    }));
  }, [weekGames, grouped.games, groupedOpponent.games, shownCounts]);

  // The games on the map: those whose kickoff block and game aren't hidden.
  const games = useMemo(
    () => mappedGames.filter((g) => !hiddenBlocks.has(kickoffBlockLabel(g.game)) && !offMap.has(g.game.id)),
    [mappedGames, hiddenBlocks, offMap]
  );
  // Of those, the ones projected on the map: just the games whose headers are in sight in the starters list, as it's
  // scrolled (all of them until it says) — the fields on the floor still every one.
  const [gamesInView, setGamesInView] = useState<Set<string> | null>(null);
  const projectedGames = useMemo(() => {
    if (!gamesInView) return games;
    const inView = games.filter((g) => gamesInView.has(g.game.id));
    return inView.length > 0 ? inView : games;
  }, [games, gamesInView]);
  // The games being played (of those), and those about to be (FIELD_LEAD_MS from kickoff on), each on a field of its own
  // on the floor (see FloorFields) — on a phone, laid in front of the Red Zone's switch, or above the Red Zone while
  // it's up. The time they're checked against moves on as the next one's due.
  const [fieldsClock, setFieldsClock] = useState(() => Date.now());
  useEffect(() => {
    const due = games
      .filter((g) => g.game.state === "pre")
      .map((g) => Date.parse(g.game.kickoff) - FIELD_LEAD_MS)
      .filter((t) => t > fieldsClock);
    if (due.length === 0) return;
    const id = window.setTimeout(() => setFieldsClock(Date.now()), Math.min(Math.max(0, Math.min(...due) - Date.now()) + 50, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [games, fieldsClock]);
  const fieldGames = useMemo(
    () =>
      games
        .filter((g) => g.game.state === "in" || (g.game.state === "pre" && Date.parse(g.game.kickoff) - FIELD_LEAD_MS <= fieldsClock))
        .map((g) => g.game),
    [games, fieldsClock]
  );
  // With a play picked to be acted out again whose game has no field on the floor: just that game's, while it's on.
  const replayGame = replay ? (weekGames.find((g) => g.id === replay.game.id) ?? replay.game) : null;
  const shownFieldGames = useMemo(
    () => (replayGame && !fieldGames.some((g) => g.id === replayGame.id) ? [replayGame] : fieldGames),
    [fieldGames, replayGame]
  );
  const fieldReplay = useMemo(
    () => (replay && replayGame ? { game: replayGame, play: replay.play, key: replay.key } : null),
    // (A pick's own key says when it's another.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replay?.key]
  );
  // On a phone, while the Red Zone's up, they're laid in front of where its top first comes up to, and stay there however
  // it's stretched or dragged after — still on the floor while it moves over them.
  const fieldsFloor = useMemo(() => {
    if (!stand) return null;
    if (desktop || !redZoneUp) return stand.fields;
    const top = stand.redZoneFoot - (RED_ZONE_REM + RED_ZONE_FLOAT_REM) * stand.rootPx;
    return { ...stand.fields, front: Math.min(stand.fields.front, top - 0.5 * stand.rootPx) };
  }, [stand, desktop, redZoneUp]);
  // Whether there are fields on the floor: then the floor's bare — no grid lines, no map.
  const fieldsUp = fieldsFloor !== null && shownFieldGames.length > 0;
  // The floor, slid toward you for the Red Zone; and the projected map moved and zoomed in its frame (see
  // FloorCameraControls), at home on the next games to kick off.
  const [floorCamera] = useState(createFloorCameraStore);
  const [mapCamera] = useState(createFloorCameraStore);
  // How far the floor's laid back: looked down on more, the more live games' fields are on it (see FloorFields).
  const [floorTilt] = useState(() => createFloorTiltStore());
  const [startersList, setStartersList] = useState<HTMLDivElement | null>(null);
  // Scrolled as an iPhone scrolls, by the page, so its reflection moves with it exactly (see useListScroll).
  useListScroll(startersList);

  if (!loaded || leagues === null) {
    return (
      <Card className="p-12 text-center text-sm text-ink-secondary">
        {error ?? "Loading your leagues…"}
      </Card>
    );
  }

  if (config.leagues.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <h1 className="text-xl font-semibold text-ink-primary">No leagues tracked yet</h1>
        <p className="max-w-md text-sm text-ink-secondary">
          Connect your Sleeper username to pull in every league you play in this season.
        </p>
        <Link
          href="/settings"
          className="mt-2 bg-series-1 px-4 py-2 text-sm font-medium text-white transition-transform hover:opacity-90 active:scale-95"
        >
          Go to Settings
        </Link>
      </Card>
    );
  }

  // Each league's matchup and standings, shared by the league boxes and the phone ticker.
  const leagueCards: TickerLeague[] = leagues.map(({ tracked }, i) => {
    const summary = shownSummaries?.[i] ?? leagues[i].summary;
    const myRow = summary.standings.find((r) => r.ownerId === config.sleeperUserId);
    const matchup = matchups[tracked.leagueId];
    const standings = teamStandings(summary);
    const standingOf = (rosterId: number) => standings.get(rosterId) ?? {};
    return {
      leagueId: tracked.leagueId,
      name: summary.league.name,
      logo: avatarUrl(summary.league.avatar, "full"),
      matchup,
      my: myRow ? standingOf(myRow.rosterId) : null,
      opponent: matchup?.opponent ? standingOf(matchup.opponent.rosterId) : undefined,
      leagueSize: summary.standings.length,
      // The winner once the week's official — or, with "as it stands" on, whoever's ahead now.
      winner:
        matchup?.opponent && matchup.my.points !== matchup.opponent.points && (asItStands || (shownWeek != null && shownWeek <= lastFinishedWeek(leagues[i].summary.league)))
          ? matchup.my.points > matchup.opponent.points
            ? "my"
            : "opponent"
          : null,
    };
  });

  // The room the dashboard stands in: a grid floor running back to the horizon (see .grid-room).
  const horizon = HORIZON_SHARE;
  // The map's projected over the middle of the floor (see FloorProjection), its games standing up off it in front of
  // everything (FloorProjectionTags) — out of the way while the Red Zone takes the screen (⇕).
  const mapShown = stand !== null && weekGames.length > 0;
  // The map's out whenever no game's being played: before the week's first kickoff, between one window's games and
  // the next's, and once they're all over — never with fields on the floor (a game about to kick off lays its own).
  // (From tablet width up, put away too while player graphs stand at the back of the room, where its frame floats.)
  const mapOut =
    mapShown &&
    !fieldsUp &&
    !weekGames.some((g) => g.state === "in") &&
    !(desktop && graphed.length > 0 && !redZoneTall);
  const roomView = (
    <div
      ref={setRoom}
      aria-hidden
      className="grid-room"
      style={{ ["--horizon" as string]: `${horizon * 100}%` }}
    >
      <FloorGrid share={horizon} camera={floorCamera} tilt={floorTilt} hidden={fieldsUp} />
      {mapOut ? (
        // From tablet width up, the countdown to the next kickoff lit over it.
        <FloorProjection place={stand.projector} games={projectedGames} map={mapCamera} floor={floorCamera} countdown={desktop ? kickoffs : undefined} />
      ) : null}
    </div>
  );
  // One graph in full; two side by side; three or four, one to a corner.
  const graphsView =
    graphed.length > 0 ? (
      <PointsGraphGrid
        graphs={graphed.map(({ game, player }) => ({
          game,
          player,
          // Under the league their row's points are scored in (the first they're started in); anyone else's is PPR, as their row is.
          scoring: player.side === "other" ? undefined : scoringByLeague.get(player.leagueIds[0]),
          leagues: legend.filter((l) => player.leagueIds.includes(l.leagueId)),
        }))}
        onClose={unpickGraph}
        onCursorPlay={setSpotlight}
      />
    ) : null;
  // The Red Zone, your starters' plays as they happen.
  const redZoneView =
    weekGames.length > 0 && myStarters !== null ? (
      <RedZone
        // Fresh for each week, so a week's plays slide in rather than flashing as new.
        key={shownWeek ?? 0}
        starters={grouped.games}
        opponents={groupedOpponent.games}
        weekGames={weekGames}
        legend={legend}
        weekStats={livePlayers.stats}
        fill
        spotlight={graphed.length > 0 ? spotlight : null}
        hiddenGames={offMap}
        // Stretched (⇕) on a phone; from tablet width up it's a column of its own, as tall as the starters list.
        full={desktop ? undefined : { on: redZoneFull, toggle: stretchRedZone }}
        // Its title's its switch, once it's up (its switch goes up into it, see FloorCameraControls) — on a phone; from
        // tablet width up it's always up.
        onSwitchOff={desktop ? undefined : () => switchRedZone(false)}
        scoringByLeague={scoringByLeague}
        onPlayPick={pickPlay}
      />
    ) : null;
  // The Red Zone, up out of the floor in front of you (its switch beside the map's way home, see FloorCameraControls):
  // once the floor's slid toward you and the map's gone off the screen's bottom, it rises out of the floor at its
  // switch's top (on a phone, down on the tab bar's top) and floats a little over it, two plays tall, as wide as the
  // screen (on a tablet or wider, a column at
  // the left as wide as the starters list at the right, from under the ticker down to the same line on the floor as
  // it) — and sinks back into it. With no backing of its own, the room behind it showing right
  // through; reflected in the floor under it, the gap it floats by and all, its
  // plays' scroll with it (see FloorReflection). Stretched (⇕), from under the ticker down to the bottom (a phone's
  // tab bar).
  const redZoneHeight = RED_ZONE_REM + RED_ZONE_FLOAT_REM;
  // On a phone, where the Red Zone's top stands over the floor while it's up, a step at a time.
  const redZoneTop = (level: 0 | 1) =>
    !stand ? 0 : level === 0 ? stand.redZoneFoot - redZoneHeight * stand.rootPx : stand.horizon + 0.375 * stand.rootPx;
  const redZoneStage =
    redZoneView && stand ? (
      <>
        <div
          ref={setRedZoneBox}
          data-floor-ui
          inert={!redZoneUp}
          // Cut off at the line it comes up out of; its top moving up a step at a time as it's stretched — up to the
          // ticker only once the starters list (on a phone) has sunk out of its way.
          className={`fixed z-[5] overflow-hidden ${redZoneDragging ? "" : "transition-[top] duration-500 ease-out"} ${
            // From tablet width up, a column at the screen's left, as wide as the starters list at its right.
            desktop ? "left-4 w-64 lg:w-72" : "inset-x-0"
          } ${redZoneFull && !desktop && !redZoneDragging ? "delay-500" : ""}`}
          style={{
            // Its left edge as far in as the starters list's right edge is from the screen's.
            ...(desktop && startersList ? { left: stand.projector.width - startersList.getBoundingClientRect().right } : null),
            bottom: stand.room - stand.redZoneFoot,
            top: desktop
              ? // Up from under the ticker, as the starters list is; down, sunk to the line it stands on.
                redZoneUp
                ? `calc(${UNDER_TICKER})`
                : `${stand.redZoneLine}px`
              : redZoneDragTop !== null
                ? `${redZoneDragTop}px`
                : redZoneLevel === 2
                  ? "calc(var(--header-h, 0px) + var(--ticker-h, 0px) + 0.625rem)"
                  : `${redZoneTop(redZoneLevel)}px`,
          }}
        >
          {/* Brought in a step at a time from its switch, and put away the same way (see FloorCameraControls). */}
          <div className={`absolute inset-x-0 bottom-0.5 top-0 flex flex-col ${redZoneUp || redZoneSinking ? "" : "invisible"}`}>
            {redZoneView}
          </div>
        </div>
        {/* Its reflection coming down out of the floor as its plays come in, and going back up as they go. */}
        {redZoneUp || redZoneSinking ? (
          <FloorReflection
            source={redZoneBox}
            rise={{ delayMs: RED_ZONE_PLAYS_AT_MS, ms: RED_ZONE_PLAYS_MS }}
            sinkMs={redZoneUp ? undefined : RED_ZONE_PLAYS_MS}
          />
        ) : null}
      </>
    ) : null;
  const startersView =
    myStarters === null ? (
      <p className="text-sm text-ink-secondary">Loading your lineups…</p>
    ) : weekGames.length === 0 ? (
      // Without the schedule every starter would fall into "not playing",
      // which would read as a league-wide bye rather than a failed fetch.
      <p className="text-sm text-ink-secondary">
        Couldn&rsquo;t load this week&rsquo;s NFL schedule, so there&rsquo;s nothing to group
        your starters under yet.
      </p>
    ) : (
      <StartersByGame
        // Fresh for each week, so switching weeks doesn't count every total up from the last week's.
        key={shownWeek ?? 0}
        games={listedGames}
        byes={byes}
        legend={legend}
        allLeaguesHidden={config.leagues.length > 0 && config.leagues.every((l) => l.hidden)}
        hiddenBlocks={hiddenBlocks}
        onToggleBlock={toggleBlock}
        offMap={offMap}
        onToggleMap={toggleMap}
        selectedPlayers={graphFor}
        onSelectPlayer={pickGraph}
        onViewsChange={setListViews}
        onGamesInView={setGamesInView}
      />
    );
  // The room's height; how far up from its bottom the floor's lowest grid line is, and the Red Zone's foot.
  const standVars = stand
    ? { ["--room-h" as string]: `${stand.room}px`, ["--stand" as string]: `${stand.on}px`, ["--rz-foot" as string]: `${stand.room - stand.redZoneLine}px` }
    : undefined;
  // Moving the floor from wherever it's bare (the page's own wrappers, data-floor, touched nowhere else).
  const floorControls = mapShown ? (
    <FloorCameraControls
      store={floorCamera}
      map={mapCamera}
      place={stand.projector}
      desktop={desktop}
      // (From tablet width up the Red Zone's always up, a column of its own beside the map: no switch, nothing slid.)
      redZone={redZoneView && !desktop ? { on: redZoneUp, onChange: switchRedZone } : undefined}
      out={mapOut}
    />
  ) : null;

  if (!desktop) {
    // A phone: one scene that doesn't scroll, standing in the room, the ticker along its top — and under it, scrolling
    // as one list at the back of the room, above the horizon (nothing of it in front of the floor), any player graphs
    // and the starters list. Scrolled to its top, the graphs fill the room from under the ticker to the horizon, their
    // foot on it, the starters list behind it; with none up, the starters list from under the ticker. Scrolled, it goes
    // up under the see-through ticker and header and comes up from behind the horizon, reflected in the floor there —
    // scrolled as an iPhone scrolls, by the page (see useListScroll), so its reflection moves with it exactly.
    // The Red Zone comes up out of the floor in front of it (see redZoneStage) — stretched (⇕) up to the ticker, the
    // list sinks into the floor first, out of its way, and comes back up once it's down again.
    const graphsUp = graphsView !== null;
    const underTicker = "var(--header-h, 0px) + var(--ticker-h, 0px) + 0.25rem";
    return (
      <div data-floor style={standVars}>
        <h1 className="sr-only">Dashboard</h1>
        {roomView}
        <div data-floor className="fixed inset-0 touch-none">
          <div className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: stand ? stand.horizon : "50%" }}>
            <div
              ref={setStartersList}
              data-scroll-list
              className={`h-full touch-none overflow-y-auto overscroll-none px-4 pb-8 transition-transform duration-500 ease-in-out [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                redZoneTall ? "translate-y-full" : "delay-500"
              }`}
              style={{ paddingTop: `calc(${underTicker})` }}
            >
              <div>
                {graphsUp && stand ? (
                  <div className="flex flex-col pt-1" style={{ height: `calc(${stand.horizon}px - (${underTicker}))` }}>
                    {graphsView}
                  </div>
                ) : null}
                <div className="pt-2">{startersView}</div>
              </div>
            </div>
            <ScrollThumb source={startersList} />
          </div>
          <div className="absolute inset-x-0 top-[var(--header-h,0px)] px-4 pt-6">
            <LeagueTicker leagues={leagueCards} />
          </div>
        </div>
        {/* Reflected in the floor from the horizon, as it scrolls. */}
        {/* Going down into the floor with it, as the Red Zone's stretched up to the ticker, and coming back up with it. */}
        <FloorReflection
          source={startersList}
          className="px-4 pb-8"
          style={{ paddingTop: `calc(${underTicker})` }}
          rise={{ delayMs: 500, ms: 500 }}
          sinkMs={redZoneTall ? 500 : undefined}
          ease="ease-in-out"
          risesAtFirst={false}
        />
        {redZoneStage}
        {mapOut ? <FloorProjectionTags place={stand.projector} games={projectedGames} map={mapCamera} floor={floorCamera} /> : null}
        {/* The games being played, the one in view across the floor's front, the rest behind it. */}
        {stand && fieldsFloor ? (
          <FloorFields
            games={shownFieldGames}
            width={stand.projector.width}
            height={stand.room}
            share={stand.projector.share}
            floor={fieldsFloor}
            focused
            replay={fieldReplay}
            onReplayed={replayed}
          />
        ) : null}
        {floorControls}
      </div>
    );
  }

  // From tablet width up, player graphs go up at the back of the room, left of the starters list: from under the
  // ticker down to the horizon, their foot on it — out of the way of the Red Zone stretched (⇕) over them.
  const graphsBack = graphsView !== null && !redZoneTall;
  return (
    // From tablet width up the columns reach the bottom of the screen: the page's own bottom padding is taken back.
    // Nothing scrolls but the starters list (and the Red Zone's plays, within it).
    <div data-floor className="flex touch-none flex-col gap-0.5 md:-mb-8" style={standVars}>
      <h1 className="sr-only">Dashboard</h1>
      {roomView}
      <LeagueTicker leagues={leagueCards} />

      {/* Columns standing in the room with no backgrounds of their own — the room behind them: the player graphs at
          its back, angled in toward the middle (turned on their outer edge, so however wide they are that edge stays on
          the screen), and the starters list, its foot level with the Red Zone's (--rz-foot). The Red Zone stands at the
          left as a column of its own, as wide as the starters list (see redZoneStage). */}
      {/* The graphs from the screen's left edge (the Red Zone's column, while it's up) right up to the starters list —
          in front of the live games' fields on the floor, as the Red Zone is: they run on behind the columns, seen
          through them, their writing over them. Nothing between the columns stops a tap or a drag from reaching what's
          behind (the map, the floor). */}
      <div
        data-floor
        className={`pointer-events-none relative z-[5] flex flex-row items-start pr-4 pt-2 transition-[padding] duration-500 [perspective:2200px] ${redZoneUp ? "pl-[18rem] lg:pl-[20rem]" : ""}`}
      >
        <div
          data-floor
          className="pointer-events-auto sticky top-[calc(var(--header-h,0px)+var(--ticker-h,0px)+0.625rem)] flex min-w-0 flex-1 origin-left flex-col [rotate:y_4deg]"
          style={{ height: graphsBack ? `calc(${COLUMN_TO_HORIZON})` : 0 }}
        >
          {/* Faintly reflected in the floor (past the column's foot, so it isn't clipped to it). */}
          {graphsBack ? <div className="floor-reflect flex min-h-0 flex-1 animate-[rise_0.5s_ease-out_backwards] flex-col">{graphsView}</div> : null}
        </div>

        {/* Starters by game, with its own scroll, so a long list here doesn't push the left column around or vice versa.
            As wide as its rows need (in rem, so it shrinks with the text when the browser zooms out), the map's column
            taking the rest. It stands upright on the floor, its foot level with the Red Zone's (--rz-foot), facing you square on, as
            something standing on a line across the floor does — from where it sits under the ticker (past the gap and
            the row's padding, 0.625rem), so its foot is on the line whether or not it's stuck. Like a phone's, it runs
            right down to the floor, reflected in it — just what meets the floor, mirrored, as it scrolls — and up behind
            the see-through ticker and header, scrolled up under them. */}
        {/* Its foot level with the Red Zone's, so the two are reflected in the floor from the same line. */}
        <div className="pointer-events-auto sticky top-[calc(var(--header-h,0px)+var(--ticker-h,0px)+0.625rem)] h-[calc(var(--room-h,100vh)-var(--header-h,0px)-var(--ticker-h,0px)-0.625rem-var(--rz-foot,0px))] w-64 shrink-0 lg:w-72">
          {/* Its scrollbar hidden (its reflection's copy has none, so they'd not line up), a thin thumb up as it scrolls;
              scrolled by the page, so its reflection moves with it exactly (see useListScroll). */}
          <div
            ref={setStartersList}
            data-scroll-list
            className="absolute inset-x-0 bottom-0 touch-none overflow-y-auto overscroll-none pb-16 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ top: `calc(-1 * (${UNDER_TICKER}))`, paddingTop: `calc(${UNDER_TICKER})` }}
          >
            <div>{startersView}</div>
          </div>
          <ScrollThumb source={startersList} />
        </div>
      </div>
      {mapOut ? (
        <FloorProjectionTags place={stand.projector} games={projectedGames} map={mapCamera} floor={floorCamera} />
      ) : null}
      {/* Its reflection: what's at its foot, in the floor. */}
      <FloorReflection source={startersList} className="pb-16" style={{ paddingTop: `calc(${UNDER_TICKER})` }} />
      {/* The games being played, a field each, on the floor between the Red Zone and the starters list. */}
      {stand && fieldsFloor ? (
        <FloorFields
          games={shownFieldGames}
          width={stand.projector.width}
          height={stand.room}
          share={stand.projector.share}
          floor={fieldsFloor}
          tilt={floorTilt}
          replay={fieldReplay}
          onReplayed={replayed}
        />
      ) : null}
      {redZoneStage}
      {floorControls}
    </div>
  );
}
