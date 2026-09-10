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
import { drawRecapGraphic, DecidedMatchup, PreviewMatchup, MatchupTeam } from "@/lib/recap-graphic";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
import { recapDisplayFont } from "@/lib/fonts";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { appendWriteupToDoc, DOCS_SCOPE } from "@/lib/google-docs";

/** A team's name/logo for the recap graphic — resolveBowlMatchup/resolveBowlMatchupPreview's roster ids still need looked up before they're usable as a MatchupTeam. */
function teamFor(teams: Record<number, { name: string; avatar: string | null }>, rosterId: number): MatchupTeam {
  const team = teams[rosterId];
  return { name: team?.name ?? "?", avatarUrl: team?.avatar ?? null };
}

function decidedMatchupFor(
  teams: Record<number, { name: string; avatar: string | null }>,
  result: BowlMatchupResult | null
): DecidedMatchup | null {
  if (!result) return null;
  return {
    bowlName: result.bowlName,
    winner: teamFor(teams, result.winnerRosterId),
    loser: teamFor(teams, result.loserRosterId),
  };
}

function previewMatchupFor(
  teams: Record<number, { name: string; avatar: string | null }>,
  preview: BowlMatchupPreview | null
): PreviewMatchup | null {
  if (!preview) return null;
  const [aId, bId] = preview.rosterIds;
  return { bowlName: preview.bowlName, teamA: teamFor(teams, aId), teamB: teamFor(teams, bId) };
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
  /** Roster id -> team name/logo, for turning the matchups above into the graphic's MatchupTeam shape. */
  teams: Record<number, { name: string; avatar: string | null }>;
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
