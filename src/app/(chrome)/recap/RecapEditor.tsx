"use client";

import { useState } from "react";
import { saveRecap } from "@/lib/localStore";
import { RecapModel, joinRecapModel } from "@/lib/recap-model";
import { drawRecapGraphic, DecidedMatchup, PreviewMatchup, MatchupTeam } from "@/lib/recap-graphic";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
import { recapDisplayFont } from "@/lib/fonts";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { appendWriteupToDoc, DOCS_SCOPE } from "@/lib/google-docs";
import { IconButton } from "@/components/ui/IconButton";
import { CopyIcon, ImageIcon, SaveIcon, CheckIcon, UploadIcon } from "@/components/ui/Icon";
import { RecapSectionsEditor } from "./RecapSectionsEditor";

/** A team's name/logo for the recap graphic — the piece resolveBowlMatchup/resolveBowlMatchupPreview's roster ids still need looked up before they're usable as a MatchupTeam. */
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

export function RecapEditor({
  leagueId,
  season,
  week,
  title,
  model,
  onModelChange,
  plainBody,
  onPlainBodyChange,
  savedAt,
  writeupDocId,
  googleClientId,
  bowlMatchup,
  honorableMatchup,
  upcomingMatchup,
  teams,
}: {
  leagueId: string;
  season: string;
  week: number;
  title: string;
  /**
   * The structured, header-by-header form of the write-up (see
   * recap-model.ts) — present for leagues with the commissioner house style,
   * where every header gets its own box on screen. Null falls back to a
   * single plain text box (`plainBody`) for leagues without that format, or
   * for a previously-saved recap this shape can't be recovered from.
   */
  model: RecapModel | null;
  onModelChange: (model: RecapModel) => void;
  plainBody: string;
  onPlainBodyChange: (body: string) => void;
  savedAt: string | null;
  writeupDocId?: string;
  /** Resolved via resolveGoogleClientId() — empty when Google Docs isn't connected, in which case Save to Doc stays hidden. */
  googleClientId: string;
  /** This week's decided Bowl of the Week / Honorable Mention picks, and next week's still-undecided marquee pick — feed the recap graphic's poster cards. Null wherever there's no resolvable pick yet. */
  bowlMatchup: BowlMatchupResult | null;
  honorableMatchup: BowlMatchupResult | null;
  upcomingMatchup: BowlMatchupPreview | null;
  /** Roster id -> team name/logo, for turning the matchups above into the graphic's MatchupTeam shape. */
  teams: Record<number, { name: string; avatar: string | null }>;
}) {
  const [copied, setCopied] = useState(false);
  const [graphicStatus, setGraphicStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [graphicError, setGraphicError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState(savedAt);
  const [docStatus, setDocStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [docError, setDocError] = useState<string | null>(null);

  // The exact text that gets saved, copied, and posted — reassembled from the
  // header boxes on every render, so copying is always exactly what's on
  // screen, headers included, never a stale or hand-diverged version.
  const body = model ? joinRecapModel(model) : plainBody;

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
      await drawRecapGraphic(canvas, body, model, {
        bowl: decidedMatchupFor(teams, bowlMatchup),
        honorable: decidedMatchupFor(teams, honorableMatchup),
        upcoming: previewMatchupFor(teams, upcomingMatchup),
        displayFontFamily: recapDisplayFont.style.fontFamily,
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

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    saveRecap({ leagueId, season, week, title, body, model: model ?? undefined, savedAt: now });
    setLastSavedAt(now);
  }

  /** Appends the write-up currently shown to the commish's Google Doc — whatever's been hand-edited, not the auto-generated draft. Prompts a Google sign-in popup the first time (or once the cached token expires). */
  async function handleSaveToDoc() {
    if (!writeupDocId || !googleClientId) return;
    setDocStatus("saving");
    setDocError(null);
    try {
      const accessToken = await getGoogleAccessToken(googleClientId, DOCS_SCOPE);
      // week 0 is the preseason sentinel (see recap/page.tsx) — that write-up
      // has no week tab of its own, so it saves straight into the season tab.
      await appendWriteupToDoc(writeupDocId, body, accessToken, season, week === 0 ? null : week);
      setDocStatus("saved");
      setTimeout(() => setDocStatus("idle"), 2500);
    } catch (err) {
      setDocStatus("error");
      setDocError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3">
      {/* Gives the browser a live use of the display font so it's actually loaded — see recap-graphic.ts, which draws with it via its resolved font-family name, not this class. */}
      <span aria-hidden className={`${recapDisplayFont.className} absolute h-0 w-0 overflow-hidden`}>
        .
      </span>
      {model ? (
        <RecapSectionsEditor model={model} onChange={onModelChange} />
      ) : (
        <textarea
          value={plainBody}
          onChange={(e) => onPlainBodyChange(e.target.value)}
          rows={20}
          className="w-full border border-border bg-page p-4 font-mono text-sm text-ink-primary outline-none transition-colors focus:border-series-1"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          icon={graphicStatus === "copied" ? <CheckIcon /> : <ImageIcon />}
          label={graphicStatus === "copying" ? "Rendering graphic…" : graphicStatus === "copied" ? "Copied graphic" : "Copy graphic"}
          onClick={handleCopyGraphic}
          disabled={graphicStatus === "copying"}
        />
        <IconButton
          icon={copied ? <CheckIcon /> : <CopyIcon />}
          label={copied ? "Copied plain text" : "Copy plain text"}
          onClick={handleCopy}
        />
        <IconButton icon={<SaveIcon />} label="Save to archive" type="submit" variant="primary" />
        {writeupDocId && googleClientId ? (
          <IconButton
            icon={docStatus === "saved" ? <CheckIcon /> : <UploadIcon />}
            label={docStatus === "saving" ? "Saving to Doc…" : docStatus === "saved" ? "Saved to Doc" : "Save to Doc"}
            onClick={handleSaveToDoc}
            disabled={docStatus === "saving"}
          />
        ) : writeupDocId ? (
          <a href="/settings" className="text-xs text-ink-muted underline decoration-dotted hover:text-ink-secondary">
            Connect Google Docs in Settings to save write-ups there
          </a>
        ) : null}
        {lastSavedAt ? (
          <span className="text-xs text-ink-muted">Saved {new Date(lastSavedAt).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-ink-muted">Not saved yet</span>
        )}
        {graphicStatus === "error" && graphicError ? (
          <span className="text-xs text-status-critical">Copy graphic failed: {graphicError}</span>
        ) : null}
        {docStatus === "error" && docError ? (
          <span className="text-xs text-status-critical">Google Doc save failed: {docError}</span>
        ) : null}
      </div>
    </form>
  );
}
