"use client";

import { useState } from "react";
import { saveRecap } from "@/lib/localStore";
import { buildRecapClipboardHtml } from "@/lib/format-recap";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { appendWriteupToDoc, DOCS_SCOPE } from "@/lib/google-docs";
import { GOOGLE_CLIENT_ID } from "@/lib/google-config";
import { IconButton } from "@/components/ui/IconButton";
import { CopyIcon, CopyStyledIcon, SaveIcon, CheckIcon, UploadIcon } from "@/components/ui/Icon";

export function RecapEditor({
  leagueId,
  season,
  week,
  title,
  body,
  onBodyChange,
  savedAt,
  writeupDocId,
}: {
  leagueId: string;
  season: string;
  week: number;
  title: string;
  body: string;
  onBodyChange: (body: string) => void;
  savedAt: string | null;
  writeupDocId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedFormatted, setCopiedFormatted] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(savedAt);
  const [docStatus, setDocStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [docError, setDocError] = useState<string | null>(null);

  async function handleCopy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /** Copies both plain text and HTML representations — apps that keep formatting on
   * paste (Messages/Notes/Mail on Mac, and most iOS paste targets) pick up the bold
   * headers/underlined callout/italic narrative; anything else just gets plain text. */
  async function handleCopyFormatted() {
    try {
      const html = buildRecapClipboardHtml(body);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([body], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(body);
    }
    setCopiedFormatted(true);
    setTimeout(() => setCopiedFormatted(false), 2000);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    saveRecap({ leagueId, season, week, title, body, savedAt: now });
    setLastSavedAt(now);
  }

  /** Appends the write-up currently in the textarea to the commish's Google Doc — whatever's been hand-edited, not the auto-generated draft. Prompts a Google sign-in popup the first time (or once the cached token expires). */
  async function handleSaveToDoc() {
    if (!writeupDocId || !GOOGLE_CLIENT_ID) return;
    setDocStatus("saving");
    setDocError(null);
    try {
      const accessToken = await getGoogleAccessToken(GOOGLE_CLIENT_ID, DOCS_SCOPE);
      await appendWriteupToDoc(writeupDocId, body, accessToken);
      setDocStatus("saved");
      setTimeout(() => setDocStatus("idle"), 2500);
    } catch (err) {
      setDocStatus("error");
      setDocError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3">
      <textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        rows={20}
        className="w-full border border-border bg-page p-4 font-mono text-sm text-ink-primary outline-none transition-colors focus:border-series-1"
      />

      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          icon={copiedFormatted ? <CheckIcon /> : <CopyStyledIcon />}
          label={copiedFormatted ? "Copied formatted" : "Copy formatted"}
          onClick={handleCopyFormatted}
        />
        <IconButton
          icon={copied ? <CheckIcon /> : <CopyIcon />}
          label={copied ? "Copied plain text" : "Copy plain text"}
          onClick={handleCopy}
        />
        <IconButton icon={<SaveIcon />} label="Save to archive" type="submit" variant="primary" />
        {writeupDocId && GOOGLE_CLIENT_ID ? (
          <IconButton
            icon={docStatus === "saved" ? <CheckIcon /> : <UploadIcon />}
            label={docStatus === "saving" ? "Saving to Doc…" : docStatus === "saved" ? "Saved to Doc" : "Save to Doc"}
            onClick={handleSaveToDoc}
            disabled={docStatus === "saving"}
          />
        ) : null}
        {lastSavedAt ? (
          <span className="text-xs text-ink-muted">Saved {new Date(lastSavedAt).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-ink-muted">Not saved yet</span>
        )}
        {docStatus === "error" && docError ? (
          <span className="text-xs text-status-critical">Google Doc save failed: {docError}</span>
        ) : null}
      </div>
    </form>
  );
}
