"use client";

import { useState } from "react";
import { saveRecapAction } from "../actions";

export function RecapEditor({
  leagueId,
  season,
  week,
  title,
  initialBody,
  savedAt,
}: {
  leagueId: string;
  season: string;
  week: number;
  title: string;
  initialBody: string;
  savedAt: string | null;
}) {
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <form action={saveRecapAction} className="flex flex-col gap-3">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="season" value={season} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="body" value={body} />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={20}
        className="w-full rounded-md border border-border bg-page p-4 font-mono text-sm text-ink-primary outline-none focus:border-series-1"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-page"
        >
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
        <button
          type="submit"
          className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Save to archive
        </button>
        {savedAt ? (
          <span className="text-xs text-ink-muted">Last saved {new Date(savedAt).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-ink-muted">Not saved yet</span>
        )}
      </div>
    </form>
  );
}
