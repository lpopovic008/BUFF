"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { MappedGame } from "@/components/GameMap";
import { FloorMapLand, FloorMapTags } from "@/components/FloorMap";
import { FloorMapFit, fitFloorMap, floorMapTop } from "@/lib/floor-map";
import { HORIZON_SHARE, gridRows, lowestGridLine } from "@/lib/grid-room";
import { FloorGrid } from "@/components/FloorGrid";
import { FloorCameraControls } from "@/components/FloorCameraControls";
import { FloorReflection } from "@/components/FloorReflection";
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
// From tablet width up, the player graphs at the back of the room: from under the ticker down to the horizon.
const COLUMN_TO_HORIZON = `(var(--room-h, 100vh) * ${HORIZON_SHARE} - var(--header-h, 0px) - var(--ticker-h, 0px) - 0.625rem)`;
// The Red Zone standing on the floor is further back than what's at the front: drawn this much smaller — on a tablet
// or wider, where it's a shorter strip of floor to the horizon, smaller still, so a play fits.
const RED_ZONE_SCALE = 0.85;
const DESKTOP_RED_ZONE_SCALE = 0.7;
const onDesktopChange = (listener: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

export default function DashboardPage() {
  const { config, loaded } = useConfig();
  const desktop = useSyncExternalStore(onDesktopChange, () => window.matchMedia(DESKTOP).matches, () => false);
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
  // The Red Zone stretched (⇕) from its place on the floor up over the screen, the map out of its way.
  const [redZoneFull, setRedZoneFull] = useState(false);
  const toggleRedZoneFull = () => setRedZoneFull((on) => !on);
  // The Red Zone with no plays is just its header — between weeks, none at all.
  const [redZoneEmpty, setRedZoneEmpty] = useState(false);
  // The Red Zone's place on the floor, reflected in it (see FloorReflection).
  const [redZoneBox, setRedZoneBox] = useState<HTMLDivElement | null>(null);
  // The room's height as it's drawn (not 100vh, which a browser's toolbars can make taller than the screen); how far up
  // from its bottom the floor's lowest grid line is — where the starters list stands from tablet width up; the
  // horizon; the map on the floor (see floor-map.ts) and the top of its land; the grid line the Red Zone stands on; and
  // the root font size — screen y's, from the top.
  const [stand, setStand] = useState<{
    room: number;
    on: number;
    horizon: number;
    fit: FloorMapFit;
    landTop: number;
    redZoneOn: number;
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
      // The Red Zone stands on the grid line a full square back from the map's land: the furthest forward whose square
      // in front of it is clear of the land.
      let redZoneOn = rows[1] ?? height * HORIZON_SHARE;
      for (let i = 1; i < rows.length - 1; i++) if (rows[i + 1] <= landTop + 0.5) redZoneOn = rows[i];
      setStand({
        room: height,
        on: height - lowestGridLine(height),
        horizon: height * HORIZON_SHARE,
        fit,
        landTop,
        redZoneOn,
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

  // The teams with no game this week, each with your starters on it (and the
  // ones you face) — and any starter with no NFL team at all, together last.
  const byes = useMemo<ByeTeam[]>(() => {
    const playing = new Set(weekGames.flatMap((g) => [g.homeTeam, g.awayTeam]));
    const teams = NFL_TEAMS.filter((t) => !playing.has(t)).sort();
    const benched = withSides(grouped.notPlaying, groupedOpponent.notPlaying);
    const out: ByeTeam[] = teams.map((team) => {
      const everyone = benched.filter((p) => p.team === team);
      return { team, players: everyone.filter((p) => p.side !== "opponent"), everyone };
    });
    const teamless = benched.filter((p) => !p.team || !teams.includes(p.team));
    if (teamless.length > 0) out.push({ team: null, players: teamless.filter((p) => p.side !== "opponent"), everyone: teamless });
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
  const mapShown = stand !== null && weekGames.length > 0 && !redZoneFull;
  const roomView = (
    <div
      ref={setRoom}
      aria-hidden
      className="grid-room"
      style={{ ["--horizon" as string]: `${horizon * 100}%` }}
    >
      <FloorGrid share={horizon} camera={floorCamera} />
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
        full={{ on: redZoneFull, toggle: toggleRedZoneFull }}
        onEmptyChange={setRedZoneEmpty}
        scoringByLeague={scoringByLeague}
      />
    ) : null;
  // Gone altogether between weeks — no plays, and no game started to have any.
  const redZoneOff = redZoneEmpty && weekGames.every((g) => g.state === "pre");
  // The Red Zone popping up out of the floor on the grid line a full square back from the map — not moved with it —
  // its top short of the horizon, a little narrower than the screen (on a tablet or wider, than the room left of the
  // starters list) and drawn a little smaller, as further back; backed, so what's behind it on the floor is hidden,
  // and reflected in the floor. Stretched (⇕), from under the ticker down to the bottom (a phone's tab bar).
  const redZoneSide = desktop ? "left-8 md:right-[23rem] lg:right-[25rem]" : "inset-x-6";
  const redZoneScale = desktop ? DESKTOP_RED_ZONE_SCALE : RED_ZONE_SCALE;
  const redZoneStage =
    redZoneView && stand && !redZoneOff ? (
      <>
        <div
          ref={setRedZoneBox}
          className={`fixed z-[5] ${redZoneFull ? (desktop ? "left-4 md:right-[23rem] lg:right-[25rem]" : "inset-x-0") : redZoneSide}`}
          style={
            redZoneFull
              ? { top: "calc(var(--header-h, 0px) + var(--ticker-h, 0px) + 0.625rem)", bottom: desktop ? "0.75rem" : "var(--tabbar-h, 0px)" }
              : { top: stand.horizon + 0.375 * stand.rootPx, height: stand.redZoneOn - stand.horizon - 0.375 * stand.rootPx }
          }
        >
          <div
            className="absolute bottom-0 left-0 flex origin-bottom-left animate-[rise_0.5s_ease-out_backwards] flex-col bg-page/85 [animation-delay:120ms]"
            style={
              redZoneFull
                ? { width: "100%", height: "100%" }
                : { width: `${100 / redZoneScale}%`, height: `${100 / redZoneScale}%`, transform: `scale(${redZoneScale})` }
            }
          >
            {redZoneView}
          </div>
        </div>
        {redZoneFull ? null : <FloorReflection source={redZoneBox} />}
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
    <FloorCameraControls store={floorCamera} fit={stand.fit} games={games} list={startersList} desktop={desktop} />
  ) : null;

  if (!desktop) {
    // A phone: one scene that doesn't scroll, standing in the room, the ticker along its top — and under it, scrolling
    // as one list at the back of the room, above the horizon (nothing of it in front of the floor), any player graphs
    // and the starters list. Scrolled to its top, the graphs fill the room from under the ticker to the horizon, their
    // foot on it, the starters list behind it; with none up, the starters list from under the ticker. Scrolled, it goes
    // up under the see-through ticker and header and comes up from behind the horizon, reflected in the floor there.
    // The Red Zone stands on the floor in front of it (see redZoneStage) — stretched (⇕), in its place.
    const graphsUp = graphsView !== null;
    const underTicker = "var(--header-h, 0px) + var(--ticker-h, 0px) + 0.25rem";
    return (
      <div data-floor style={standVars}>
        <h1 className="sr-only">Dashboard</h1>
        {roomView}
        <div data-floor className="fixed inset-0 touch-none">
          <div
            className={`absolute inset-x-0 top-0 animate-[rise_0.5s_ease-out_backwards] ${redZoneFull ? "hidden" : ""}`}
            style={{ height: stand ? stand.horizon : "50%" }}
          >
            <div ref={setStartersList} className="h-full overflow-y-auto overscroll-contain px-4 pb-8" style={{ paddingTop: `calc(${underTicker})` }}>
              {graphsUp && stand ? (
                <div className="flex flex-col pt-1" style={{ height: `calc(${stand.horizon}px - (${underTicker}))` }}>
                  {graphsView}
                </div>
              ) : null}
              <div className="pt-2">{startersView}</div>
            </div>
          </div>
          <div className="absolute inset-x-0 top-[var(--header-h,0px)] px-4 pt-6">
            <LeagueTicker leagues={leagueCards} />
          </div>
        </div>
        {/* Reflected in the floor from the horizon, as it scrolls. */}
        {redZoneFull ? null : <FloorReflection source={startersList} className="px-4 pb-8" style={{ paddingTop: `calc(${underTicker})` }} />}
        {redZoneStage}
        {mapShown ? <FloorMapTags fit={stand.fit} games={games} top={stand.landTop} camera={floorCamera} /> : null}
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
          className="sticky top-[calc(var(--header-h,0px)+var(--ticker-h,0px)+0.625rem)] flex min-w-0 flex-1 origin-left flex-col overflow-hidden [rotate:y_4deg]"
          style={{ height: graphsBack ? `calc(${COLUMN_TO_HORIZON})` : 0 }}
        >
          {/* Faintly reflected in the floor. */}
          {graphsBack ? <div className="floor-reflect flex min-h-0 flex-1 animate-[rise_0.5s_ease-out_backwards] flex-col">{graphsView}</div> : null}
        </div>

        {/* Starters by game, with its own scroll, so a long list here doesn't push the left column around or vice versa.
            As wide as its rows need (in rem, so it shrinks with the text when the browser zooms out), the map's column
            taking the rest. It stands upright on the floor's lowest grid line (--stand), facing you square on, as
            something standing on a line across the floor does — from where it sits under the ticker (past the gap and
            the row's padding, 0.625rem), so its foot is on the line whether or not it's stuck. Its bottom 15% fades
            out, so it's gone by the time it meets the floor, a faint reflection of it there. */}
        <div ref={setStartersList} className="sticky top-[calc(var(--header-h,0px)+var(--ticker-h,0px)+0.625rem)] h-[calc(var(--room-h,100vh)-var(--header-h,0px)-var(--ticker-h,0px)-0.625rem-var(--stand,0px))] w-80 shrink-0 animate-[rise_0.5s_ease-out_backwards] overflow-y-auto pb-16 [animation-delay:200ms] [mask-image:linear-gradient(to_bottom,black_85%,transparent)] lg:w-[22rem]">
          {startersView}
        </div>
      </div>
      {mapShown ? (
        <FloorMapTags
          fit={stand.fit}
          games={games}
          // The countdown over the map's middle, above the horizon — out of the way of graphs.
          top={stand.horizon - 0.75 * stand.rootPx}
          overhead={graphsBack ? undefined : <KickoffCountdown kickoffs={kickoffs} />}
          camera={floorCamera}
        />
      ) : null}
      <FloorReflection source={startersList} className="pb-16 [mask-image:linear-gradient(to_bottom,black_85%,transparent)]" />
      {redZoneStage}
      {floorControls}
    </div>
  );
}
