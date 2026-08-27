"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Oxanium, Titillium_Web, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { useConfig } from "@/hooks/useConfig";
import { useMyLeagues } from "@/hooks/useMyLeagues";
import { useNFLState } from "@/hooks/useNFLState";
import { WarRoomConsole } from "@/components/WarRoomConsole";
import { loadWarRoomData, WarRoomData } from "@/lib/warroom-data";
import { getCurrentWeek } from "@/lib/sleeper";

const oxanium = Oxanium({ subsets: ["latin"], variable: "--font-oxanium" });
const titilliumWeb = Titillium_Web({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-titillium-web" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ibm-plex-mono" });

function WarRoomHome() {
  const idParam = useSearchParams().get("id");
  const { config, loaded, bootstrapping } = useConfig();
  const leagueIds = useMemo(() => config.leagues.map((l) => l.leagueId), [config.leagues]);
  const myLeagues = useMyLeagues(leagueIds, config.sleeperUserId);

  // Which league is showing. Until the Dossier picks one explicitly, it
  // derives from the ?id= deep link (from the league page's "War Room"
  // button) if that's a tracked league, else the top league in Settings'
  // order — no effect needed since it's computed straight from state.
  const [explicitLeagueId, setExplicitLeagueId] = useState<string | null>(null);
  const [data, setData] = useState<WarRoomData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nflPhase = useNFLState();

  const totalRecord = useMemo(() => {
    const totals = { wins: 0, losses: 0, ties: 0 };
    for (const l of myLeagues ?? []) {
      totals.wins += l.wins;
      totals.losses += l.losses;
      totals.ties += l.ties;
    }
    return totals;
  }, [myLeagues]);

  const defaultLeagueId = loaded
    ? (idParam && config.leagues.some((l) => l.leagueId === idParam) ? idParam : config.leagues[0]?.leagueId) ?? null
    : null;
  const leagueId = explicitLeagueId ?? defaultLeagueId;

  useEffect(() => {
    if (!leagueId) return;
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
  }, [leagueId, config.sleeperUserId]);

  if (bootstrapping) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Finding your Sleeper leagues…</Card>;
  }
  if (!loaded) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>;
  }
  if (config.leagues.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <h1 className="text-xl font-semibold text-ink-primary">No leagues tracked yet</h1>
        <p className="max-w-md text-sm text-ink-secondary">
          Connect your Sleeper username to pull in every league you play in this season.
        </p>
        <Link
          href="/settings"
          className="mt-2 bg-series-1 px-4 py-2 text-sm font-medium text-white transition-transform hover:opacity-90 active:scale-95"
        >
          Go to Settings
        </Link>
      </Card>
    );
  }
  if (error) {
    return <Card className="p-12 text-center text-sm text-status-critical">{error}</Card>;
  }
  if (!leagueId || !data || !myLeagues) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading the War Room…</Card>;
  }

  return (
    <div className={`${oxanium.variable} ${titilliumWeb.variable} ${ibmPlexMono.variable}`}>
      <WarRoomConsole
        data={data}
        leagueOptions={myLeagues}
        currentLeagueId={leagueId}
        onLeagueChange={setExplicitLeagueId}
        isPreseason={nflPhase.isPreseason}
        preseasonWeek={nflPhase.isPreseason ? nflPhase.week : null}
        totalRecord={totalRecord}
      />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>}>
      <WarRoomHome />
    </Suspense>
  );
}
