"use client";

import { useState } from "react";
import { saveRecap } from "@/lib/localStore";
import { carryForwardRecapTemplate } from "@/lib/format-recap";

export function RecapEditor({
  leagueId,
  season,
  week,
  title,
  initialBody,
  savedAt,
  freshTemplate,
  previousBody,
}: {
  leagueId: string;
  season: string;
  week: number;
  title: string;
  initialBody: string;
  savedAt: string | null;
  freshTemplate?: string | null;
  previousBody?: string | null;
}) {
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(savedAt);

  async function handleCopy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLoadTemplate() {
    if (!previousBody || !freshTemplate) return;
    setBody(carryForwardRecapTemplate(previousBody, freshTemplate));
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
        onChange={(e) => setBody(e.target.value)}
        rows={20}
        className="w-full rounded-md border border-border bg-page p-4 font-mono text-sm text-ink-primary outline-none focus:border-series-1"
      />

      <div className="flex flex-wrap items-center gap-3">
        {previousBody && freshTemplate ? (
          <button
            type="button"
            onClick={handleLoadTemplate}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-page"
          >
            Load last week&rsquo;s template
          </button>
        ) : null}
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
        {lastSavedAt ? (
          <span className="text-xs text-ink-muted">Last saved {new Date(lastSavedAt).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-ink-muted">Not saved yet</span>
        )}
      </div>
    </form>
  );
}
