import { WeekRecapData, MatchupGame } from "./league-data";
import { PayoutLedger, summarizeWeek, standingsThroughWeek } from "./payouts";
import { formatPoints, ordinal } from "./format";

/** The high-scoring team's own top-scoring starter — who "led the scoring" for that team this week. */
export function findWeekTopStarter(
  rosterId: number,
  games: MatchupGame[]
): { playerId: string; points: number } | null {
  const team = games.flatMap((g) => g.teams).find((t) => t.rosterId === rosterId);
  if (!team) return null;
  let leaderId: string | null = null;
  let leaderPoints = -Infinity;
  for (const id of team.starterIds) {
    const pts = team.playersPoints[id];
    if (pts != null && pts > leaderPoints) {
      leaderPoints = pts;
      leaderId = id;
    }
  }
  return leaderId ? { playerId: leaderId, points: leaderPoints } : null;
}

/**
 * Weekly recap in the house style of the Dynasty Write-ups doc: emoji section
 * headers, the high-score callout, the commission list with the high scorer
 * flagged, a full scoreboard with check marks, and the running money standings.
 *
 * Everything here is mechanical and derived from Sleeper — including, now, the
 * "Matchup of the Week" narrative blocks, built from the commish's bowl-game
 * picks (see bowl-narrative.ts) and passed in pre-composed, with brackets
 * filled in for anything not resolvable yet (no pick made, game not played).
 */
export function formatCommishRecap({
  data,
  ledger,
  playerNames,
  matchupResultBlock,
  bowlOfWeekBlock,
  honorableMentionBlock,
}: {
  data: WeekRecapData;
  ledger: PayoutLedger;
  /** Resolved names for the high scorer's top starter — see findWeekTopStarter. */
  playerNames: Record<string, string>;
  matchupResultBlock: string;
  bowlOfWeekBlock: string;
  honorableMentionBlock: string;
}): string {
  const week = data.week;
  const summary = summarizeWeek(ledger, week);
  const lines: string[] = [];

  lines.push(`🚨🏈 Week ${week} Recap`);
  lines.push("");

  if (summary?.highScorer) {
    const hs = summary.highScorer;
    const leader = findWeekTopStarter(hs.rosterId, data.games);
    const leaderText = leader
      ? `${playerNames[leader.playerId] ?? "[player]"}, who put up ${formatPoints(leader.points)} points`
      : "[player]";
    lines.push(
      `📈 ${hs.name} was the highest scoring team this week with ${formatPoints(hs.points)} points! The scoring was led by ${leaderText}.`
    );
    lines.push("");
  }

  lines.push(matchupResultBlock);
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

  lines.push(bowlOfWeekBlock);
  lines.push("");
  lines.push(honorableMentionBlock);
  lines.push("");

  return lines.join("\n");
}

// Lines starting with one of these get bolded as a section header when copying
// formatted; 📈 gets underlined instead (see buildRecapClipboardHtml) since it's
// the standout stat callout, not a section boundary.
const BOLD_HEADER_EMOJIS = ["🚨🏈", "🏆", "🤝", "👁️", "💰", "🔥", "🥈"];
// Headers whose very next (non-blank) line is prose worth setting off in italics,
// rather than another list/data line.
const NARRATIVE_HEADER_EMOJIS = ["🏆", "🔥", "🥈"];

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Rich-text (HTML) rendering of a recap body for copying into apps that keep
 * formatting on paste — Messages and Notes on Mac, Mail, and similar — so it
 * reads as headers and callouts instead of one flat block of plain text.
 * Bolds each section header and dollar amount, underlines the high-scorer
 * line, and italicizes the narrative line right under a Matchup of the Week
 * header. Pair with a plain-text fallback for paste targets that don't keep
 * rich content (see RecapEditor's copy-formatted handler).
 */
export function buildRecapClipboardHtml(body: string): string {
  let previousWasNarrativeHeader = false;
  return body
    .split("\n")
    .map((rawLine) => {
      const withMoneyBold = escapeHtml(rawLine).replace(/\$\d+(\.\d+)?/g, (m) => `<b>${m}</b>`);
      const isNarrativeHeader = NARRATIVE_HEADER_EMOJIS.some((e) => rawLine.startsWith(e));
      let html: string;
      if (rawLine.startsWith("📈")) {
        html = `<u>${withMoneyBold}</u>`;
      } else if (BOLD_HEADER_EMOJIS.some((e) => rawLine.startsWith(e))) {
        html = `<b>${withMoneyBold}</b>`;
      } else if (previousWasNarrativeHeader && rawLine.trim()) {
        html = `<i>${withMoneyBold}</i>`;
      } else {
        html = withMoneyBold;
      }
      previousWasNarrativeHeader = isNarrativeHeader;
      return html;
    })
    .join("<br>");
}

// The three "Matchup of the Week" narrative blocks in formatCommishRecap() —
// now auto-composed from bowl-game picks (see bowl-narrative.ts) rather than
// hand-typed, identified by their fixed emoji header for block-splicing below.
const BOWL_SECTION_HEADERS = [
  "🏆 Matchup of the Week result:",
  "🔥 Matchup of the Week:",
  "🥈 Honorable Mention:",
];

/** Swaps blank-line-separated blocks in `baseBody` for the block with the same header from `replacementBody`, wherever `headers` matches. Blocks with no matching header (or no match found in the replacement) are left untouched. */
function spliceBlocksByHeader(baseBody: string, replacementBody: string, headers: string[]): string {
  const replacementBlocks = replacementBody.split(/\n\n+/);
  return baseBody
    .split(/\n\n+/)
    .map((block) => {
      const header = headers.find((h) => block.startsWith(h));
      if (!header) return block;
      return replacementBlocks.find((b) => b.startsWith(header)) ?? block;
    })
    .join("\n\n");
}

/**
 * Starts from this week's freshly generated recap (title, scoreboard, standings,
 * money — all mechanical) and swaps in last week's saved narrative blocks as a
 * starting draft, so last week's write-up carries forward as a reminder of what
 * changed, while everything that can be computed is already current.
 */
export function carryForwardRecapTemplate(previousBody: string, freshTemplate: string): string {
  return spliceBlocksByHeader(freshTemplate, previousBody, BOWL_SECTION_HEADERS);
}

/**
 * Re-runs just the "Matchup of the Week" auto-text into the currently-edited
 * body (e.g. right after the commish saves/changes a bowl-game pick), without
 * touching anything else they've already typed.
 */
export function refreshBowlSections(currentBody: string, regeneratedTemplate: string): string {
  return spliceBlocksByHeader(currentBody, regeneratedTemplate, BOWL_SECTION_HEADERS);
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
