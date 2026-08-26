"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SearchIcon, CrownIcon, CalendarIcon, SuperflexIcon, OneQBIcon, PlusCircleIcon, DotIcon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { LeagueAccordion } from "@/components/LeagueAccordion";
import { useConfig } from "@/hooks/useConfig";
import { useMyLeagues } from "@/hooks/useMyLeagues";
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
                  <div className="h-2 w-10 shrink-0 overflow-hidden bg-page sm:w-24">
                    <div
                      className="h-full bg-series-1"
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
  const [leagueFormat, setLeagueFormat] = useState<LeagueFormat>("superflex");
  const [tep, setTep] = useState<TEPremium>("standard");
  const [deselectedPositions, setDeselectedPositions] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [expandedLeagueId, setExpandedLeagueId] = useState<string | null>(null);

  const leagueIds = useMemo(() => config.leagues.map((l) => l.leagueId), [config.leagues]);
  const myLeagues = useMyLeagues(leagueIds, config.sleeperUserId);

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
    <div className="flex flex-col gap-6 animate-[rise_0.5s_ease-out_backwards]">
      <h1 className="sr-only">Values</h1>

      {myLeagues && myLeagues.length > 0 ? (
        <Card className="px-5">
          {myLeagues.map((l) => (
            <LeagueAccordion
              key={l.leagueId}
              leagueId={l.leagueId}
              leagueName={l.leagueName}
              sleeperUserId={config.sleeperUserId}
              isOpen={expandedLeagueId === l.leagueId}
              onToggle={() => setExpandedLeagueId((cur) => (cur === l.leagueId ? null : l.leagueId))}
            />
          ))}
        </Card>
      ) : null}

      {!hasData ? (
        <Card className="p-8 text-center text-sm text-ink-secondary">
          Values haven&rsquo;t been fetched yet.
        </Card>
      ) : (
        <Card className="p-3 sm:p-5">
          <div className="relative mb-4">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a player…"
              aria-label="Search a player"
              className="w-full border border-border bg-page py-1.5 pl-8 pr-3 text-sm text-ink-primary outline-none transition-colors focus:border-series-1"
            />
          </div>

          <div className="mb-4 flex items-center gap-1">
            <IconButton
              icon={<CrownIcon />}
              label="Dynasty"
              size="sm"
              variant={listType === "dynasty" ? "primary" : "default"}
              onClick={() => setListType("dynasty")}
            />
            <IconButton
              icon={<CalendarIcon />}
              label="Fantasy (redraft)"
              size="sm"
              variant={listType === "fantasy" ? "primary" : "default"}
              onClick={() => setListType("fantasy")}
            />
            <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
            <IconButton
              icon={<SuperflexIcon />}
              label="Superflex"
              size="sm"
              variant={leagueFormat === "superflex" ? "primary" : "default"}
              onClick={() => setLeagueFormat("superflex")}
            />
            <IconButton
              icon={<OneQBIcon />}
              label="1QB"
              size="sm"
              variant={leagueFormat === "oneQB" ? "primary" : "default"}
              onClick={() => setLeagueFormat("oneQB")}
            />
            <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
            <IconButton
              icon={<DotIcon />}
              label="Standard scoring"
              size="sm"
              variant={tep === "standard" ? "primary" : "default"}
              onClick={() => setTep("standard")}
            />
            <IconButton
              icon={<PlusCircleIcon />}
              label="TE Premium"
              size="sm"
              variant={tep === "tep" ? "primary" : "default"}
              onClick={() => setTep("tep")}
            />
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
                  className={`border px-3 py-1 text-xs font-medium transition-colors ${
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
                className="px-3 py-1 text-xs font-medium text-ink-muted underline-offset-2 hover:underline"
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
