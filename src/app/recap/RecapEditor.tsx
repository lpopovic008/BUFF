"use client";

import { useState } from "react";
import { saveRecap } from "@/lib/localStore";
import { buildRecapClipboardHtml } from "@/lib/format-recap";
import { IconButton } from "@/components/ui/IconButton";
import { CopyIcon, CopyStyledIcon, SaveIcon, CheckIcon } from "@/components/ui/Icon";

export function RecapEditor({
  leagueId,
  season,
  week,
  title,
  body,
  onBodyChange,
  savedAt,
}: {
  leagueId: string;
  season: string;
  week: number;
  title: string;
  body: string;
  onBodyChange: (body: string) => void;
  savedAt: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedFormatted, setCopiedFormatted] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(savedAt);

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
        {lastSavedAt ? (
          <span className="text-xs text-ink-muted">Saved {new Date(lastSavedAt).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-ink-muted">Not saved yet</span>
        )}
      </div>
    </form>
  );
}
