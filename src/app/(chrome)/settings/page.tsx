"use client";

import { useIsNativeApp } from "@/lib/native";
import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { DownloadIcon, UploadIcon } from "@/components/ui/Icon";
import { useConfig } from "@/hooks/useConfig";
import { updateCommishFlags, exportAllData, importAllData } from "@/lib/localStore";
import { getLeagueUsers } from "@/lib/sleeper";
import { defaultSeason } from "@/lib/app-defaults";
import { LeaguesSection } from "./LeaguesSection";
import { GoogleDocsSection } from "./GoogleDocsSection";
import { AccountSection } from "./AccountSection";
import { AppearanceSection } from "./AppearanceSection";
import { ExportSection } from "./ExportSection";
import { RedZoneSection } from "./RedZoneSection";
import { ScoresSection } from "./ScoresSection";
import { SupportSection } from "./SupportSection";
import { NotificationsSection } from "./NotificationsSection";
import { TitleWithHistory } from "@/components/HistoryButtons";
import { PlateCard } from "@/components/ui/PlateCard";

export default function SettingsPage() {
  const { config, loaded, refresh } = useConfig();
  const native = useIsNativeApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Commissioner marks come straight from each league's site (Sleeper's is_owner, and the like elsewhere), re-checked
  // each time Settings opens so a league handed over to or from you stays right.
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
          <Section title="Leagues">
            <LeaguesSection config={config} defaultSeason={defaultSeason()} onChange={refresh} />
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

          {/* The write-up's exported graphic: its look. */}
          <Section title="Export">
            <ExportSection />
          </Section>

          <Section title="Scores">
            <ScoresSection />
          </Section>

          {/* (Push notifications are the app's: a web browser here has none.) */}
          {native ? (
            <Section title="Notifications">
              <NotificationsSection />
            </Section>
          ) : null}

          <Section title="Red Zone">
            <RedZoneSection />
          </Section>

          {/* (Google's sign-in for Docs only works in a web browser, not in the app.) */}
          {native ? null : (
            <Section title="Google Docs">
              <GoogleDocsSection config={config} onChange={refresh} />
            </Section>
          )}

          <Section title="Suggest an improvement">
            <SupportSection />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <PlateCard title={title}>{children}</PlateCard>;
}
