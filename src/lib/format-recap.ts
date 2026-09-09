import { WeekRecapData, MatchupGame } from "./league-data";
import { PayoutLedger, summarizeWeek, standingsThroughWeek } from "./payouts";
import { formatPoints, ordinal } from "./format";
import { RecapModel, joinRecapModel } from "./recap-model";

/** The high-scoring team's own top-scoring starters — who "led the scoring" for that team this week, richest first. */
export function findWeekTopStarters(
  rosterId: number,
  games: MatchupGame[],
  count = 2
): { playerId: string; points: number }[] {
  const team = games.flatMap((g) => g.teams).find((t) => t.rosterId === rosterId);
  if (!team) return [];
  return team.starterIds
    .filter((id) => team.playersPoints[id] != null)
    .sort((a, b) => team.playersPoints[b] - team.playersPoints[a])
    .slice(0, count)
    .map((id) => ({ playerId: id, points: team.playersPoints[id] }));
}

const DETAIL_PLACEHOLDER = "<Detail>";

export interface RecapDetails {
  bowlResult: string;
  honorableResult: string;
  highScorer: string;
  upcomingBowl: string;
  upcomingHonorable: string;
}

const DEFAULT_DETAILS: RecapDetails = {
  bowlResult: DETAIL_PLACEHOLDER,
  honorableResult: DETAIL_PLACEHOLDER,
  highScorer: DETAIL_PLACEHOLDER,
  upcomingBowl: DETAIL_PLACEHOLDER,
  upcomingHonorable: DETAIL_PLACEHOLDER,
};

/**
 * Weekly recap in the house style of the Dynasty Write-ups doc, as a
 * structured model — one field per header/box the editor shows, rather than
 * one flat block of text. `formatCommishRecap` below flattens this the same
 * way it always has, for callers (the weekly-recap CI script, the editor's
 * save/copy actions) that just want the final text. The bowl-game
 * result/preview lines are pre-composed from the commish's picks (see
 * bowl-narrative.ts), with brackets filled in for anything not resolvable yet
 * (no pick made, game not played). The 5 free "<Detail>" fields default to
 * that literal placeholder unless `details` is passed, so regenerating the
 * mechanical parts (scores, standings, bowl-game text) after a pick save
 * never loses commentary the commish already wrote.
 */
export function buildWeeklyRecapModel({
  data,
  ledger,
  playerNames,
  bowlResultLine,
  honorableResultLine,
  upcomingBowlLines,
  upcomingHonorableLines,
  details = DEFAULT_DETAILS,
}: {
  data: WeekRecapData;
  ledger: PayoutLedger;
  /** Resolved names for the high scorer's top starters — see findWeekTopStarters. */
  playerNames: Record<string, string>;
  bowlResultLine: string;
  honorableResultLine: string;
  upcomingBowlLines: string[];
  upcomingHonorableLines: string[];
  details?: RecapDetails;
}): RecapModel {
  const week = data.week;
  const summary = summarizeWeek(ledger, week);

  let highScorer: string;
  if (summary?.highScorer) {
    const hs = summary.highScorer;
    const leaders = findWeekTopStarters(hs.rosterId, data.games);
    const leaderNames = leaders.map((l) => playerNames[l.playerId] ?? "[player]");
    const leaderText =
      leaderNames.length === 2
        ? `${leaderNames[0]} and ${leaderNames[1]}`
        : leaderNames.length === 1
          ? `${leaderNames[0]} and [player]`
          : "[player] and [player]";
    highScorer = `📈 ${hs.name} outperformed the league this week! He scored a whopping ${formatPoints(hs.points)}! The team was led by ${leaderText}! Congrats to ${hs.name}!`;
  } else {
    highScorer =
      "📈 [highest scoring team] outperformed the league this week! He scored a whopping [points of the highest scoring team]! The team was led by [player] and [player]! Congrats to [highest scoring team]!";
  }

  const winners: string[] = [];
  if (summary && summary.winners.length > 0) {
    for (const w of summary.winners) {
      const isHigh = summary.highScorer?.rosterId === w.rosterId;
      winners.push(`${isHigh ? "🔹" : "▫️"}${w.name}`);
    }
  } else {
    winners.push(
      "🔹[highest scoring team]",
      "▫️[2nd highest scoring winning team]",
      "▫️[3rd highest scoring winning team]",
      "▫️[4th highest scoring winning team]",
      "▫️[5th highest scoring winning team]"
    );
  }

  const lastWeek: string[] = [];
  if (summary) {
    for (const row of summary.scoreboard) {
      lastWeek.push(row.name, `${formatPoints(row.points)} ${row.won ? "✅" : "❌"}`);
    }
  } else {
    lastWeek.push("[team 1]", "[team 1 points] [✅ for a win, ❌ for a loss]");
  }

  const standingsRows = standingsThroughWeek(ledger, week);
  const standings =
    standingsRows.length > 0
      ? standingsRows.map((row) => `$${row.amount} ${row.name}`)
      : ["[most profitable team profit so far] [most profitable team name]"];

  return {
    title: `🚨📋 Week ${week} Recap`,
    bowlResult: bowlResultLine,
    bowlDetail: details.bowlResult,
    honorableResult: honorableResultLine,
    honorableDetail: details.honorableResult,
    highScorer,
    highScorerDetail: details.highScorer,
    winners: winners.join("\n"),
    lastWeek: lastWeek.join("\n"),
    standings: standings.join("\n"),
    upcomingWeek: week + 1,
    upcomingBowlLines: upcomingBowlLines.join("\n"),
    upcomingBowlDetail: details.upcomingBowl,
    upcomingHonorableLines: upcomingHonorableLines.join("\n"),
    upcomingHonorableDetail: details.upcomingHonorable,
  };
}

/** Flattens a weekly recap model into the exact text that gets saved/copied/posted. */
export function formatCommishRecap(args: Parameters<typeof buildWeeklyRecapModel>[0]): string {
  return joinRecapModel(buildWeeklyRecapModel(args));
}

/**
 * The same house-style shape as buildWeeklyRecapModel, for the Preseason
 * write-up — there's no season data yet, so every section but the "UPCOMING
 * WEEK 1" preview is a fixed placeholder. Lets the commish set up Week 1's
 * marquee matchup during the offseason, which then resolves into a real
 * result once Week 1 is played.
 */
export function buildPreseasonRecapModel({
  leagueName,
  season,
  upcomingBowlLines,
  upcomingHonorableLines,
  details = DEFAULT_DETAILS,
}: {
  leagueName: string;
  season: string;
  upcomingBowlLines: string[];
  upcomingHonorableLines: string[];
  details?: RecapDetails;
}): RecapModel {
  return {
    title: `🚨📋 ${leagueName} — ${season} Preseason`,
    bowlResult: "👑 [team] won the [bowl game name]! Congrats to [team]!",
    bowlDetail: details.bowlResult,
    honorableResult: "🏆 [team] won the [bowl game name]! Congrats to [team]!",
    honorableDetail: details.honorableResult,
    highScorer:
      "📈 [highest scoring team] outperformed the league this week! He scored a whopping [points of the highest scoring team]! The team was led by [player] and [player]! Congrats to [highest scoring team]!",
    highScorerDetail: details.highScorer,
    winners: [
      "🔹[highest scoring team]",
      "▫️[2nd highest scoring winning team]",
      "▫️[3rd highest scoring winning team]",
      "▫️[4th highest scoring winning team]",
      "▫️[5th highest scoring winning team]",
    ].join("\n"),
    lastWeek: ["[team 1]", "[team 1 points] [✅ for a win, ❌ for a loss]"].join("\n"),
    standings: "[most profitable team profit so far] [most profitable team name]",
    upcomingWeek: 1,
    upcomingBowlLines: upcomingBowlLines.join("\n"),
    upcomingBowlDetail: details.upcomingBowl,
    upcomingHonorableLines: upcomingHonorableLines.join("\n"),
    upcomingHonorableDetail: details.upcomingHonorable,
  };
}

/** Flattens a preseason recap model into the exact text that gets saved/copied/posted. */
export function formatPreseasonTemplate(args: Parameters<typeof buildPreseasonRecapModel>[0]): string {
  return joinRecapModel(buildPreseasonRecapModel(args));
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

export { RECAP_HEADERS, WHO_WILL_PREVAIL, GOOD_LUCK_TO_ALL } from "./recap-model";
export type { RecapModel } from "./recap-model";
