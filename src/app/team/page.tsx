"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { getLeague, getLeagueRosters, getLeagueUsers, SleeperLeague, SleeperRoster } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players";
import { RankedPlayer, rankPlayersByValue } from "@/lib/matchup-players";
import { displayManagerName, formatRecord } from "@/lib/format";
import rawSnapshot from "@/data/player-values.json";
import { PlayerValuesSnapshot } from "@/lib/player-values";

const snapshot = rawSnapshot as unknown as PlayerValuesSnapshot;

function TeamContent() {
  const searchParams = useSearchParams();
  const leagueId = searchParams.get("league");
  const rosterId = Number(searchParams.get("roster"));

  const [league, setLeague] = useState<SleeperLeague | null>(null);
  const [roster, setRoster] = useState<SleeperRoster | null>(null);
  const [managerName, setManagerName] = useState<string>("");
  const [players, setPlayers] = useState<RankedPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId || !rosterId) return;
    let cancelled = false;
    (async () => {
      setPlayers(null);
      setError(null);
      try {
        const [leagueData, rosters, users] = await Promise.all([
          getLeague(leagueId),
          getLeagueRosters(leagueId),
          getLeagueUsers(leagueId),
        ]);
        if (cancelled) return;
        const targetRoster = rosters.find((r) => r.roster_id === rosterId);
        if (!leagueData || !targetRoster) {
          setError("Team not found.");
          return;
        }
        setLeague(leagueData);
        setRoster(targetRoster);
        const user = users.find((u) => u.user_id === targetRoster.owner_id);
        setManagerName(displayManagerName(user));

        const resolved = await resolvePlayers(targetRoster.players ?? []);
        if (cancelled) return;
        setPlayers(rankPlayersByValue(resolved, {}, snapshot));
      } catch {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, rosterId]);

  if (!leagueId || !rosterId) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">No team selected.</Card>;
  }
  if (error) {
    return <Card className="p-12 text-center text-sm text-status-critical">{error}</Card>;
  }
  if (!league || !roster || !players) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading team…</Card>;
  }

  const maxValue = Math.max(1, ...players.map((p) => p.ktcValue ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/league?id=${leagueId}`} className="text-sm font-medium text-series-1 hover:underline">
          ← {league.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink-primary">{managerName}</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {formatRecord(roster.settings.wins ?? 0, roster.settings.losses ?? 0, roster.settings.ties ?? 0)}
        </p>
      </div>

      <Card className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-grid text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3 font-medium">Rank</th>
                <th className="py-2 pr-3 font-medium">Player</th>
                <th className="hidden py-2 pr-3 font-medium sm:table-cell">Pos</th>
                <th className="py-2 pr-3 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.playerId} className="border-b border-grid last:border-0">
                  <td className="py-2 pr-3 tabular-nums text-ink-secondary">{i + 1}</td>
                  <td className="max-w-[9rem] py-2 pr-3 font-medium text-ink-primary sm:max-w-none">
                    <span className="block truncate">{p.name}</span>
                    <span className="block text-xs font-normal text-ink-muted sm:hidden">
                      {p.position}
                      {p.team ? ` · ${p.team}` : ""}
                    </span>
                    {p.team ? <span className="ml-1.5 hidden text-xs font-normal text-ink-muted sm:inline">{p.team}</span> : null}
                  </td>
                  <td className="hidden py-2 pr-3 text-ink-secondary sm:table-cell">{p.position}</td>
                  <td className="py-2 pr-3">
                    {p.ktcValue !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-10 shrink-0 overflow-hidden rounded-full bg-page sm:w-24">
                          <div
                            className="h-full rounded-full bg-series-1"
                            style={{ width: `${Math.max(2, (p.ktcValue / maxValue) * 100)}%` }}
                          />
                        </div>
                        <span className="shrink-0 tabular-nums text-ink-secondary">{p.ktcValue}</span>
                      </div>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={<Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>}>
      <TeamContent />
    </Suspense>
  );
}
