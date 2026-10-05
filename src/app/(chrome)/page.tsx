"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { GameMap, MappedGame } from "@/components/GameMap";
import { LeagueTicker, TickerLeague } from "@/components/LeagueTicker";
import { HistoryButtons } from "@/components/HistoryButtons";
import { LeagueLegendEntry, StartersByGame } from "@/components/StartersByGame";
import { RedZone } from "@/components/RedZone";
import { useConfig } from "@/hooks/useConfig";
import { MatchupTarget, useDashboardMatchups } from "@/hooks/useDashboardMatchups";
import { StarterSource, useMyStarters } from "@/hooks/useMyStarters";
import { useNFLState } from "@/hooks/useNFLState";
import { useWeekGames } from "@/hooks/useWeekGames";
import { useRedZoneFeed } from "@/hooks/useRedZoneFeed";
import { getLeagueSummary, LeagueSummary, teamStandings } from "@/lib/league-data";
import { groupStartersByGame, GroupedStarter } from "@/lib/my-starters";
import { avatarUrl, getCurrentWeek } from "@/lib/sleeper";
import { kickoffBlockLabel } from "@/lib/game-map";
import { TrackedLeague } from "@/lib/localStore";

interface LoadedLeague {
  tracked: TrackedLeague;
  summary: LeagueSummary;
}

export default function DashboardPage() {
  const { config, loaded } = useConfig();
  const [leagues, setLeagues] = useState<LoadedLeague[] | null>(null);
  const [week, setWeek] = useState<number | null>(null);
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
  const matchups = useDashboardMatchups(matchupTargets, week);

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
  const weekGames = useWeekGames(nflPhase.season ?? config.season, week);
  const { mine: myStarters, opponent: opponentStarters } = useMyStarters(starterSources, week);

  // Which leagues' starters to show — null means "no explicit choice yet",
  // which defaults to every tracked league until the user toggles one off.
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<Set<string> | null>(null);
  const allLeagueIds = useMemo(() => new Set(starterSources.map((s) => s.leagueId)), [starterSources]);
  const effectiveSelected = selectedLeagueIds ?? allLeagueIds;
  const toggleLeague = (leagueId: string) => {
    setSelectedLeagueIds((prev) => {
      const base = prev ?? allLeagueIds;
      const next = new Set(base);
      if (next.has(leagueId)) next.delete(leagueId);
      else next.add(leagueId);
      return next;
    });
  };

  // Kickoff windows ("Sunday Noon") whose games are hidden from the map —
  // toggled from the starters list's block headers. Everything shows by default.
  const [hiddenBlocks, setHiddenBlocks] = useState<Set<string>>(() => new Set());
  const toggleBlock = (label: string) => {
    setHiddenBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

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

  // Every play your (selected leagues') starters are part of, for the Red Zone under the map.
  const redZoneFeed = useRedZoneFeed(grouped.games);
  const anyStarted = grouped.games.some((g) => g.game.state !== "pre" && g.players.length > 0);

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
  const leagueCards: TickerLeague[] = leagues.map(({ tracked, summary }) => {
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
    };
  });

  return (
    <div className="flex flex-col gap-0.5">
      <h1 className="sr-only">Dashboard</h1>
      <LeagueTicker leagues={leagueCards} />

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-3">
        {/* The map, with room underneath it for what comes next. Its own scroll container at md+, independent of the starters column beside it. Flipped to rtl so its scrollbar sits on the column's own left edge instead of in the gutter between the two columns — the inner wrapper flips back to ltr so the content itself still reads normally. */}
        <div className="min-w-0 flex-1 md:sticky md:top-[calc(var(--header-h,0px)+var(--ticker-h,0px)+2px)] md:max-h-[calc(100vh-var(--header-h,0px)-var(--ticker-h,0px)-2px-1.5rem)] md:overflow-y-auto md:[direction:rtl]">
          <div className="flex flex-col gap-6 md:pb-16 md:[direction:ltr]">
            {/* Back and forward, at the top left just under the ticker — in this column only, so starters by game runs right up to the ticker. */}
            <div className="-mb-[calc(1.5rem-2px)]">
              <HistoryButtons />
            </div>
            {weekGames.length > 0 ? (
              <div className="animate-[rise_0.5s_ease-out_backwards]">
                <GameMap
                  games={mappedGames.filter((g) => !hiddenBlocks.has(kickoffBlockLabel(g.game)))}
                  legend={legend}
                />
              </div>
            ) : null}

            {/* Below the map: the Red Zone, your starters' plays as they happen. Your leagues ride the ticker under the header (see LeagueTicker). */}
            {weekGames.length > 0 && myStarters !== null ? (
              <div className="animate-[rise_0.5s_ease-out_backwards] [animation-delay:120ms]">
                <RedZone feed={redZoneFeed} legend={legend} anyStarted={anyStarted} />
              </div>
            ) : null}
          </div>
        </div>

        {/* Starters by game — one continuous column running alongside the map and leagues, with its own independent scroll at md+ so a long list here doesn't push the left column around or vice versa. Always a quarter of the window wide once side-by-side. */}
        <div className="w-full animate-[rise_0.5s_ease-out_backwards] [animation-delay:200ms] md:sticky md:top-[calc(var(--header-h,0px)+var(--ticker-h,0px)+2px)] md:max-h-[calc(100vh-var(--header-h,0px)-var(--ticker-h,0px)-2px-1.5rem)] md:w-[30vw] md:shrink-0 md:overflow-y-auto pb-16">
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
              games={grouped.games}
              notPlaying={grouped.notPlaying}
              legend={legend}
              selectedLeagueIds={effectiveSelected}
              onToggleLeague={toggleLeague}
              hiddenBlocks={hiddenBlocks}
              onToggleBlock={toggleBlock}
            />
          )}
        </div>
      </div>

    </div>
  );
}
