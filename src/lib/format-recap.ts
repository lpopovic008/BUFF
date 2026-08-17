import { WeekRecapData } from "./league-data";
import { formatPoints, ordinal } from "./format";

export function formatRecapMarkdown(data: WeekRecapData): string {
  const lines: string[] = [];
  lines.push(`# ${data.league.name} — Week ${data.week} Recap`);
  lines.push("");

  lines.push("## Matchups");
  for (const game of data.games) {
    if (game.teams.length === 2) {
      const [a, b] = [...game.teams].sort((x, y) => y.points - x.points);
      lines.push(`- **${a.teamName}** ${formatPoints(a.points)} def. **${b.teamName}** ${formatPoints(b.points)}`);
    } else if (game.teams.length === 1) {
      lines.push(`- **${game.teams[0].teamName}** had the bye (${formatPoints(game.teams[0].points)} pts)`);
    }
  }
  lines.push("");

  lines.push("## Highlights");
  if (data.topScorer) lines.push(`- Top score: **${data.topScorer.teamName}** — ${formatPoints(data.topScorer.points)} pts`);
  if (data.lowScorer) lines.push(`- Lowest score: **${data.lowScorer.teamName}** — ${formatPoints(data.lowScorer.points)} pts`);
  if (data.closestGame) {
    lines.push(
      `- Nail-biter: **${data.closestGame.a}** vs **${data.closestGame.b}** — decided by ${formatPoints(data.closestGame.margin)} pts`
    );
  }
  if (data.biggestBlowout) {
    lines.push(
      `- Blowout of the week: **${data.biggestBlowout.winner}** over **${data.biggestBlowout.loser}** by ${formatPoints(data.biggestBlowout.margin)} pts`
    );
  }
  lines.push(`- League average score: ${formatPoints(data.leagueAverage)} pts`);
  lines.push("");

  lines.push("## Standings");
  for (const row of data.standingsAfter) {
    const before = data.standingsBefore.find((b) => b.rosterId === row.rosterId);
    const movement = before && before.rank !== row.rank ? ` (${before.rank > row.rank ? "up" : "down"} from ${ordinal(before.rank)})` : "";
    lines.push(
      `${row.rank}. **${row.teamName}** — ${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}, ${formatPoints(row.pointsFor)} pts${movement}`
    );
  }
  lines.push("");

  if (data.transactionSummaries.length > 0) {
    lines.push("## Waiver Wire & Trades");
    for (const summary of data.transactionSummaries) {
      lines.push(`- ${summary}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
