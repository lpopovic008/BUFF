import { WeekRecapData, MatchupGame } from "./league-data";
import { PayoutLedger, summarizeWeek, standingsThroughWeek } from "./payouts";
import { formatPoints, ordinal } from "./format";

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
 * Recovers whatever's currently written in each of the recap's 5 free-write
 * "<Detail>" slots from a previously generated/saved body, by finding each
 * slot's known fixed anchor (the emoji line above it, or the fixed line
 * below it) and capturing the paragraph next to that anchor. Used so
 * regenerating the mechanical parts (scores, standings, bowl-game text)
 * after a pick save never loses commentary the commish already wrote.
 */
export function extractRecapDetails(body: string): RecapDetails {
  const lines = body.split("\n");
  const details: RecapDetails = { ...DEFAULT_DETAILS };

  const indexOfLine = (predicate: (line: string) => boolean): number => lines.findIndex(predicate);

  function captureForward(afterIndex: number): string {
    const collected: string[] = [];
    let i = afterIndex + 1;
    while (i < lines.length && lines[i].trim() !== "") {
      collected.push(lines[i]);
      i++;
    }
    const text = collected.join("\n").trim();
    return text || DETAIL_PLACEHOLDER;
  }

  function captureBackwardFrom(markerIndex: number): string {
    let end = markerIndex - 1;
    while (end >= 0 && lines[end].trim() === "") end--;
    let begin = end;
    while (begin - 1 >= 0 && lines[begin - 1].trim() !== "") begin--;
    if (end < 0) return DETAIL_PLACEHOLDER;
    const text = lines.slice(begin, end + 1).join("\n").trim();
    return text || DETAIL_PLACEHOLDER;
  }

  const crownIdx = indexOfLine((l) => l.startsWith("👑"));
  if (crownIdx !== -1) details.bowlResult = captureForward(crownIdx);

  const trophyIdx = indexOfLine((l) => l.startsWith("🏆"));
  if (trophyIdx !== -1) details.honorableResult = captureForward(trophyIdx);

  const chartIdx = indexOfLine((l) => l.startsWith("📈"));
  if (chartIdx !== -1) details.highScorer = captureForward(chartIdx);

  const prevailIdx = indexOfLine((l) => l.trim() === "WHO WILL PREVAIL?!");
  if (prevailIdx !== -1) details.upcomingBowl = captureBackwardFrom(prevailIdx);

  const goodLuckIdx = indexOfLine((l) => l.trim() === "Good Luck to All!");
  if (goodLuckIdx !== -1) details.upcomingHonorable = captureBackwardFrom(goodLuckIdx);

  return details;
}

/**
 * Weekly recap in the house style of the Dynasty Write-ups doc: emoji section
 * headers, a highest-scoring-team callout, the commission list, a full
 * scoreboard, running money standings, and a preview of next week's marquee
 * matchup(s). The bowl-game result/preview lines are pre-composed from the
 * commish's picks (see bowl-narrative.ts), with brackets filled in for
 * anything not resolvable yet (no pick made, game not played). The 5 free
 * "<Detail>" lines default to that literal placeholder unless `details` is
 * passed (see extractRecapDetails), so regenerating after a pick save never
 * loses commentary already written.
 */
export function formatCommishRecap({
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
}): string {
  const week = data.week;
  const summary = summarizeWeek(ledger, week);
  const lines: string[] = [];

  lines.push(`🚨📋 Week ${week} Recap`);
  lines.push("");

  lines.push(bowlResultLine);
  lines.push(details.bowlResult);
  lines.push("");

  lines.push(honorableResultLine);
  lines.push(details.honorableResult);
  lines.push("");

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
    lines.push(
      `📈 ${hs.name} outperformed the league this week! He scored a whopping ${formatPoints(hs.points)}! The team was led by ${leaderText}! Congrats to ${hs.name}!`
    );
  } else {
    lines.push(
      "📈 [highest scoring team] outperformed the league this week! He scored a whopping [points of the highest scoring team]! The team was led by [player] and [player]! Congrats to [highest scoring team]!"
    );
  }
  lines.push(details.highScorer);
  lines.push("");

  lines.push("🤑 Winners this week who will receive commission:");
  if (summary && summary.winners.length > 0) {
    for (const w of summary.winners) {
      const isHigh = summary.highScorer?.rosterId === w.rosterId;
      lines.push(`${isHigh ? "🔹" : "▫️"}${w.name}`);
    }
  } else {
    lines.push("🔹[highest scoring team]");
    lines.push("▫️[2nd highest scoring winning team]");
    lines.push("▫️[3rd highest scoring winning team]");
    lines.push("▫️[4th highest scoring winning team]");
    lines.push("▫️[5th highest scoring winning team]");
  }
  lines.push("");

  lines.push("🗓️Last week Results:");
  if (summary) {
    for (const row of summary.scoreboard) {
      lines.push(row.name);
      lines.push(`${formatPoints(row.points)} ${row.won ? "✅" : "❌"}`);
    }
  } else {
    lines.push("[team 1]");
    lines.push("[team 1 points] [✅ for a win, ❌ for a loss]");
  }
  lines.push("");

  lines.push("💰 Updated Standings:");
  const standings = standingsThroughWeek(ledger, week);
  if (standings.length > 0) {
    for (const row of standings) {
      lines.push(`$${row.amount} ${row.name}`);
    }
  } else {
    lines.push("[most profitable team profit so far] [most profitable team name]");
  }
  lines.push("");

  lines.push(`UPCOMING WEEK ${week + 1}:`);
  lines.push("");

  lines.push("🥇 Matchup of the Week:");
  for (const line of upcomingBowlLines) lines.push(line);
  lines.push("");
  lines.push(details.upcomingBowl);
  lines.push("WHO WILL PREVAIL?!");
  lines.push("");

  lines.push("🥈Honorable Mention:");
  for (const line of upcomingHonorableLines) lines.push(line);
  lines.push("");
  lines.push(details.upcomingHonorable);
  lines.push("Good Luck to All!");

  return lines.join("\n");
}

/**
 * The same house-style shape as formatCommishRecap, for the Preseason write-up —
 * there's no season data yet, so every section but the "UPCOMING WEEK 1" preview
 * is a fixed placeholder. Lets the commish set up Week 1's marquee matchup during
 * the offseason, which then resolves into a real result once Week 1 is played.
 */
export function formatPreseasonTemplate({
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
}): string {
  const lines: string[] = [];
  lines.push(`🚨📋 ${leagueName} — ${season} Preseason`);
  lines.push("");

  lines.push("👑 [team] won the [bowl game name]! Congrats to [team]!");
  lines.push(details.bowlResult);
  lines.push("");

  lines.push("🏆 [team] won the [bowl game name]! Congrats to [team]!");
  lines.push(details.honorableResult);
  lines.push("");

  lines.push(
    "📈 [highest scoring team] outperformed the league this week! He scored a whopping [points of the highest scoring team]! The team was led by [player] and [player]! Congrats to [highest scoring team]!"
  );
  lines.push(details.highScorer);
  lines.push("");

  lines.push("🤑 Winners this week who will receive commission:");
  lines.push("🔹[highest scoring team]");
  lines.push("▫️[2nd highest scoring winning team]");
  lines.push("▫️[3rd highest scoring winning team]");
  lines.push("▫️[4th highest scoring winning team]");
  lines.push("▫️[5th highest scoring winning team]");
  lines.push("");

  lines.push("🗓️Last week Results:");
  lines.push("[team 1]");
  lines.push("[team 1 points] [✅ for a win, ❌ for a loss]");
  lines.push("");

  lines.push("💰 Updated Standings:");
  lines.push("[most profitable team profit so far] [most profitable team name]");
  lines.push("");

  lines.push("UPCOMING WEEK 1:");
  lines.push("");

  lines.push("🥇 Matchup of the Week:");
  for (const line of upcomingBowlLines) lines.push(line);
  lines.push("");
  lines.push(details.upcomingBowl);
  lines.push("WHO WILL PREVAIL?!");
  lines.push("");

  lines.push("🥈Honorable Mention:");
  for (const line of upcomingHonorableLines) lines.push(line);
  lines.push("");
  lines.push(details.upcomingHonorable);
  lines.push("Good Luck to All!");

  return lines.join("\n");
}

// Lines starting with one of these get bolded as a section header when copying
// formatted; 📈 gets underlined instead (see buildRecapClipboardHtml) since it's
// the standout stat callout, not a section boundary.
const BOLD_HEADER_EMOJIS = ["🚨📋", "👑", "🏆", "🤑", "🗓️", "💰", "🥇", "🥈"];
const BOLD_FIXED_LINES = new Set(["WHO WILL PREVAIL?!", "Good Luck to All!"]);

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Rich-text (HTML) rendering of a recap body for copying into apps that keep
 * formatting on paste — Messages and Notes on Mac, Mail, and similar — so it
 * reads as headers and callouts instead of one flat block of plain text.
 * Bolds each section header, the "UPCOMING WEEK" banner, dollar amounts, and
 * the two rallying-cry lines; underlines the high-scorer line; italicizes
 * each free "<Detail>"/commentary line. Pair with a plain-text fallback for
 * paste targets that don't keep rich content (see RecapEditor's
 * copy-formatted handler).
 */
export function buildRecapClipboardHtml(body: string): string {
  const rawLines = body.split("\n");
  return rawLines
    .map((rawLine, i) => {
      const trimmed = rawLine.trim();
      const withMoneyBold = escapeHtml(rawLine).replace(/\$\d+(\.\d+)?/g, (m) => `<b>${m}</b>`);
      const previousLine = rawLines[i - 1] ?? "";
      const isDetailLine =
        previousLine.startsWith("👑") || previousLine.startsWith("🏆") || previousLine.startsWith("📈");

      if (rawLine.startsWith("📈")) return `<u>${withMoneyBold}</u>`;
      if (rawLine.startsWith("UPCOMING WEEK") || BOLD_HEADER_EMOJIS.some((e) => rawLine.startsWith(e))) {
        return `<b>${withMoneyBold}</b>`;
      }
      if (BOLD_FIXED_LINES.has(trimmed)) return `<b>${withMoneyBold}</b>`;
      if (isDetailLine && trimmed) return `<i>${withMoneyBold}</i>`;
      return withMoneyBold;
    })
    .join("<br>");
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
