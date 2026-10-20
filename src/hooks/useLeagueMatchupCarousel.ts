"use client";

import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters, getLeagueUsers, getMatchups, isDynastyLeague, leagueQBFormat } from "@/lib/sleeper";
import { buildLeagueMatchups } from "@/lib/league-data";
import { loadPlayerIdIndex, resolvePlayers, ResolvedPlayer } from "@/lib/players";
import { positionValueRanksById, seasonLinesById } from "@/lib/matchup-players";
import { PlayerStatsSnapshot } from "@/lib/player-stats";
import { PlayerValuesSnapshot } from "@/lib/player-values";
import rawStatsSnapshot from "@/data/player-stats.json";
import rawValuesSnapshot from "@/data/player-values.json";
import { LIVE_TTL_SECONDS } from "@/lib/live-clock";
import { useLiveTick } from "@/hooks/useLiveTick";

const statsSnapshot = rawStatsSnapshot as unknown as PlayerStatsSnapshot;
const valuesSnapshot = rawValuesSnapshot as unknown as PlayerValuesSnapshot;

export interface ResolvedSlot {
  slot: string;
  player: ResolvedPlayer | null;
  livePoints: number;
  /** Their rank at their position by KTC value — dynasty values in a dynasty league, redraft otherwise — or null if KTC doesn't list them. */
  valueRank: number | null;
  /** Their rank at their position by this season's points under the league's scoring, or null if they haven't played. */
  seasonRank: number | null;
  /** Their points a game this season under the league's scoring, or null if they haven't played. */
  ppg: number | null;
}

export interface ResolvedMatchupTeam {
  rosterId: number;
  teamName: string;
  points: number;
  slots: ResolvedSlot[];
}

export interface ResolvedMatchupGame {
  matchupId: number;
  teams: ResolvedMatchupTeam[];
}

export interface LeagueMatchupCarouselData {
  games: ResolvedMatchupGame[];
}

/** Every matchup for a league's week, full starting lineups resolved to names, reloaded on every live-clock tick so points update live during games. */
export function useLeagueMatchupCarousel(leagueId: string | null, week: number | null): LeagueMatchupCarouselData | null {
  const [data, setData] = useState<LeagueMatchupCarouselData | null>(null);
  const tick = useLiveTick();

  useEffect(() => {
    if (!leagueId || week == null) {
      queueMicrotask(() => setData(null));
      return;
    }
    const id = leagueId;
    const currentWeek = week;
    let cancelled = false;

    async function load() {
      const [league, rosters, users, matchups] = await Promise.all([
        getLeague(id),
        getLeagueRosters(id),
        getLeagueUsers(id),
        getMatchups(id, currentWeek, LIVE_TTL_SECONDS),
      ]);
      if (!league || cancelled) return;

      const raw = buildLeagueMatchups(league, matchups, rosters, users);
      const allIds = raw.flatMap((g) =>
        g.teams.flatMap((t) => t.slots.map((s) => s.playerId).filter((pid): pid is string => pid !== null))
      );
      const [resolved, idIndex] = await Promise.all([resolvePlayers(allIds), loadPlayerIdIndex()]);
      if (cancelled) return;
      const byId = new Map(resolved.map((p) => [p.playerId, p]));

      // Valued as the league plays: dynasty or redraft, 1QB or superflex, TE premium or not.
      const valueRanks = positionValueRanksById(
        valuesSnapshot,
        {
          listType: isDynastyLeague(league) ? "dynasty" : "fantasy",
          format: leagueQBFormat(league),
          tep: (league.scoring_settings?.bonus_rec_te ?? 0) > 0 ? "tep" : "standard",
        },
        idIndex
      );
      const seasonLines = seasonLinesById(statsSnapshot, league.scoring_settings);

      const withNames: ResolvedMatchupGame[] = raw.map((g) => ({
        matchupId: g.matchupId,
        teams: g.teams.map((t) => ({
          rosterId: t.rosterId,
          teamName: t.teamName,
          points: t.points,
          slots: t.slots.map((s) => {
            const player = s.playerId ? (byId.get(s.playerId) ?? null) : null;
            const season = player ? seasonLines.get(player.playerId) : undefined;
            return {
              slot: s.slot,
              player,
              livePoints: s.playerId ? (t.playersPoints[s.playerId] ?? 0) : 0,
              valueRank: player ? (valueRanks.get(player.playerId) ?? null) : null,
              seasonRank: season?.rank ?? null,
              ppg: season?.ppg ?? null,
            };
          }),
        })),
      }));
      if (!cancelled) {
        setData({ games: withNames });
      }
    }

    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueId, week, tick]);

  return data;
}
