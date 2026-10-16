"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { GameMap, MappedGame } from "@/components/GameMap";
import { LeagueTicker, TickerLeague } from "@/components/LeagueTicker";
import { ByeTeam, LeagueLegendEntry, StartersByGame } from "@/components/StartersByGame";
import { NFL_TEAMS } from "@/lib/nfl-logos";
import { PointsGraphGrid } from "@/components/PointsGraph";
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
import { GameStarters, groupStartersByGame, GroupedStarter, startersListGames } from "@/lib/my-starters";
import { avatarUrl, getCurrentWeek, weighProjection } from "@/lib/sleeper";
import { kickoffBlockLabel } from "@/lib/game-map";
import { setHeaderWeek } from "@/lib/header-week";
import { TrackedLeague } from "@/lib/localStore";

interface LoadedLeague {
  tracked: TrackedLeague;
  summary: LeagueSummary;
}

/** The NFL regular season's weeks, all of which the header's week picker offers. */
const NFL_WEEKS = 18;

/** How many players' graphs can be up at once, in place of the map. */
const MAX_GRAPHS = 4;
/** How long after the last name tapped the page slides to the graphs, and how long the slide takes. */
const GRAPH_PICK_PAUSE_MS = 700;
const GRAPH_SCROLL_MS = 700;

export default function DashboardPage() {
  const { config, loaded } = useConfig();
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
          config.leagues.map(async (tracked) => {
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
  // Single games taken off the map (swiped over in the starters list) — for that week.
  const [mapOff, setMapOff] = useState<{ week: number | null; ids: Set<string> }>(() => ({ week: null, ids: new Set() }));
  const offMap = useMemo(() => (mapOff.week === shownWeek ? mapOff.ids : new Set<string>()), [mapOff, shownWeek]);
  const toggleMap = (gameId: string) => {
    const ids = new Set(offMap);
    if (ids.has(gameId)) ids.delete(gameId);
    else ids.add(gameId);
    setMapOff({ week: shownWeek, ids });
  };
  // The players whose points-over-time graphs are up in place of the map (tapped in the starters list), up to four — for that week.
  const [graphPicks, setGraphPicks] = useState<{ week: number | null; picks: { playerId: string; gameId: string }[] }>(() => ({ week: null, picks: [] }));
  const graphFor = useMemo(() => (graphPicks.week === shownWeek ? graphPicks.picks : []), [graphPicks, shownWeek]);
  const mapSlotRef = useRef<HTMLDivElement>(null);
  // On a phone the map is up the page, so once the picking stops the page slides up to the graphs. Not
  // after each tap: names are often tapped a few in a row, and the list sliding between two taps would put
  // the one just picked under the finger, taking its graph back down. A tap that lands while the page is
  // sliding is let go for the same reason.
  const graphScroll = useRef<{ timer: number | null; slidingUntil: number }>({ timer: null, slidingUntil: 0 });
  useEffect(() => {
    const scroll = graphScroll.current;
    return () => {
      if (scroll.timer !== null) clearTimeout(scroll.timer);
    };
  }, []);
  const pickGraph = (playerId: string, gameId: string) => {
    const scroll = graphScroll.current;
    if (performance.now() < scroll.slidingUntil) return;
    const already = graphFor.some((p) => p.playerId === playerId && p.gameId === gameId);
    // Tapped again, theirs comes down; a fifth pushes the first one out.
    const picks = already
      ? graphFor.filter((p) => !(p.playerId === playerId && p.gameId === gameId))
      : [...graphFor, { playerId, gameId }].slice(-MAX_GRAPHS);
    setGraphPicks({ week: shownWeek, picks });
    const waiting = scroll.timer !== null;
    if (scroll.timer !== null) clearTimeout(scroll.timer);
    scroll.timer = null;
    if (picks.length === 0 || (already && !waiting)) return;
    scroll.timer = window.setTimeout(() => {
      scroll.timer = null;
      const el = mapSlotRef.current;
      if (!el) return;
      // Only when the graphs are mostly out of sight (under the header and ticker counts as out of sight).
      const rect = el.getBoundingClientRect();
      const css = getComputedStyle(document.documentElement);
      const covered = (parseFloat(css.getPropertyValue("--header-h")) || 0) + (parseFloat(css.getPropertyValue("--ticker-h")) || 0);
      const inSight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, covered);
      if (inSight >= rect.height * 0.4) return;
      scroll.slidingUntil = performance.now() + GRAPH_SCROLL_MS;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, GRAPH_PICK_PAUSE_MS);
  };
  const unpickGraph = (playerId: string) =>
    setGraphPicks({ week: shownWeek, picks: graphFor.filter((p) => p.playerId !== playerId) });
  // Escape takes every graph down and puts the map back.
  const anyGraph = graphFor.length > 0;
  useEffect(() => {
    if (!anyGraph) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGraphPicks({ week: null, picks: [] });
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

  const anyGameLive = weekGames.some((g) => g.state === "in");

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
    const benched = [
      ...grouped.notPlaying.map((p) => ({ ...p, side: "mine" as const })),
      ...groupedOpponent.notPlaying.map((p) => ({ ...p, side: "opponent" as const })),
    ];
    const out: ByeTeam[] = teams.map((team) => {
      const everyone = benched.filter((p) => p.team === team);
      return { team, players: everyone.filter((p) => p.side === "mine"), everyone };
    });
    const teamless = benched.filter((p) => !p.team || !teams.includes(p.team));
    if (teamless.length > 0) out.push({ team: null, players: teamless.filter((p) => p.side === "mine"), everyone: teamless });
    return out;
  }, [weekGames, grouped.notPlaying, groupedOpponent.notPlaying]);

  const mappedGames = useMemo<MappedGame[]>(() => {
    const startersByGameId = new Map(grouped.games.map((g) => [g.game.id, g.players]));
    const opponentStartersByGameId = new Map(groupedOpponent.games.map((g) => [g.game.id, g.players]));
    const toMappedStarters = (players: GroupedStarter[]) =>
      players.map((p) => ({ playerId: p.playerId, name: p.name, leagueIds: p.leagueIds }));
    return weekGames.map((game) => ({
      game,
      starters: toMappedStarters(startersByGameId.get(game.id) ?? []),
      opponentStarters: toMappedStarters(opponentStartersByGameId.get(game.id) ?? []),
    }));
  }, [weekGames, grouped.games, groupedOpponent.games]);

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

  return (
    <div className="flex flex-col gap-0.5">
      <h1 className="sr-only">Dashboard</h1>
      <LeagueTicker leagues={leagueCards} />

      {/* On phones the map column's wrappers step aside (display: contents), so the Red Zone can sit either under the map or after the starters list. */}
      <div className={`flex flex-col gap-6 md:flex-row md:items-start md:gap-3 ${anyGameLive ? "max-md:pb-16" : ""}`}>
        {/* The map, with room underneath it for what comes next. Its own scroll container at md+, independent of the starters column beside it. Flipped to rtl so its scrollbar sits on the column's own left edge instead of in the gutter between the two columns — the inner wrapper flips back to ltr so the content itself still reads normally. */}
        <div className="min-w-0 flex-1 max-md:contents md:sticky md:top-[calc(var(--header-h,0px)+var(--ticker-h,0px)+2px)] md:max-h-[calc(100vh-var(--header-h,0px)-var(--ticker-h,0px)-2px-1.5rem)] md:overflow-y-auto md:[direction:rtl]">
          <div className="flex flex-col gap-6 max-md:contents md:[direction:ltr]">
            {weekGames.length > 0 ? (
              <div className="animate-[rise_0.5s_ease-out_backwards]">
                {/* A player's graph takes the map's place; the map stays put underneath, just out of sight. */}
                <div ref={mapSlotRef} className="relative scroll-mt-[calc(var(--header-h,0px)+var(--ticker-h,0px)+0.5rem)]">
                  <div className={graphed.length > 0 ? "invisible" : undefined} aria-hidden={graphed.length > 0 ? true : undefined}>
                    <GameMap
                      games={mappedGames.filter((g) => !hiddenBlocks.has(kickoffBlockLabel(g.game)) && !offMap.has(g.game.id))}
                      legend={legend}
                    />
                  </div>
                  {/* One graph in full; two stacked; three or four, one to a corner. */}
                  {graphed.length > 0 ? (
                    <div className="absolute inset-0">
                      <PointsGraphGrid
                        graphs={graphed.map(({ game, player }) => ({
                          game,
                          player,
                          // Under the league their row's points are scored in (the first they're started in); anyone else's is PPR, as their row is.
                          scoring: player.side === "other" ? undefined : scoringByLeague.get(player.leagueIds[0]),
                        }))}
                        onClose={unpickGraph}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Below the map: the Red Zone, your starters' plays as they happen — its title sticks at the top as the plays scroll on under it. On phones it waits at the very bottom of the page until a game is live, then moves up under the map as a short box you scroll within. Your leagues ride the ticker under the header (see LeagueTicker). */}
            {weekGames.length > 0 && myStarters !== null ? (
              <div className={`animate-[rise_0.5s_ease-out_backwards] [animation-delay:120ms] ${anyGameLive ? "" : "max-md:order-last"}`}>
                <RedZone
                  // Fresh for each week, so a week's plays slide in rather than flashing as new.
                  key={shownWeek ?? 0}
                  starters={grouped.games}
                  opponents={groupedOpponent.games}
                  weekGames={weekGames}
                  legend={legend}
                  weekStats={livePlayers.stats}
                  compactOnPhone={anyGameLive}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Starters by game — one continuous column running alongside the map and leagues, with its own independent scroll at md+ so a long list here doesn't push the left column around or vice versa. Always a quarter of the window wide once side-by-side. */}
        <div className="w-full animate-[rise_0.5s_ease-out_backwards] [animation-delay:200ms] md:sticky md:top-[calc(var(--header-h,0px)+var(--ticker-h,0px)+2px)] md:max-h-[calc(100vh-var(--header-h,0px)-var(--ticker-h,0px)-2px-1.5rem)] md:w-[30vw] md:shrink-0 md:overflow-y-auto md:pb-16">
          {myStarters === null ? (
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
            />
          )}
        </div>
      </div>

    </div>
  );
}
