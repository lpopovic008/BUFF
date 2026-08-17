import { WeekRecapData } from "./league-data";
import { PayoutLedger, summarizeWeek, standingsThroughWeek } from "./payouts";
import { LeagueProfile } from "./league-config";
import { formatPoints, ordinal } from "./format";

/**
 * Weekly recap in the house style of the Dynasty Write-ups doc: emoji section
 * headers, the high-score callout, the commission list with the high scorer
 * flagged, a full scoreboard with check marks, and the running money standings.
 *
 * Everything here is mechanical and derived from Sleeper. The narrative beats —
 * naming the Matchup of the Week, the trash talk, the storylines — are left as
 * clearly marked prompts, since those are the parts only the commish can write.
 */
export function formatCommishRecap({
  data,
  ledger,
  profile,
}: {
  data: WeekRecapData;
  ledger: PayoutLedger;
  profile: LeagueProfile;
}): string {
  const week = data.week;
  const summary = summarizeWeek(ledger, week);
  const lines: string[] = [];

  lines.push(`🚨🏈 Week ${week} Recap`);
  lines.push("");

  if (summary?.highScorer) {
    const hs = summary.highScorer;
    lines.push(
      `📈 ${hs.name} outperformed the league this week by scoring ${formatPoints(hs.points)} points!`
    );
    lines.push("");
  }

  lines.push("🏆 Matchup of the Week result:");
  lines.push("<who won the cup you named last week, and which two players carried them>");
  lines.push("");

  if (summary && summary.winners.length > 0) {
    lines.push("🤝 Winners this week who will receive commission:");
    for (const w of summary.winners) {
      const isHigh = summary.highScorer?.rosterId === w.rosterId;
      lines.push(`${isHigh ? "🔹" : "▫️"}${w.name} — $${w.payout}`);
    }
    lines.push("");
  }

  if (summary) {
    lines.push("👁️ Last week Results:");
    for (const row of summary.scoreboard) {
      lines.push(`${row.name} ${formatPoints(row.points)}${row.won ? "✅" : "❌"}`);
    }
    lines.push("");
  }

  lines.push("💰 Updated Standings:");
  for (const row of standingsThroughWeek(ledger, week)) {
    lines.push(`$${row.amount} ${row.name}`);
  }
  lines.push("");

  const potLeft =
    ledger.reconciliation.pot - ledger.reconciliation.finalTotal - ledger.paidToDate;
  const weeksLeft = profile.payouts.regularSeasonWeeks - ledger.weeksPlayed.length;
  if (weeksLeft > 0) {
    lines.push(
      `(${weeksLeft} regular-season week${weeksLeft === 1 ? "" : "s"} left · $${potLeft} of weekly commission still to pay out · $${ledger.reconciliation.finalTotal} held for the top 3)`
    );
    lines.push("");
  }

  lines.push(`🔥 Matchup of the Week: <NAME THE CUP>`);
  lines.push("<the two teams, their PF/PA ranks, and why it matters. WHO WILL PREVAIL?!>");
  lines.push("");
  lines.push("🥈 Honorable Mention: <NAME IT>");
  lines.push("<second matchup worth calling out. Good luck to all!>");
  lines.push("");

  return lines.join("\n");
}

/** Generic recap for leagues without a commissioner profile configured. */
export function formatRecapMarkdown(data: WeekRecapData): string {
  const lines: string[] = [];
  lines.push(`# ${data.league.name} — Week ${data.week} Recap`);
  lines.push("");

  lines.push("## Matchups");
  for (const game of data.games) {
    if (game.teams.length === 2) {
      const [a, b] = [...game.teams].sort((x, y) => y.points - x.points);
      lines.push(
        `- **${a.teamName}** ${formatPoints(a.points)} def. **${b.teamName}** ${formatPoints(b.points)}`
      );
    } else if (game.teams.length === 1) {
      lines.push(
        `- **${game.teams[0].teamName}** had the bye (${formatPoints(game.teams[0].points)} pts)`
      );
    }
  }
  lines.push("");

  lines.push("## Highlights");
  if (data.topScorer)
    lines.push(
      `- Top score: **${data.topScorer.teamName}** — ${formatPoints(data.topScorer.points)} pts`
    );
  if (data.lowScorer)
    lines.push(
      `- Lowest score: **${data.lowScorer.teamName}** — ${formatPoints(data.lowScorer.points)} pts`
    );
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
    const movement =
      before && before.rank !== row.rank
        ? ` (${before.rank > row.rank ? "up" : "down"} from ${ordinal(before.rank)})`
        : "";
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
