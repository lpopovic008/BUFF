"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { MappedGame } from "@/components/GameMap";
import { FloorMapLand, FloorMapTags } from "@/components/FloorMap";
import { FloorMapFit, fitFloorMap, floorMapTop } from "@/lib/floor-map";
import { HORIZON_SHARE, gridRows, lowestGridLine } from "@/lib/grid-room";
import { FloorGrid } from "@/components/FloorGrid";
import { FloorCameraControls, RED_ZONE_SINK_MS } from "@/components/FloorCameraControls";
import { FloorReflection } from "@/components/FloorReflection";
import { FloorPlay } from "@/components/FloorPlay";
import { ScrollThumb } from "@/components/ScrollThumb";
import { useDragScroll } from "@/hooks/useDragScroll";
import { createFloorCameraStore } from "@/lib/floor-camera";
import { LeagueTicker, TickerLeague } from "@/components/LeagueTicker";
import { ByeTeam, LeagueLegendEntry, StartersByGame, viewPlayers } from "@/components/StartersByGame";
import { NFL_TEAMS } from "@/lib/nfl-logos";
import { PointsGraphGrid } from "@/components/PointsGraph";
import { KickoffCountdown } from "@/components/KickoffCountdown";
import { RedZone } from "@/components/RedZone";
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
// The Red Zone rising out of the floor once the floor's slid away from under it (see FloorCameraControls), ms; up,
// how far it floats over the floor (a couple of px), and how tall it is at first: a play of three players, under its
// header (on a tablet or wider, on fewer lines).
const RED_ZONE_RISE_DELAY_MS = 650;
/** How long it takes to come up (its rise in redZoneStage: duration-500). */
const RED_ZONE_RISE_MS = 500;
const RED_ZONE_FLOAT_REM = 0.125;
const RED_ZONE_REM = 10.5;
const DESKTOP_RED_ZONE_REM = 8.125;
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
  const stretchRedZone = () => setRedZoneLevel((level) => ((level + 1) % 3) as 0 | 1 | 2);
  const redZoneFull = redZoneLevel === 2;
  // On its way back down into the floor (its reflection along with it, see redZoneStage).
  const [redZoneSinking, setRedZoneSinking] = useState(false);
  const switchRedZone = (on: boolean) => {
    setRedZoneUp(on);
    setRedZoneSinking(!on);
    setRedZoneLevel(on && desktop ? 1 : 0);
  };
  useEffect(() => {
    if (!redZoneSinking) return;
    const done = setTimeout(() => setRedZoneSinking(false), RED_ZONE_SINK_MS);
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
  // Zone comes up; the horizon; the map on the floor (see floor-map.ts) and the top of its land; and the root font
  // size — screen y's, from the top.
  const [stand, setStand] = useState<{
    room: number;
    on: number;
    horizon: number;
    fit: FloorMapFit;
    landTop: number;
    /** The line on the floor the Red Zone comes up out of (see redZoneStage). */
    redZoneLine: number;
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
      // The map lies on the floor at the front, centred across the screen, its near edge on the screen's bottom (a
      // phone's tab bar), reaching back as far as the third grid line from the front, as wide as that makes it within
      // the screen.
      const desk = window.matchMedia(DESKTOP).matches;
      const rows = gridRows(height);
      const fit = fitFloorMap({
        width,
        height,
        centerX: width / 2,
        bottom: desk ? height : height - tabBar,
        farthest: rows.at(-3) ?? height * HORIZON_SHARE,
        maxWidth: width - 2 * rootPx,
      });
      const landTop = floorMapTop(fit);
      setStand({
        room: height,
        // Its switch's top: 0.75rem off the bottom (or a phone's tab bar), and 1.75rem tall.
        redZoneLine: height - (desk ? 0 : tabBar) - 2.5 * rootPx,
        on: height - lowestGridLine(height),
        horizon: height * HORIZON_SHARE,
        fit,
        landTop,
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
  // A play's field on the floor, its grid gone from under it (see FloorPlay) — till it's tapped away.
  const [fieldOn, setFieldOn] = useState(false);
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
  // The floor moved around and zoomed (see FloorCameraControls), following the starters list while it's home.
  const [floorCamera] = useState(createFloorCameraStore);
  const [startersList, setStartersList] = useState<HTMLDivElement | null>(null);
  // The page scrolls the starters list itself, so its reflection keeps up with it — pulled past its ends and springing
  // back included (see useDragScroll).
  useDragScroll(startersList);

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
  // The map lies on the floor at the front (see FloorMapLand), its games standing up off it in front of everything
  // (FloorMapTags) — out of the way while the Red Zone takes the screen (⇕).
  const mapShown = stand !== null && weekGames.length > 0;
  const roomView = (
    <div
      ref={setRoom}
      aria-hidden
      className="grid-room"
      style={{ ["--horizon" as string]: `${horizon * 100}%` }}
    >
      {/* Gone while a play's field lines the floor instead (see FloorPlay). */}
      <FloorGrid share={horizon} camera={floorCamera} hidden={fieldOn} />
      {mapShown ? <FloorMapLand fit={stand.fit} games={games} camera={floorCamera} /> : null}
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
        full={{ on: redZoneFull, toggle: stretchRedZone }}
        scoringByLeague={scoringByLeague}
      />
    ) : null;
  // The Red Zone, up out of the floor in front of you (its switch beside the map's way home, see FloorCameraControls):
  // once the floor's slid toward you and the map's gone off the screen's bottom, it rises out of the floor at its
  // switch's top and floats a little over it, two plays tall, as wide as the screen (on a tablet or wider, the room
  // left of the starters list) — and sinks back into it. With no backing of its own, the room behind it showing right
  // through; reflected in the floor under it, the gap it floats by and all, its
  // plays' scroll with it (see FloorReflection). Stretched (⇕), from under the ticker down to the bottom (a phone's
  // tab bar).
  const redZoneHeight = (desktop ? DESKTOP_RED_ZONE_REM : RED_ZONE_REM) + RED_ZONE_FLOAT_REM;
  // Where the Red Zone's top stands over the floor while it's up, a step at a time (from tablet width up, its middle
  // step two of the floor's squares back from its front line).
  const redZoneTop = (level: 0 | 1) =>
    !stand
      ? 0
      : level === 0
        ? stand.redZoneLine - redZoneHeight * stand.rootPx
        : desktop
          ? (gridRows(stand.room).at(-3) ?? stand.horizon + 0.5 * (stand.redZoneLine - stand.horizon))
          : stand.horizon + 0.375 * stand.rootPx;
  const redZoneStage =
    redZoneView && stand ? (
      <>
        <div
          ref={setRedZoneBox}
          data-floor-ui
          inert={!redZoneUp}
          // Cut off at the line it comes up out of; its top moving up a step at a time as it's stretched — up to the
          // ticker only once the starters list (on a phone) has sunk out of its way.
          className={`fixed z-[5] overflow-hidden transition-[top] duration-500 ease-out ${
            desktop ? "left-4 md:right-[19rem] lg:right-[21rem]" : "inset-x-0"
          } ${redZoneFull && !desktop ? "delay-500" : ""}`}
          style={{
            bottom: stand.room - stand.redZoneLine,
            top:
              redZoneLevel === 2
                ? "calc(var(--header-h, 0px) + var(--ticker-h, 0px) + 0.625rem)"
                : `${redZoneTop(redZoneLevel)}px`,
          }}
        >
          <div
            className={`absolute inset-x-0 bottom-0.5 top-0 flex flex-col transition-transform ease-out ${
              redZoneUp ? "translate-y-0 delay-[650ms] duration-500" : "translate-y-[calc(100%+0.125rem)] duration-[400ms]"
            }`}
          >
            {redZoneView}
          </div>
        </div>
        {/* Its reflection coming down out of the floor as it comes up, and going back up as it goes down. */}
        {redZoneUp || redZoneSinking ? (
          <FloorReflection
            source={redZoneBox}
            rise={{ delayMs: RED_ZONE_RISE_DELAY_MS, ms: RED_ZONE_RISE_MS }}
            sinkMs={redZoneUp ? undefined : RED_ZONE_SINK_MS}
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
      />
    );
  const standVars = stand ? { ["--room-h" as string]: `${stand.room}px`, ["--stand" as string]: `${stand.on}px` } : undefined;
  // Moving the floor from wherever it's bare (the page's own wrappers, data-floor, touched nowhere else).
  const floorControls = mapShown ? (
    <FloorCameraControls
      store={floorCamera}
      fit={stand.fit}
      games={games}
      list={startersList}
      desktop={desktop}
      redZone={redZoneView ? { on: redZoneUp, onChange: switchRedZone } : undefined}
    />
  ) : null;

  if (!desktop) {
    // A phone: one scene that doesn't scroll, standing in the room, the ticker along its top — and under it, scrolling
    // as one list at the back of the room, above the horizon (nothing of it in front of the floor), any player graphs
    // and the starters list. Scrolled to its top, the graphs fill the room from under the ticker to the horizon, their
    // foot on it, the starters list behind it; with none up, the starters list from under the ticker. Scrolled, it goes
    // up under the see-through ticker and header and comes up from behind the horizon, reflected in the floor there —
    // scrolled by the page itself (see useDragScroll), so its reflection moves with it, pulled past its ends and all.
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
              data-drag-scroll
              className={`h-full touch-none overflow-y-auto overscroll-none px-4 pb-8 transition-transform duration-500 ease-in-out [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                redZoneFull ? "translate-y-full" : "delay-500"
              }`}
              style={{ paddingTop: `calc(${underTicker})` }}
            >
              {/* Moved down (or up) as far as it's pulled past an end. */}
              <div className="translate-y-[var(--overscroll,0px)]">
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
          sinkMs={redZoneFull ? 500 : undefined}
          ease="ease-in-out"
          risesAtFirst={false}
        />
        {redZoneStage}
        {mapShown ? <FloorMapTags fit={stand.fit} games={games} top={stand.landTop} camera={floorCamera} /> : null}
        {/* Red Zone plays acted out on the floor, across the whole screen. */}
        {stand ? (
          <FloorPlay width={stand.fit.width} height={stand.room} share={stand.fit.share} camera={floorCamera} steer={redZoneUp} onShown={setFieldOn} />
        ) : null}
        {floorControls}
      </div>
    );
  }

  // From tablet width up, player graphs go up at the back of the room, left of the starters list: from under the
  // ticker down to the horizon, their foot on it — out of the way of the Red Zone stretched (⇕) over them.
  const graphsBack = graphsView !== null && !redZoneFull;
  return (
    // From tablet width up the columns reach the bottom of the screen: the page's own bottom padding is taken back.
    // Nothing scrolls but the starters list (and the Red Zone's plays, within it).
    <div data-floor className="flex touch-none flex-col gap-0.5 md:-mb-8" style={standVars}>
      <h1 className="sr-only">Dashboard</h1>
      {roomView}
      <LeagueTicker leagues={leagueCards} />

      {/* Two columns standing in the room with no backgrounds of their own — the room behind them: the player graphs at
          its back, angled in toward the middle (turned on their outer edge, so however wide they are that edge stays on
          the screen), and the starters list on the floor's lowest grid line (--stand). The Red Zone stands on the floor
          between them and the map (see redZoneStage). */}
      <div data-floor className="flex flex-row items-start gap-8 px-4 pt-2 [perspective:2200px]">
        <div
          data-floor
          className="sticky top-[calc(var(--header-h,0px)+var(--ticker-h,0px)+0.625rem)] flex min-w-0 flex-1 origin-left flex-col [rotate:y_4deg]"
          style={{ height: graphsBack ? `calc(${COLUMN_TO_HORIZON})` : 0 }}
        >
          {/* Faintly reflected in the floor (past the column's foot, so it isn't clipped to it). */}
          {graphsBack ? <div className="floor-reflect flex min-h-0 flex-1 animate-[rise_0.5s_ease-out_backwards] flex-col">{graphsView}</div> : null}
        </div>

        {/* Starters by game, with its own scroll, so a long list here doesn't push the left column around or vice versa.
            As wide as its rows need (in rem, so it shrinks with the text when the browser zooms out), the map's column
            taking the rest. It stands upright on the floor's lowest grid line (--stand), facing you square on, as
            something standing on a line across the floor does — from where it sits under the ticker (past the gap and
            the row's padding, 0.625rem), so its foot is on the line whether or not it's stuck. Like a phone's, it runs
            right down to the floor, reflected in it — just what meets the floor, mirrored, as it scrolls — and up behind
            the see-through ticker and header, scrolled up under them. */}
        <div className="sticky top-[calc(var(--header-h,0px)+var(--ticker-h,0px)+0.625rem)] h-[calc(var(--room-h,100vh)-var(--header-h,0px)-var(--ticker-h,0px)-0.625rem-var(--stand,0px))] w-64 shrink-0 lg:w-72">
          {/* Its scrollbar hidden (its reflection's copy has none, so they'd not line up), a thin thumb up as it scrolls;
              scrolled by the page, so its reflection moves with it (see useDragScroll). */}
          <div
            ref={setStartersList}
            data-drag-scroll
            className="absolute inset-x-0 bottom-0 touch-none overflow-y-auto overscroll-none pb-16 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ top: `calc(-1 * (${UNDER_TICKER}))`, paddingTop: `calc(${UNDER_TICKER})` }}
          >
            {/* Moved down (or up) as far as it's pulled past an end. */}
            <div className="translate-y-[var(--overscroll,0px)]">{startersView}</div>
          </div>
          <ScrollThumb source={startersList} />
        </div>
      </div>
      {mapShown ? (
        <FloorMapTags
          fit={stand.fit}
          games={games}
          // The countdown over the map's middle, above the horizon — out of the way of graphs.
          top={stand.horizon - 0.75 * stand.rootPx}
          overhead={graphsBack || redZoneUp ? undefined : <KickoffCountdown kickoffs={kickoffs} />}
          camera={floorCamera}
        />
      ) : null}
      {/* Its reflection: what's at its foot, in the floor. */}
      <FloorReflection source={startersList} className="pb-16" style={{ paddingTop: `calc(${UNDER_TICKER})` }} />
      {/* Red Zone plays acted out right across the floor, the floor's grid their field, in the middle of the screen —
          whatever stands on it (see FloorPlay). */}
      {stand ? (
        <FloorPlay
          width={stand.fit.width}
          height={stand.room}
          share={stand.fit.share}
          camera={floorCamera}
          steer={redZoneUp}
          onShown={setFieldOn}
        />
      ) : null}
      {redZoneStage}
      {floorControls}
    </div>
  );
}
