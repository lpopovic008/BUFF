import { MatchupGame, StandingsRow } from "./league-data";
import { BowlGamePick } from "./localStore";
import { formatPoints, ordinal } from "./format";

function isPickEmpty(pick: BowlGamePick | null | undefined): pick is null | undefined {
  return !pick || (!pick.name.trim() && pick.rosterIds.length === 0);
}

function pointsFor(games: MatchupGame[], rosterId: number): number | null {
  const team = games.flatMap((g) => g.teams).find((t) => t.rosterId === rosterId);
  return team ? team.points : null;
}

function pfPaRank(standings: StandingsRow[], rosterId: number): { pf: number; pa: number } | null {
  if (!standings.some((s) => s.rosterId === rosterId)) return null;
  const byPF = [...standings].sort((a, b) => b.pointsFor - a.pointsFor);
  const byPA = [...standings].sort((a, b) => a.pointsAgainst - b.pointsAgainst);
  return {
    pf: byPF.findIndex((s) => s.rosterId === rosterId) + 1,
    pa: byPA.findIndex((s) => s.rosterId === rosterId) + 1,
  };
}

/** Avoids "won the THE BIJAN BOWL" when the commish already named it with its own article. */
function withArticle(name: string): string {
  return /^(the|a|an)\s/i.test(name) ? name : `the ${name}`;
}

/**
 * The "👑"/"🏆" result line for the week AFTER a pick was made — looks up which of
 * the two picked teams actually won and reports it, brackets standing in for
 * anything not resolvable yet (no pick made, not played yet).
 */
export function formatBowlResultLine(
  emoji: string,
  pick: BowlGamePick | null | undefined,
  teamNames: Record<number, string>,
  games: MatchupGame[]
): string {
  const rawName = pick?.name.trim();
  const name = rawName ? withArticle(rawName.toUpperCase()) : "the [bowl game name]";
  const fallback = `${emoji} [team] won ${name}! Congrats to [team]!`;
  if (isPickEmpty(pick) || pick.rosterIds.length !== 2) return fallback;

  const [aId, bId] = pick.rosterIds;
  const aPoints = pointsFor(games, aId);
  const bPoints = pointsFor(games, bId);
  if (aPoints == null || bPoints == null) return fallback;
  if (aPoints === 0 && bPoints === 0) return fallback; // not played/scored yet

  const winnerId = aPoints >= bPoints ? aId : bId;
  const winnerName = teamNames[winnerId] ?? "[team]";
  return `${emoji} ${winnerName} won ${name}! Congrats to ${winnerName}!`;
}

const STAT_PLACEHOLDER_LINES = [
  "[team 1] has scored [team 1 points for so far] which ranks [ranking of PF] in the league",
  "[team 1] has given up [team 1 points against so far] which ranks [ranking of PA] in the league",
  "[team 2] has scored [team 2 points for so far] which ranks [ranking of PF] in the league",
  "[team 2] has given up [team 2 points against so far] which ranks [ranking of PA] in the league",
];

/**
 * The "🥇 Matchup of the Week" preview block for the upcoming week: bowl name,
 * "Team A vs Team B", and each team's season-to-date PF/PA with league rank.
 * Team names come straight from the picked roster ids (so they're right even
 * before there's any matchup data, e.g. during the preseason); PF/PA falls
 * back to brackets until standings exist.
 */
export function formatUpcomingBowlBlock(
  pick: BowlGamePick | null | undefined,
  nextWeek: number,
  teamNames: Record<number, string>,
  standingsAfter: StandingsRow[]
): string[] {
  const name = pick?.name.trim() || `[Week ${nextWeek} Bowl Game Name]`;
  if (isPickEmpty(pick) || pick.rosterIds.length !== 2) {
    return [name, "[team 1] vs [team 2]", "", ...STAT_PLACEHOLDER_LINES];
  }

  const [aId, bId] = pick.rosterIds;
  const aName = teamNames[aId] ?? "[team 1]";
  const bName = teamNames[bId] ?? "[team 2]";
  const statLines = (rosterId: number, label: string) => {
    const row = standingsAfter.find((s) => s.rosterId === rosterId);
    const rank = pfPaRank(standingsAfter, rosterId);
    const pf = row ? formatPoints(row.pointsFor) : "[points for]";
    const pa = row ? formatPoints(row.pointsAgainst) : "[points against]";
    const pfRank = rank ? ordinal(rank.pf) : "[rank]";
    const paRank = rank ? ordinal(rank.pa) : "[rank]";
    return [
      `${label} has scored ${pf} which ranks ${pfRank} in the league`,
      `${label} has given up ${pa} which ranks ${paRank} in the league`,
    ];
  };
  return [name, `${aName} vs ${bName}`, "", ...statLines(aId, aName), ...statLines(bId, bName)];
}

/** The "🥈 Honorable Mention" preview block — just the name and matchup, no PF/PA stats. */
export function formatUpcomingHonorableBlock(
  pick: BowlGamePick | null | undefined,
  nextWeek: number,
  teamNames: Record<number, string>
): string[] {
  const name = pick?.name.trim() || `[Week ${nextWeek} Bowl Game Name]`;
  if (isPickEmpty(pick) || pick.rosterIds.length !== 2) {
    return [name, "[team 1] vs [team 2]"];
  }
  const [aId, bId] = pick.rosterIds;
  return [name, `${teamNames[aId] ?? "[team 1]"} vs ${teamNames[bId] ?? "[team 2]"}`];
}
