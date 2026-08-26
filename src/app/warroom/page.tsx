"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Oxanium, Titillium_Web, IBM_Plex_Mono } from "next/font/google";
import { Card } from "@/components/ui/Card";
import { useConfig } from "@/hooks/useConfig";
import { WarRoomConsole } from "./WarRoomConsole";
import { loadWarRoomData, WarRoomData } from "@/lib/warroom-data";
import { getCurrentWeek } from "@/lib/sleeper";

const oxanium = Oxanium({ subsets: ["latin"], variable: "--font-oxanium" });
const titilliumWeb = Titillium_Web({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-titillium-web" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ibm-plex-mono" });

function WarRoomContent() {
  const leagueIdParam = useSearchParams().get("id");
  const { config, loaded } = useConfig();
  const leagueId = leagueIdParam || config.leagues[0]?.leagueId || null;
  const [data, setData] = useState<WarRoomData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId || !loaded) return;
    let cancelled = false;
    (async () => {
      setData(null);
      setError(null);
      try {
        const currentWeek = await getCurrentWeek();
        const result = await loadWarRoomData(leagueId, config.sleeperUserId, currentWeek);
        if (cancelled) return;
        if (!result) {
          setError("Couldn't find your team in this league.");
          return;
        }
        setData(result);
      } catch {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, loaded, config.sleeperUserId]);

  if (!loaded) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>;
  }
  if (!leagueId) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Track a league in Settings first.</Card>;
  }
  if (error) {
    return <Card className="p-12 text-center text-sm text-status-critical">{error}</Card>;
  }
  if (!data) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading the War Room…</Card>;
  }

  return (
    <div className={`${oxanium.variable} ${titilliumWeb.variable} ${ibmPlexMono.variable}`}>
      <WarRoomConsole data={data} />
    </div>
  );
}

export default function WarRoomPage() {
  return (
    <Suspense fallback={<Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>}>
      <WarRoomContent />
    </Suspense>
  );
}
