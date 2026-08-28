"use client";

import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon, ExternalLinkIcon } from "@/components/ui/Icon";
import { ExternalLeague, addExternalLeague, removeExternalLeague } from "@/lib/localStore";
import { parseExternalLeagueUrl } from "@/lib/external-leagues";
import { getPublicLeague, EspnLeagueSummary } from "@/lib/espn";

const PLATFORM_LABEL: Record<ExternalLeague["platform"], string> = {
  espn: "ESPN",
  yahoo: "Yahoo",
};

export function ExternalLeaguesSection({
  leagues,
  onChange,
}: {
  leagues: ExternalLeague[];
  onChange: () => void;
}) {
  const [url, setUrl] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseExternalLeagueUrl(url);
    if (!parsed) {
      setError("Paste a link to your ESPN or Yahoo league page.");
      return;
    }
    setError(null);
    addExternalLeague({ ...parsed, nickname: nickname.trim() || undefined });
    setUrl("");
    setNickname("");
    onChange();
  }

  function handleRemove(id: string) {
    removeExternalLeague(id);
    onChange();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-ink-secondary">League URL (ESPN or Yahoo)</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://fantasy.espn.com/football/league?leagueId=..."
            required
            className="border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
          />
        </label>
        <label className="flex w-40 flex-col gap-1">
          <span className="text-sm font-medium text-ink-secondary">Nickname</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="optional"
            className="border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
          />
        </label>
        <IconButton icon={<ExternalLinkIcon />} label="Add league" type="submit" variant="primary" />
        {error ? <p className="text-sm text-status-critical sm:basis-full">{error}</p> : null}
      </form>

      {leagues.length === 0 ? (
        <p className="text-sm text-ink-secondary">No external leagues yet.</p>
      ) : (
        <ul className="divide-y divide-grid">
          {leagues.map((league) => (
            <li key={league.id} className="flex flex-nowrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate font-medium text-ink-primary">
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {PLATFORM_LABEL[league.platform]}
                  </span>
                  <span className="truncate">{league.nickname ?? league.leagueId ?? league.url}</span>
                </div>
                {league.platform === "espn" && league.leagueId ? (
                  <EspnLeaguePreview leagueId={league.leagueId} season={league.season} />
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={league.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${league.nickname ?? "league"} on ${PLATFORM_LABEL[league.platform]}`}
                  title="Open league"
                  className="flex h-9 w-9 shrink-0 items-center justify-center border border-border text-ink-secondary transition-all duration-150 hover:bg-page hover:text-ink-primary active:scale-90"
                >
                  <ExternalLinkIcon />
                </a>
                <IconButton
                  icon={<TrashIcon />}
                  label="Remove league"
                  onClick={() => handleRemove(league.id)}
                  variant="danger"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Best-effort live preview for a public ESPN league — silently shows nothing if the league is private, the id is wrong, or the request fails. */
function EspnLeaguePreview({ leagueId, season }: { leagueId: string; season?: string }) {
  const [summary, setSummary] = useState<EspnLeagueSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getPublicLeague(leagueId, season ?? String(new Date().getFullYear()));
      if (!cancelled) setSummary(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, season]);

  if (!summary) return null;
  return (
    <p className="truncate text-xs text-ink-secondary">
      {summary.name} · {summary.size} teams
    </p>
  );
}
