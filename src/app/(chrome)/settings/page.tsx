"use client";

import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronUpIcon, ChevronDownIcon, EyeIcon, EyeOffIcon, TrashIcon, DownloadIcon, UploadIcon, WalkieTalkieIcon } from "@/components/ui/Icon";
import { useConfig } from "@/hooks/useConfig";
import { removeLeague, moveLeague, toggleLeagueHidden, updateCommishFlags, exportAllData, importAllData } from "@/lib/localStore";
import { getLeagueUsers } from "@/lib/sleeper";
import { defaultSeason } from "@/lib/app-defaults";
import { DiscoverForm } from "./DiscoverForm";
import { ExternalLeaguesSection } from "./ExternalLeaguesSection";
import { GoogleDocsSection } from "./GoogleDocsSection";
import { AccountSection } from "./AccountSection";
import { AppearanceSection } from "./AppearanceSection";
import { ScoresSection } from "./ScoresSection";
import { TitleWithHistory } from "@/components/HistoryButtons";
import { PlateCard } from "@/components/ui/PlateCard";

export default function SettingsPage() {
  const { config, loaded, refresh } = useConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Commissioner marks come straight from Sleeper (is_owner), re-checked each
  // time Settings opens so a league handed over to or from you stays right.
  const userId = config.sleeperUserId;
  const leagueIds = config.leagues.map((l) => l.leagueId).join(",");
  useEffect(() => {
    if (!loaded || !userId || !leagueIds) return;
    let cancelled = false;
    (async () => {
      const flags: Record<string, boolean> = {};
      await Promise.all(
        leagueIds.split(",").map(async (leagueId) => {
          const users = await getLeagueUsers(leagueId);
          if (users.length > 0) flags[leagueId] = Boolean(users.find((u) => u.user_id === userId)?.is_owner);
        })
      );
      if (!cancelled && updateCommishFlags(flags)) refresh();
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loaded, userId, leagueIds, refresh]);

  function handleToggleHidden(leagueId: string) {
    toggleLeagueHidden(leagueId);
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
    a.download = "commish-backup.json";
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
    <div className="flex flex-col gap-6 animate-[rise_0.5s_ease-out_backwards]">
      <TitleWithHistory>
        <h1 className="text-2xl font-semibold text-ink-primary">Settings</h1>
      </TitleWithHistory>

      {/* Leagues on the left; this device and account on the right. One column on phones. */}
      {/* minmax(0, 1fr) columns, so a long URL or ID can't stretch the page past the screen. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Sleeper">
            <DiscoverForm
              defaultUsername={config.sleeperUsername ?? ""}
              defaultSeason={config.season || defaultSeason()}
              onDiscovered={refresh}
            />
            {config.leagues.length > 0 ? (
              <ul className="mt-4 divide-y divide-grid border-t border-grid">
                {config.leagues.map((league, i) => (
                  <li key={league.leagueId} className="flex flex-nowrap items-center justify-between gap-2 py-2.5">
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
                      <div
                        className={`flex min-w-0 items-center gap-1.5 font-medium transition-opacity ${
                          league.hidden ? "text-ink-muted opacity-50" : "text-ink-primary"
                        }`}
                      >
                        <span className="truncate">{league.nickname ?? league.leagueId}</span>
                        {league.isCommish ? (
                          <WalkieTalkieIcon className="h-[1.3em] w-[1.3em] shrink-0 text-status-good" role="img" aria-label="Commissioner" />
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton
                        icon={league.hidden ? <EyeOffIcon /> : <EyeIcon />}
                        label={league.hidden ? "Show on dashboard" : "Hide from dashboard"}
                        onClick={() => handleToggleHidden(league.leagueId)}
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
            ) : null}
          </Section>

          <Section title="ESPN & Yahoo">
            <ExternalLeaguesSection leagues={config.externalLeagues} onChange={refresh} />
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Account">
            <AccountSection />
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-grid pt-4">
              <span className="text-sm font-medium text-ink-secondary">Backup</span>
              <div className="flex gap-2">
                <IconButton icon={<DownloadIcon />} label="Export backup" onClick={handleExport} />
                <IconButton icon={<UploadIcon />} label="Import backup" onClick={() => fileInputRef.current?.click()} />
                <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImport} className="hidden" />
              </div>
            </div>
          </Section>

          <Section title="Appearance">
            <AppearanceSection />
          </Section>

          <Section title="Scores">
            <ScoresSection />
          </Section>

          <Section title="Google Docs">
            <GoogleDocsSection config={config} onChange={refresh} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <PlateCard title={title}>{children}</PlateCard>;
}
