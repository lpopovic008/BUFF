"use client";

import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters, getLeagueUsers, getTradedPicks, isDynastyLeague, leagueQBFormat } from "@/lib/sleeper";
import { buildLiveStandings, regularSeasonWeeksOf } from "@/lib/league-data";
import { loadPlayerIdIndex, resolvePlayers } from "@/lib/players";
import { positionValuesById, seasonLinesById } from "@/lib/matchup-players";
import { normalizeName } from "@/lib/name-match";
import { PlayerStatsSnapshot } from "@/lib/player-stats";
import { PlayerValuesSnapshot, valueFor } from "@/lib/player-values";
import { ordinal } from "@/lib/format";
import { dayOf, valueOn } from "@/lib/value-history";
import { loadValueHistory } from "@/hooks/useLeagueTrades";
import {
  Candidate,
  futurePicks,
  MonitorPick,
  MonitorPosition,
  MonitorPlayer,
  MonitorTeam,
  playoffPicture,
  PlayoffStanding,
  positionalNeeds,
  sellCandidates,
  startersByPosition,
  Target,
  TeamNeeds,
  TradePartner,
  tradePartners,
  tradeTargets,
} from "@/lib/trade-monitor";
import rawStatsSnapshot from "@/data/player-stats.json";
import rawValuesSnapshot from "@/data/player-values.json";

const statsSnapshot = rawStatsSnapshot as unknown as PlayerStatsSnapshot;
const valuesSnapshot = rawValuesSnapshot as unknown as PlayerValuesSnapshot;
// How far back a player's value trend looks.
const TREND_DAYS = 91;

export interface TradeMonitor {
  leagueName: string;
  season: string;
  scoring?: Record<string, number>;
  dynasty: boolean;
  playoffTeams: number;
  teams: MonitorTeam[];
  players: Map<string, MonitorPlayer>;
  picture: PlayoffStanding[];
  needs: TeamNeeds[];
  /** For your team — none when you've no team in the league. */
  partners: TradePartner[];
  sell: Candidate[];
  stars: Target[];
  breakouts: Target[];
  /** Every team's future draft picks, for the trade calculator. */
  picks: MonitorPick[];
  /** How many each team starts at each position (see startersByPosition) — the calculator re-ranks rosters with it. */
  starters: Record<MonitorPosition, number>;
}

// How many future drafts a team's picks are counted for, and the most rounds a rookie draft has (more is a startup).
const PICK_SEASONS = 3;
const MAX_ROOKIE_ROUNDS = 7;
const DEFAULT_ROUNDS = 4;

/** A league read for trading (see trade-monitor.ts) — undefined while it loads, null if it couldn't be. */
export function useTradeMonitor(leagueId: string, myUserId: string | null): TradeMonitor | null | undefined {
  const [data, setData] = useState<{ leagueId: string; monitor: TradeMonitor | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [league, rosters, users, idIndex, history, traded] = await Promise.all([
        getLeague(leagueId),
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        loadPlayerIdIndex(),
        loadValueHistory(),
        getTradedPicks(leagueId),
      ]);
      if (!league) {
        if (!cancelled) setData({ leagueId, monitor: null });
        return;
      }
      const dynasty = isDynastyLeague(league);
      const superflex = leagueQBFormat(league) === "superflex";
      const tep = (league.scoring_settings?.bonus_rec_te ?? 0) > 0 ? "tep" : "standard";
      const standings = buildLiveStandings(rosters, users);
      const allIds = rosters.flatMap((r) => r.players ?? []);
      const resolved = await resolvePlayers(allIds);
      if (cancelled) return;

      // Valued as the league plays; trending by KTC's dynasty history, matched on position and name.
      const values = positionValuesById(
        valuesSnapshot,
        { listType: dynasty ? "dynasty" : "fantasy", format: superflex ? "superflex" : "oneQB", tep },
        idIndex
      );
      const trend = new Map<string, number>();
      if (history) {
        const today = dayOf(Date.now());
        for (const series of Object.values(history.players)) {
          const id = idIndex.get(`${series.p}-${normalizeName(series.n)}`);
          if (!id) continue;
          const [then, now] = [valueOn(history, series, superflex, today - TREND_DAYS), valueOn(history, series, superflex, today)];
          if (then != null && now != null && then >= 500) trend.set(id, now / then - 1);
        }
      }
      const season = seasonLinesById(statsSnapshot, league.scoring_settings);
      const players = new Map<string, MonitorPlayer>(
        resolved.map((p) => {
          const v = values.get(p.playerId);
          const s = season.get(p.playerId);
          return [
            p.playerId,
            {
              id: p.playerId,
              name: p.name,
              position: p.position,
              team: p.team,
              age: v?.age ?? null,
              value: v?.value ?? null,
              valueRank: v?.rank ?? null,
              trend: trend.get(p.playerId) ?? null,
              seasonRank: s?.rank ?? null,
              ppg: s?.ppg ?? null,
            },
          ];
        })
      );

      const mineRoster = rosters.find((r) => myUserId && (r.owner_id === myUserId || r.co_owners?.includes(myUserId)));
      const teams: MonitorTeam[] = standings.map((row) => ({
        rosterId: row.rosterId,
        name: row.teamName,
        mine: row.rosterId === mineRoster?.roster_id,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        pointsFor: row.pointsFor,
        rank: row.rank,
        players: rosters.find((r) => r.roster_id === row.rosterId)?.players ?? [],
      }));
      const playoffTeams = Number(league.settings.playoff_teams) || 6;
      const played = Math.max(0, ...teams.map((t) => t.wins + t.losses + t.ties));
      const gamesLeft = Math.max(0, regularSeasonWeeksOf(league) - played);
      const starters = startersByPosition(league.roster_positions);
      const needs = positionalNeeds(teams, players, starters);
      const myNeeds = needs.find((n) => n.rosterId === mineRoster?.roster_id);
      const mine = teams.find((t) => t.mine);
      const others = teams.filter((t) => !t.mine);
      const { stars, breakouts } = tradeTargets(
        others.map((t) => ({ rosterId: t.rosterId, players: t.players.flatMap((id) => players.get(id) ?? []) })),
        myNeeds?.needs ?? []
      );
      // Each team's picks for the next drafts — this season's too while its draft's still to come — valued as KTC's
      // middle of the round (where a pick lands isn't known yet).
      const year = Number(league.season);
      const first = league.status === "pre_draft" || league.status === "drafting" ? year : year + 1;
      const setRounds = Number(league.settings.draft_rounds) || 0;
      const picks = futurePicks(
        rosters.map((r) => r.roster_id),
        Array.from({ length: PICK_SEASONS }, (_, i) => first + i),
        setRounds > 0 && setRounds <= MAX_ROOKIE_ROUNDS ? setRounds : DEFAULT_ROUNDS,
        traded,
        (draft, round) => {
          const pick = valuesSnapshot.dynasty.find((p) => p.position === "RDP" && p.name === `${draft} Mid ${ordinal(round)}`);
          return pick ? valueFor(pick, superflex ? "superflex" : "oneQB", tep) : null;
        }
      );
      const monitor: TradeMonitor = {
        leagueName: league.name,
        season: league.season,
        scoring: league.scoring_settings,
        dynasty,
        playoffTeams,
        teams,
        players,
        picture: playoffPicture(teams, playoffTeams, gamesLeft),
        needs,
        partners: myNeeds ? tradePartners(myNeeds, needs.filter((n) => n !== myNeeds)) : [],
        sell: mine ? sellCandidates(mine.players.flatMap((id) => players.get(id) ?? [])) : [],
        stars,
        breakouts,
        picks,
        starters,
      };
      if (!cancelled) setData({ leagueId, monitor });
    })().catch(() => {
      if (!cancelled) setData({ leagueId, monitor: null });
    });
    return () => {
      cancelled = true;
    };
  }, [leagueId, myUserId]);
  return data?.leagueId === leagueId ? data.monitor : undefined;
}
