import { MatchupGame, StandingsRow } from "./league-data";
import { BowlGamePick } from "./localStore";
import { formatPoints, ordinal } from "./format";

interface TeamGroup {
  rosterId: number;
  teamName: string;
  points: number;
  pickedPlayerIds: string[];
  playersPoints: Record<string, number>;
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

/** Groups a pick's players by which roster they're actually on this week, so a 4-player pick becomes (up to) two sides. */
function groupPickByTeam(pick: BowlGamePick, games: MatchupGame[]): TeamGroup[] {
  const groups = new Map<number, TeamGroup>();
  for (const playerId of pick.playerIds) {
    const team = teamForPlayer(games, playerId);
    if (!team) continue;
    const group = groups.get(team.rosterId) ?? {
      rosterId: team.rosterId,
      teamName: team.teamName,
      points: team.points,
      pickedPlayerIds: [],
      playersPoints: team.playersPoints,
    };
    group.pickedPlayerIds.push(playerId);
    groups.set(team.rosterId, group);
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

function namePlaceholder(week: number): string {
  return `[Week ${week} Bowl Game Name]`;
}

/** Avoids "won the The Bijan Bowl" when the commish already named it with its own article. */
function withArticle(name: string): string {
  return /^(the|a|an)\s/i.test(name) ? name : `the ${name}`;
}

function describePlayers(group: TeamGroup, playerNames: Record<string, string>): string {
  if (group.pickedPlayerIds.length === 0) return "[players]";
  return group.pickedPlayerIds
    .map((id) => `${playerNames[id] ?? "[player]"} (${formatPoints(group.playersPoints[id] ?? 0)} pts)`)
    .join(" and ");
}

/**
 * The "🔥 Matchup of the Week"/"🥈 Honorable Mention" preview block for the week
 * the pick was made in — names the game and previews the two teams' PF/PA ranks
 * and who's picked to carry them, filling in brackets for anything not set yet.
 */
export function formatBowlPreview(
  label: string,
  week: number,
  pick: BowlGamePick | null | undefined,
  games: MatchupGame[],
  standingsBefore: StandingsRow[],
  playerNames: Record<string, string>
): string {
  const name = pick?.name.trim() || namePlaceholder(week);
  const header = `${label}: ${name}`;
  if (isPickEmpty(pick)) {
    return `${header}\n[the two teams, their PF/PA ranks, and why it matters. WHO WILL PREVAIL?!]`;
  }

  const groups = groupPickByTeam(pick, games);
  if (groups.length !== 2) {
    return `${header}\n[the two teams, their PF/PA ranks, and why it matters. WHO WILL PREVAIL?!]`;
  }

  const [a, b] = groups;
  const describeTeam = (t: TeamGroup) => {
    const rank = pfPaRank(standingsBefore, t.rosterId);
    const rankText = rank ? ` (${ordinal(rank.pf)} in PF, ${ordinal(rank.pa)} in PA)` : "";
    return `${t.teamName}${rankText} — ${describePlayers(t, playerNames)} leading the way`;
  };
  return `${header}\n${describeTeam(a)} vs. ${describeTeam(b)}. Who will prevail?!`;
}

/**
 * The "🏆 Matchup of the Week result:" block for the week AFTER the pick was made —
 * looks up who actually won between the two picked teams and how the picked
 * players scored, filling in brackets for anything not resolvable yet.
 */
export function formatBowlResult(
  week: number,
  pick: BowlGamePick | null | undefined,
  games: MatchupGame[],
  playerNames: Record<string, string>
): string {
  const header = "🏆 Matchup of the Week result:";
  if (isPickEmpty(pick)) {
    return `${header}\n<who won the cup you named last week, and which two players carried them>`;
  }

  const name = withArticle(pick.name.trim() || namePlaceholder(week));
  const groups = groupPickByTeam(pick, games);
  if (groups.length !== 2) {
    return `${header}\n[team] won ${name}! [players] carried them.`;
  }

  const [a, b] = groups;
  if (a.points === 0 && b.points === 0) {
    // Not played/scored yet.
    return `${header}\n[team] won ${name}! [players] carried them.`;
  }
  const winner = a.points >= b.points ? a : b;
  return `${header}\n${winner.teamName} won ${name}! ${describePlayers(winner, playerNames)} carried them.`;
}
