"use client";

// Every action the recap write-up supports — copy as text, copy as a
// graphic, save to the archive, save to the commish's Google Doc — as one
// hook so the toolbar (now pinned at the top of the page, see recap/page.tsx)
// and the section editor can share the exact same state without either
// owning it. Previously lived inside RecapEditor itself; pulled out once the
// buttons needed to render somewhere else in the tree entirely.

import { useState } from "react";
import { saveRecap } from "@/lib/localStore";
import { RecapModel, joinRecapModel } from "@/lib/recap-model";
import {
  drawRecapGraphic,
  DecidedMatchup,
  PreviewMatchup,
  MatchupTeam,
  HighScorerGraphicData,
  WinnerGraphicRow,
  StandingsGraphicRow,
  RecapGraphicExtras,
} from "@/lib/recap-graphic";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
import { recapDisplayFont } from "@/lib/fonts";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { appendWriteupToDoc, DOCS_SCOPE } from "@/lib/google-docs";
import { WeekRecapData } from "@/lib/league-data";
import { PayoutLedger, summarizeWeek, standingsThroughWeek } from "@/lib/payouts";
import { findWeekTopStarters } from "@/lib/format-recap";
import { formatPoints } from "@/lib/format";
import { playerHeadshotUrlForCanvas } from "@/lib/sleeper";

type GraphicTeam = { name: string; avatar: string | null; username: string };

/** A team's name/logo for the recap graphic — resolveBowlMatchup/resolveBowlMatchupPreview's roster ids still need looked up before they're usable as a MatchupTeam. */
function teamFor(teams: Record<number, GraphicTeam>, rosterId: number): MatchupTeam {
  const team = teams[rosterId];
  return { name: team?.name ?? "?", avatarUrl: team?.avatar ?? null };
}

function decidedMatchupFor(teams: Record<number, GraphicTeam>, result: BowlMatchupResult | null): DecidedMatchup | null {
  if (!result) return null;
  return {
    bowlName: result.bowlName,
    winner: teamFor(teams, result.winnerRosterId),
    loser: teamFor(teams, result.loserRosterId),
  };
}

function previewMatchupFor(teams: Record<number, GraphicTeam>, preview: BowlMatchupPreview | null): PreviewMatchup | null {
  if (!preview) return null;
  const [aId, bId] = preview.rosterIds;
  return { bowlName: preview.bowlName, teamA: teamFor(teams, aId), teamB: teamFor(teams, bId) };
}

/** Every team's margin of victory this week, by roster id — the "+12.34" under each Winners row — read straight off the actual matchup pairs rather than derived from the money ledger, which only knows who won and by how much they got paid, not the score gap. */
function marginsByRoster(recapData: WeekRecapData): Map<number, number> {
  const margins = new Map<number, number>();
  for (const game of recapData.games) {
    if (game.teams.length !== 2) continue;
    const [a, b] = game.teams;
    margins.set(a.rosterId, a.points - b.points);
    margins.set(b.rosterId, b.points - a.points);
  }
  return margins;
}

/** The Winners section's live rows for the graphic — the week's high scorer first (they're always among the winners, since scoring the league's single highest total means winning your own matchup), then up to 4 more, by username with their margin of victory. Null when there's nothing resolved yet (nothing played, or every matchup tied), so the graphic falls back to the flat text's own bracket placeholders. */
function winnersForGraphic(recapData: WeekRecapData | null, ledger: PayoutLedger | null, week: number, teams: Record<number, GraphicTeam>): WinnerGraphicRow[] | null {
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

/** The High Scorer section's live data for the graphic — the top-3-scoring teams and the winning team's top 3 players (headshots via Sleeper's CDN). Null when nothing's been played yet, so the graphic falls back to its bracket placeholders. */
function highScorerForGraphic(
  recapData: WeekRecapData | null,
  ledger: PayoutLedger | null,
  week: number,
  teams: Record<number, GraphicTeam>,
  playerNames: Record<string, string>,
  sentence: string,
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
  return {
    team: teamFrom(top3[0]),
    points: formatPoints(top3[0].points),
    runnersUp: top3.slice(1).map((row) => ({ team: teamFrom(row), points: formatPoints(row.points) })),
    topPlayers: players,
    sentence,
    detail,
  };
}

/** The Last Week Results section's live rows for the graphic — every team that played, by team name (not the ledger's real-person manager name, which is what the flattened text's own Last Week block is built from). Null when nothing's been played yet, so the graphic falls back to parsing that flattened text. */
function lastWeekForGraphic(
  recapData: WeekRecapData | null,
  ledger: PayoutLedger | null,
  week: number,
  teams: Record<number, GraphicTeam>
): RecapGraphicExtras["lastWeek"] {
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

/** The Updated Standings section's live rows for the graphic — running earnings through this write-up's own week, by username. Null when there's no ledger data yet (preseason), so the graphic falls back to its bracket placeholder. */
function standingsForGraphic(
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

export interface RecapActionsArgs {
  leagueId: string;
  season: string;
  week: number;
  title: string;
  model: RecapModel | null;
  plainBody: string;
  savedAt: string | null;
  writeupDocId?: string;
  /** Resolved via resolveGoogleClientId() — empty when Google Docs isn't connected, in which case Save to Doc stays hidden. */
  googleClientId: string;
  /** This week's decided Bowl of the Week / Honorable Mention picks, and next week's still-undecided marquee pick — feed the recap graphic's poster cards. Null wherever there's no resolvable pick yet. */
  bowlMatchup: BowlMatchupResult | null;
  honorableMatchup: BowlMatchupResult | null;
  upcomingMatchup: BowlMatchupPreview | null;
  upcomingHonorableMatchup: BowlMatchupPreview | null;
  /** Roster id -> team name/logo/username, for turning the matchups above into the graphic's MatchupTeam shape, and for the Winners/Standings sections' usernames. */
  teams: Record<number, GraphicTeam>;
  /** This write-up's own week's matchup data and money ledger — feeds the graphic's High Scorer podium, Winners margins, and Updated Standings, the same live data the on-screen sections already show (see RecapSectionsEditor). Null in preseason or before it's loaded. */
  recapData: WeekRecapData | null;
  ledger: PayoutLedger | null;
  /** Player id -> display name, for the High Scorer podium's top-3-player photos. */
  playerNames: Record<string, string>;
}

export function useRecapActions(args: RecapActionsArgs) {
  const [copied, setCopied] = useState(false);
  const [graphicStatus, setGraphicStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [graphicError, setGraphicError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState(args.savedAt);
  const [docStatus, setDocStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [docError, setDocError] = useState<string | null>(null);

  // A new week's own recap is a clean slate for every action's status — this
  // hook lives in the page component now (see recap/page.tsx), which doesn't
  // remount on a week change the way the old keyed <RecapEditor> did. Reset
  // during render (not an effect) per React's "adjusting state when a prop
  // changes" pattern, so it lands in the same commit as the week switch
  // instead of causing an extra cascading render.
  const weekKey = `${args.leagueId}-${args.week}`;
  const [resetKey, setResetKey] = useState(weekKey);
  if (resetKey !== weekKey) {
    setResetKey(weekKey);
    setLastSavedAt(args.savedAt);
    setCopied(false);
    setGraphicStatus("idle");
    setGraphicError(null);
    setDocStatus("idle");
    setDocError(null);
  }

  // The exact text that gets saved, copied, and posted — reassembled from the
  // header boxes on every render, so copying is always exactly what's on
  // screen, headers (and inclusions) included, never a stale or
  // hand-diverged version.
  const body = args.model ? joinRecapModel(args.model) : args.plainBody;

  async function handleCopy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /** Renders the write-up and its stats as a single image (see recap-graphic.ts)
   * and copies that image to the clipboard, ready to paste into a group chat or
   * post — a shareable graphic instead of formatted text. */
  async function handleCopyGraphic() {
    setGraphicStatus("copying");
    setGraphicError(null);
    try {
      const canvas = document.createElement("canvas");
      const avatarByName: Record<string, string | null> = {};
      for (const t of Object.values(args.teams)) avatarByName[t.name] = t.avatar;
      await drawRecapGraphic(canvas, body, args.model, {
        bowl: decidedMatchupFor(args.teams, args.bowlMatchup),
        honorable: decidedMatchupFor(args.teams, args.honorableMatchup),
        upcoming: previewMatchupFor(args.teams, args.upcomingMatchup),
        upcomingHonorable: previewMatchupFor(args.teams, args.upcomingHonorableMatchup),
        highScorer: highScorerForGraphic(
          args.recapData,
          args.ledger,
          args.week,
          args.teams,
          args.playerNames,
          args.model?.highScorer ?? "",
          args.model?.highScorerDetail ?? ""
        ),
        winners: winnersForGraphic(args.recapData, args.ledger, args.week, args.teams),
        lastWeek: lastWeekForGraphic(args.recapData, args.ledger, args.week, args.teams),
        standings: standingsForGraphic(args.recapData, args.ledger, args.week, args.teams),
        avatarByName,
        displayFontFamily: recapDisplayFont.style.fontFamily,
        include: args.model?.include,
      });
      // Passed as a Promise (not awaited first) rather than an already-resolved
      // Blob — Safari ties clipboard-write permission to the triggering click,
      // and only accepts that if ClipboardItem gets the still-pending promise.
      const blobPromise = new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Couldn't render the graphic."));
        }, "image/png");
      });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
      setGraphicStatus("copied");
      setTimeout(() => setGraphicStatus("idle"), 2000);
    } catch (err) {
      setGraphicStatus("error");
      setGraphicError(err instanceof Error ? err.message : "Couldn't copy the graphic.");
    }
  }

  function handleSave() {
    const now = new Date().toISOString();
    saveRecap({
      leagueId: args.leagueId,
      season: args.season,
      week: args.week,
      title: args.title,
      body,
      model: args.model ?? undefined,
      savedAt: now,
    });
    setLastSavedAt(now);
  }

  /** Appends the write-up currently shown to the commish's Google Doc — whatever's been hand-edited, not the auto-generated draft. Prompts a Google sign-in popup the first time (or once the cached token expires). */
  async function handleSaveToDoc() {
    if (!args.writeupDocId || !args.googleClientId) return;
    setDocStatus("saving");
    setDocError(null);
    try {
      const accessToken = await getGoogleAccessToken(args.googleClientId, DOCS_SCOPE);
      // week 0 is the preseason sentinel (see recap/page.tsx) — that write-up
      // has no week tab of its own, so it saves straight into the season tab.
      await appendWriteupToDoc(args.writeupDocId, body, accessToken, args.season, args.week === 0 ? null : args.week);
      setDocStatus("saved");
      setTimeout(() => setDocStatus("idle"), 2500);
    } catch (err) {
      setDocStatus("error");
      setDocError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return {
    body,
    copied,
    graphicStatus,
    graphicError,
    docStatus,
    docError,
    lastSavedAt,
    handleCopy,
    handleCopyGraphic,
    handleSave,
    handleSaveToDoc,
  };
}
