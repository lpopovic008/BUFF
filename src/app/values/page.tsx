"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { RosterValueTable } from "@/components/RosterValueTable";
import { useConfig } from "@/hooks/useConfig";
import { useMyRosters } from "@/hooks/useMyRosters";
import rawSnapshot from "@/data/player-values.json";
import { LeagueFormat, PlayerValue, PlayerValuesSnapshot, TEPremium, valueFor } from "@/lib/player-values";

const snapshot = rawSnapshot as unknown as PlayerValuesSnapshot;

type ListType = "dynasty" | "fantasy";

// QB/RB/WR/TE first (KTC's own order), then whatever else shows up
// (rookie picks in dynasty; kickers/DST in fantasy) alphabetically.
const POSITION_PRIORITY = ["QB", "RB", "WR", "TE"];
function positionSort(a: string, b: string): number {
  const ai = POSITION_PRIORITY.indexOf(a);
  const bi = POSITION_PRIORITY.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  return a.localeCompare(b);
}

interface Row {
  player: PlayerValue;
  value: number;
  rank: number;
}

function ValueTable({ rows, maxValue }: { rows: Row[]; maxValue: number }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-secondary">No players match.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-grid text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="py-2 pr-3 font-medium">Rank</th>
            <th className="py-2 pr-3 font-medium">Player</th>
            <th className="hidden py-2 pr-3 font-medium sm:table-cell">Pos</th>
            <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Age</th>
            <th className="py-2 pr-3 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player: p, value, rank }) => (
            <tr key={`${p.position}-${p.name}`} className="border-b border-grid last:border-0">
              <td className="py-2 pr-3 tabular-nums text-ink-secondary">{rank}</td>
              <td className="max-w-[7rem] py-2 pr-3 font-medium text-ink-primary sm:max-w-none">
                <span className="block truncate">{p.name}</span>
                <span className="block text-xs font-normal text-ink-muted sm:hidden">
                  {p.position}
                  {p.team ? ` · ${p.team}` : ""}
                </span>
                {p.team ? <span className="ml-1.5 hidden text-xs font-normal text-ink-muted sm:inline">{p.team}</span> : null}
              </td>
              <td className="hidden py-2 pr-3 text-ink-secondary sm:table-cell">{p.position}</td>
              <td className="hidden py-2 pr-3 text-right tabular-nums text-ink-secondary sm:table-cell">
                {p.age ?? "—"}
              </td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-10 shrink-0 overflow-hidden rounded-full bg-page sm:w-24">
                    <div
                      className="h-full rounded-full bg-series-1"
                      style={{ width: `${Math.max(2, (value / maxValue) * 100)}%` }}
                    />
                  </div>
                  <span className="shrink-0 tabular-nums text-ink-secondary">{value}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ValuesPage() {
  const { config } = useConfig();
  const [listType, setListType] = useState<ListType>("dynasty");
  const [leagueFormat, setLeagueFormat] = useState<LeagueFormat>("oneQB");
  const [tep, setTep] = useState<TEPremium>("standard");
  const [deselectedPositions, setDeselectedPositions] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const leagueIds = useMemo(() => config.leagues.map((l) => l.leagueId), [config.leagues]);
  const myRosters = useMyRosters(leagueIds, config.sleeperUserId);

  const fullList = listType === "dynasty" ? snapshot.dynasty : snapshot.fantasy;

  const availablePositions = useMemo(
    () => Array.from(new Set(fullList.map((p) => p.position))).sort(positionSort),
    [fullList]
  );

  const maxValue = useMemo(
    () => Math.max(1, ...fullList.map((p) => valueFor(p, leagueFormat, tep))),
    [fullList, leagueFormat, tep]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fullList
      .filter((p) => !deselectedPositions.has(p.position))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .map((player) => ({ player, value: valueFor(player, leagueFormat, tep) }))
      .sort((a, b) => b.value - a.value)
      .map((row, i) => ({ ...row, rank: i + 1 }));
  }, [fullList, deselectedPositions, query, leagueFormat, tep]);

  const hasData = snapshot.updatedAt !== null;
  const togglePosition = (pos: string) =>
    setDeselectedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Values</h1>

      {myRosters && myRosters.length > 0 ? (
        <div className="flex flex-col gap-4">
          {myRosters.map((r) => (
            <Card key={r.leagueId} className="p-5">
              <Link
                href={`/team?league=${r.leagueId}&roster=${r.rosterId}`}
                className="text-sm font-medium text-series-1 hover:underline"
              >
                {r.leagueName}
              </Link>
              <div className="mt-3">
                <RosterValueTable players={r.players} />
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {!hasData ? (
        <Card className="p-8 text-center text-sm text-ink-secondary">
          Values haven&rsquo;t been fetched yet. This page fills in automatically once the daily
          player-values workflow runs — no action needed.
        </Card>
      ) : (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-md border border-border p-0.5">
              {(["dynasty", "fantasy"] as ListType[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setListType(f)}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    listType === f ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-page"
                  }`}
                >
                  {f === "dynasty" ? "Dynasty" : "Fantasy"}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a player…"
              className="w-full max-w-[220px] rounded-md border border-border bg-page px-3 py-1.5 text-sm text-ink-primary outline-none focus:border-series-1"
            />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-border p-0.5">
              {(["oneQB", "superflex"] as LeagueFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setLeagueFormat(f)}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    leagueFormat === f ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-page"
                  }`}
                >
                  {f === "oneQB" ? "1QB" : "Superflex"}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-md border border-border p-0.5">
              {(["standard", "tep"] as TEPremium[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTep(t)}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    tep === t ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-page"
                  }`}
                >
                  {t === "standard" ? "Standard" : "TE Premium"}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {availablePositions.map((pos) => {
              const active = !deselectedPositions.has(pos);
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => togglePosition(pos)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-series-1 bg-series-1/10 text-series-1"
                      : "border-border text-ink-muted line-through hover:bg-page"
                  }`}
                >
                  {pos}
                </button>
              );
            })}
            {deselectedPositions.size > 0 ? (
              <button
                type="button"
                onClick={() => setDeselectedPositions(new Set())}
                className="rounded-full px-3 py-1 text-xs font-medium text-ink-muted underline-offset-2 hover:underline"
              >
                Reset
              </button>
            ) : null}
          </div>

          <ValueTable rows={rows.slice(0, 300)} maxValue={maxValue} />
          {rows.length > 300 ? (
            <p className="mt-3 text-xs text-ink-muted">
              Showing the top 300 of {rows.length} matches — narrow your search to see more.
            </p>
          ) : null}
        </Card>
      )}
    </div>
  );
}
