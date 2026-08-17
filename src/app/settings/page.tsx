"use client";

import { useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useConfig } from "@/hooks/useConfig";
import { saveConfig, removeLeague, exportAllData, importAllData } from "@/lib/localStore";
import { DiscoverForm } from "./DiscoverForm";

export default function SettingsPage() {
  const { config, loaded, refresh } = useConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleToggleCommish(leagueId: string) {
    const league = config.leagues.find((l) => l.leagueId === leagueId);
    if (!league) return;
    saveConfig({
      ...config,
      leagues: config.leagues.map((l) =>
        l.leagueId === leagueId ? { ...l, isCommish: !l.isCommish } : l
      ),
    });
    refresh();
  }

  function handleRemove(leagueId: string) {
    removeLeague(leagueId);
    refresh();
  }

  function handleExport() {
    const blob = new Blob([exportAllData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "buff-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importAllData(text);
    refresh();
    e.target.value = "";
  }

  if (!loaded) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Settings</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Connect your Sleeper account and choose which leagues to track. Nothing is written back to
          Sleeper — this only reads your public league data, and everything is saved in this browser
          only.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Sleeper account
        </h2>
        <DiscoverForm
          defaultUsername={config.sleeperUsername ?? ""}
          defaultSeason={config.season}
          onDiscovered={refresh}
        />
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Tracked leagues ({config.leagues.length})
        </h2>
        {config.leagues.length === 0 ? (
          <p className="text-sm text-ink-secondary">
            No leagues yet. Enter your username and season above and click &ldquo;Discover
            leagues&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-grid">
            {config.leagues.map((league) => (
              <li key={league.leagueId} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink-primary">
                    {league.nickname ?? league.leagueId}
                  </div>
                  <div className="truncate text-xs text-ink-muted">{league.leagueId}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {league.isCommish ? <Badge tone="good">Commissioner</Badge> : null}
                  <button
                    type="button"
                    onClick={() => handleToggleCommish(league.leagueId)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-page"
                  >
                    {league.isCommish ? "Unmark commish" : "Mark as commish"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(league.leagueId)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Backup &amp; transfer
        </h2>
        <p className="mb-4 text-sm text-ink-secondary">
          Your settings and saved recaps live only in this browser. Export a backup before clearing
          browser data, or import it on another device/browser to carry everything over.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-page"
          >
            Export backup
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-page"
          >
            Import backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </Card>
    </div>
  );
}
