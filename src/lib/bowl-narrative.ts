import { MatchupGame, StandingsRow } from "./league-data";
import { BowlGamePick } from "./localStore";
import { formatPoints, ordinal } from "./format";

interface TeamGroup {
  rosterId: number;
  teamName: string;
  points: number;
}

function isPickEmpty(pick: BowlGamePick | null | undefined): pick is null | undefined {
  return !pick || (!pick.name.trim() && pick.playerIds.length === 0);
}

function teamForPlayer(games: MatchupGame[], playerId: string): MatchupGame["teams"][number] | null {
  for (const g of games) {
    for (const t of g.teams) {
      if (t.playerIds.includes(playerId)) return t;
    }
  }
  return null;
}

/** Groups a pick's players by which roster they're actually on, so a 2-player pick resolves to (up to) two sides — the picked players only ever identify who's playing, never named individually in the write-up. */
function groupPickByTeam(pick: BowlGamePick, games: MatchupGame[]): TeamGroup[] {
  const groups = new Map<number, TeamGroup>();
  for (const playerId of pick.playerIds) {
    const team = teamForPlayer(games, playerId);
    if (!team) continue;
    if (!groups.has(team.rosterId)) {
      groups.set(team.rosterId, { rosterId: team.rosterId, teamName: team.teamName, points: team.points });
    }
  }
  return Array.from(groups.values());
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
 * anything not resolvable yet (no pick made, teams don't resolve, not played yet).
 */
export function formatBowlResultLine(
  emoji: string,
  pick: BowlGamePick | null | undefined,
  games: MatchupGame[]
): string {
  const rawName = pick?.name.trim();
  const name = rawName ? withArticle(rawName.toUpperCase()) : "the [bowl game name]";
  const fallback = `${emoji} [team] won ${name}! Congrats to [team]!`;
  if (isPickEmpty(pick)) return fallback;

  const groups = groupPickByTeam(pick, games);
  if (groups.length !== 2) return fallback;

  const [a, b] = groups;
  if (a.points === 0 && b.points === 0) return fallback; // not played/scored yet
  const winner = a.points >= b.points ? a : b;
  return `${emoji} ${winner.teamName} won ${name}! Congrats to ${winner.teamName}!`;
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
 * Brackets stand in for whatever isn't resolvable yet.
 */
export function formatUpcomingBowlBlock(
  pick: BowlGamePick | null | undefined,
  nextWeek: number,
  games: MatchupGame[],
  standingsAfter: StandingsRow[]
): string[] {
  const name = pick?.name.trim() || `[Week ${nextWeek} Bowl Game Name]`;
  const groups = isPickEmpty(pick) ? [] : groupPickByTeam(pick, games);
  if (groups.length !== 2) {
    return [name, "[team 1] vs [team 2]", "", ...STAT_PLACEHOLDER_LINES];
  }

  const [a, b] = groups;
  const statLines = (team: TeamGroup, label: string) => {
    const row = standingsAfter.find((s) => s.rosterId === team.rosterId);
    const rank = pfPaRank(standingsAfter, team.rosterId);
    const pf = row ? formatPoints(row.pointsFor) : "[points for]";
    const pa = row ? formatPoints(row.pointsAgainst) : "[points against]";
    const pfRank = rank ? ordinal(rank.pf) : "[rank]";
    const paRank = rank ? ordinal(rank.pa) : "[rank]";
    return [
      `${label} has scored ${pf} which ranks ${pfRank} in the league`,
      `${label} has given up ${pa} which ranks ${paRank} in the league`,
    ];
  };
  return [
    name,
    `${a.teamName} vs ${b.teamName}`,
    "",
    ...statLines(a, a.teamName),
    ...statLines(b, b.teamName),
  ];
}

/** The "🥈 Honorable Mention" preview block — just the name and matchup, no PF/PA stats. */
export function formatUpcomingHonorableBlock(
  pick: BowlGamePick | null | undefined,
  nextWeek: number,
  games: MatchupGame[]
): string[] {
  const name = pick?.name.trim() || `[Week ${nextWeek} Bowl Game Name]`;
  const groups = isPickEmpty(pick) ? [] : groupPickByTeam(pick, games);
  if (groups.length !== 2) {
    return [name, "[team 1] vs [team 2]"];
  }
  const [a, b] = groups;
  return [name, `${a.teamName} vs ${b.teamName}`];
}
