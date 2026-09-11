// Pure data-building functions shared by the canvas recap graphic
// (recap-graphic.ts, via useRecapActions.ts) and the on-screen write-up
// editor's live section displays (RecapSectionsEditor.tsx) — one source for
// "what does the High Scorer podium/Winners row/Last Week table/Standings
// stack actually show," so the picture you copy and the boxes you edit
// against can never quietly disagree about who's leading, who's winning
// money, or by how much. Previously lived only inside useRecapActions.ts,
// where only the canvas renderer could reach them.

import { DecidedMatchup, PreviewMatchup, MatchupTeam, HighScorerGraphicData, WinnerGraphicRow, StandingsGraphicRow } from "./recap-graphic";
import { BowlMatchupResult, BowlMatchupPreview } from "./bowl-narrative";
import { WeekRecapData } from "./league-data";
import { PayoutLedger, summarizeWeek, standingsThroughWeek } from "./payouts";
import { findWeekTopStarters, joinLeaderNames } from "./format-recap";
import { formatPoints } from "./format";
import { playerHeadshotUrlForCanvas } from "./sleeper";

export type GraphicTeam = { name: string; avatar: string | null; username: string };

/** A team's name/logo for the recap graphic — resolveBowlMatchup/resolveBowlMatchupPreview's roster ids still need looked up before they're usable as a MatchupTeam. */
export function teamFor(teams: Record<number, GraphicTeam>, rosterId: number): MatchupTeam {
  const team = teams[rosterId];
  return { name: team?.name ?? "?", avatarUrl: team?.avatar ?? null };
}

export function decidedMatchupFor(teams: Record<number, GraphicTeam>, result: BowlMatchupResult | null): DecidedMatchup | null {
  if (!result) return null;
  return {
    bowlName: result.bowlName,
    winner: teamFor(teams, result.winnerRosterId),
    loser: teamFor(teams, result.loserRosterId),
  };
}

export function previewMatchupFor(teams: Record<number, GraphicTeam>, preview: BowlMatchupPreview | null): PreviewMatchup | null {
  if (!preview) return null;
  const [aId, bId] = preview.rosterIds;
  return { bowlName: preview.bowlName, teamA: teamFor(teams, aId), teamB: teamFor(teams, bId) };
}

/** Every team's margin of victory this week, by roster id — the "+12.34" under each Winners row — read straight off the actual matchup pairs rather than derived from the money ledger, which only knows who won and by how much they got paid, not the score gap. */
export function marginsByRoster(recapData: WeekRecapData): Map<number, number> {
  const margins = new Map<number, number>();
  for (const game of recapData.games) {
    if (game.teams.length !== 2) continue;
    const [a, b] = game.teams;
    margins.set(a.rosterId, a.points - b.points);
    margins.set(b.rosterId, b.points - a.points);
  }
  return margins;
}

/** The Winners section's live rows — the week's high scorer first (they're always among the winners, since scoring the league's single highest total means winning your own matchup), then up to 4 more, by username with their margin of victory. Null when there's nothing resolved yet (nothing played, or every matchup tied). */
export function winnersForGraphic(
  recapData: WeekRecapData | null,
  ledger: PayoutLedger | null,
  week: number,
  teams: Record<number, GraphicTeam>
): WinnerGraphicRow[] | null {
  if (!recapData || !ledger) return null;
  const summary = summarizeWeek(ledger, week);
  if (!summary || summary.winners.length === 0) return null;
  const margins = marginsByRoster(recapData);
  return summary.winners.slice(0, 5).map((w) => ({
    name: teams[w.rosterId]?.username ?? w.name,
    avatarUrl: teams[w.rosterId]?.avatar ?? null,
    amountLabel: `$${w.payout}`,
    marginLabel: `+${formatPoints(margins.get(w.rosterId) ?? 0)}`,
    highlight: summary.highScorer?.rosterId === w.rosterId,
  }));
}

/**
 * The High Scorer section's live data — the top-3-scoring teams and the
 * winning team's top 3 players (headshots via Sleeper's CDN). `sentence` is
 * built fresh from this same live data (same template format-recap.ts uses
 * for the write-up's own auto-generated line, minus its leading emoji —
 * callers that show a section header already carry their own), rather than
 * read back from the write-up's own saved (and possibly stale, if scores
 * changed since that text was generated/last edited) text, so it can never
 * drift from what the podium itself shows. Null when nothing's been played
 * yet.
 */
export function highScorerForGraphic(
  recapData: WeekRecapData | null,
  ledger: PayoutLedger | null,
  week: number,
  teams: Record<number, GraphicTeam>,
  playerNames: Record<string, string>,
  detail: string
): HighScorerGraphicData | null {
  if (!recapData || !ledger) return null;
  const summary = summarizeWeek(ledger, week);
  if (!summary?.highScorer) return null;
  const top3 = summary.scoreboard.slice(0, 3);
  const teamFrom = (row: { rosterId: number; name: string }): MatchupTeam => ({
    name: teams[row.rosterId]?.name ?? row.name,
    avatarUrl: teams[row.rosterId]?.avatar ?? null,
  });
  const players = findWeekTopStarters(summary.highScorer.rosterId, recapData.games, 3).map((l) => ({
    name: playerNames[l.playerId] ?? "Unknown Player",
    points: formatPoints(l.points),
    photoUrl: playerHeadshotUrlForCanvas(l.playerId),
  }));
  const winnerName = teamFrom(top3[0]).name;
  const sentence = `${winnerName} outperformed the league this week! He scored a whopping ${formatPoints(top3[0].points)}! The team was led by ${joinLeaderNames(players.map((p) => p.name))}! Congrats to ${winnerName}!`;
  return {
    team: teamFrom(top3[0]),
    points: formatPoints(top3[0].points),
    runnersUp: top3.slice(1).map((row) => ({ team: teamFrom(row), points: formatPoints(row.points) })),
    topPlayers: players,
    sentence,
    detail,
  };
}

/** The Last Week Results section's live rows — every team that played, by team name (not the ledger's real-person manager name, which is what the flattened write-up text's own Last Week block is built from). Null when nothing's been played yet. */
export function lastWeekForGraphic(
  recapData: WeekRecapData | null,
  ledger: PayoutLedger | null,
  week: number,
  teams: Record<number, GraphicTeam>
): { name: string; pointsLabel: string; points: number; won: boolean; resolved: boolean }[] | null {
  if (!recapData || !ledger) return null;
  const summary = summarizeWeek(ledger, week);
  if (!summary || summary.scoreboard.length === 0) return null;
  return summary.scoreboard.map((row) => ({
    name: teams[row.rosterId]?.name ?? row.name,
    pointsLabel: formatPoints(row.points),
    points: row.points,
    won: row.won,
    resolved: true,
  }));
}

/** The Updated Standings section's live rows — running earnings through this write-up's own week, by username. Null when there's no ledger data yet (preseason). */
export function standingsForGraphic(
  recapData: WeekRecapData | null,
  ledger: PayoutLedger | null,
  week: number,
  teams: Record<number, GraphicTeam>
): StandingsGraphicRow[] | null {
  if (!recapData || !ledger) return null;
  const rows = standingsThroughWeek(ledger, week);
  if (rows.length === 0) return null;
  return rows.map((r) => ({
    name: teams[r.rosterId]?.username ?? r.name,
    avatarUrl: teams[r.rosterId]?.avatar ?? null,
    amount: r.amount,
    amountLabel: `$${r.amount}`,
  }));
}
