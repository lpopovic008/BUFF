"use client";

import { useRef } from "react";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronUpIcon, ChevronDownIcon, StarIcon, TrashIcon, DownloadIcon, UploadIcon, CrownIcon } from "@/components/ui/Icon";
import { useConfig } from "@/hooks/useConfig";
import { saveConfig, removeLeague, moveLeague, exportAllData, importAllData } from "@/lib/localStore";
import { DEFAULT_SLEEPER_USERNAME, defaultSeason } from "@/lib/app-defaults";
import { DiscoverForm } from "./DiscoverForm";
import { ExternalLeaguesSection } from "./ExternalLeaguesSection";

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
    <div className="flex flex-col gap-8 animate-[rise_0.5s_ease-out_backwards]">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Settings</h1>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Sleeper account
        </h2>
        <DiscoverForm
          defaultUsername={config.sleeperUsername ?? DEFAULT_SLEEPER_USERNAME}
          defaultSeason={config.season || defaultSeason()}
          onDiscovered={refresh}
        />
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Tracked leagues ({config.leagues.length})
        </h2>
        {config.leagues.length === 0 ? (
          <p className="text-sm text-ink-secondary">No leagues yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-grid">
              {config.leagues.map((league, i) => (
                <li key={league.leagueId} className="flex flex-nowrap items-center justify-between gap-2 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex shrink-0 flex-col">
                      <IconButton
                        icon={<ChevronUpIcon className="h-4 w-4" />}
                        label={`Move ${league.nickname ?? league.leagueId} up`}
                        onClick={() => handleMove(league.leagueId, "up")}
                        disabled={i === 0}
                        size="sm"
                      />
                      <IconButton
                        icon={<ChevronDownIcon className="h-4 w-4" />}
                        label={`Move ${league.nickname ?? league.leagueId} down`}
                        onClick={() => handleMove(league.leagueId, "down")}
                        disabled={i === config.leagues.length - 1}
                        size="sm"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate font-medium text-ink-primary">
                        <span className="truncate">{league.nickname ?? league.leagueId}</span>
                        {league.isCommish ? (
                          <CrownIcon className="h-3.5 w-3.5 shrink-0 text-status-good" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
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
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          External leagues (ESPN / Yahoo)
        </h2>
        <ExternalLeaguesSection leagues={config.externalLeagues} onChange={refresh} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Backup &amp; transfer
        </h2>
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
