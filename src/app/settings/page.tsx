"use client";

import { useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronUpIcon, ChevronDownIcon, StarIcon, TrashIcon, DownloadIcon, UploadIcon } from "@/components/ui/Icon";
import { useConfig } from "@/hooks/useConfig";
import { saveConfig, removeLeague, moveLeague, exportAllData, importAllData } from "@/lib/localStore";
import { DEFAULT_SLEEPER_USERNAME, defaultSeason } from "@/lib/app-defaults";
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

  function handleMove(leagueId: string, direction: "up" | "down") {
    moveLeague(leagueId, direction);
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
        {DEFAULT_SLEEPER_USERNAME ? (
          <p className="mb-4 text-sm text-ink-secondary">
            <span className="font-medium text-ink-primary">{DEFAULT_SLEEPER_USERNAME}</span> is built
            into this build, so leagues load automatically on any device. Re-run discovery below to
            pick up a new season or a league you just joined.
          </p>
        ) : null}
        <DiscoverForm
          defaultUsername={config.sleeperUsername ?? DEFAULT_SLEEPER_USERNAME}
          defaultSeason={config.season || defaultSeason()}
          onDiscovered={refresh}
        />
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Tracked leagues ({config.leagues.length})
        </h2>
        {config.leagues.length === 0 ? (
          <p className="mt-3 text-sm text-ink-secondary">
            No leagues yet. Enter your username and season above and click &ldquo;Discover
            leagues&rdquo;.
          </p>
        ) : (
          <>
            <p className="mb-4 text-xs text-ink-secondary">
              This order is the order they appear on the dashboard. Re-running discovery keeps it.
            </p>
            <ul className="divide-y divide-grid">
              {config.leagues.map((league, i) => (
                <li
                  key={league.leagueId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex shrink-0 flex-col">
                      <IconButton
                        icon={<ChevronUpIcon className="h-4 w-4" />}
                        label={`Move ${league.nickname ?? league.leagueId} up`}
                        onClick={() => handleMove(league.leagueId, "up")}
                        disabled={i === 0}
                        size="sm"
                        className="rounded-b-none"
                      />
                      <IconButton
                        icon={<ChevronDownIcon className="h-4 w-4" />}
                        label={`Move ${league.nickname ?? league.leagueId} down`}
                        onClick={() => handleMove(league.leagueId, "down")}
                        disabled={i === config.leagues.length - 1}
                        size="sm"
                        className="-mt-px rounded-t-none"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink-primary">
                        {league.nickname ?? league.leagueId}
                      </div>
                      <div className="truncate text-xs text-ink-muted">{league.leagueId}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {league.isCommish ? <Badge tone="good">Commissioner</Badge> : null}
                    <IconButton
                      icon={<StarIcon filled={league.isCommish} />}
                      label={league.isCommish ? "Unmark commish" : "Mark as commish"}
                      onClick={() => handleToggleCommish(league.leagueId)}
                    />
                    <IconButton
                      icon={<TrashIcon />}
                      label="Remove league"
                      onClick={() => handleRemove(league.leagueId)}
                      variant="danger"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
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
        <div className="flex gap-2">
          <IconButton icon={<DownloadIcon />} label="Export backup" onClick={handleExport} />
          <IconButton icon={<UploadIcon />} label="Import backup" onClick={() => fileInputRef.current?.click()} />
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
