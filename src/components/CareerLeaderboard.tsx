"use client";

import { ManagerCareerStats } from "@/lib/league-data";
import { formatPoints, formatPct, ordinal, winPct } from "@/lib/format";
import { useTableSort } from "@/hooks/useTableSort";
import { SortHeader } from "@/components/ui/SortHeader";

const COLUMNS = {
  manager: (m: ManagerCareerStats) => m.displayName,
  seasons: (m: ManagerCareerStats) => m.seasonsPlayed,
  record: (m: ManagerCareerStats) => m.wins,
  winPct: (m: ManagerCareerStats) => winPct(m.wins, m.losses, m.ties),
  pointsFor: (m: ManagerCareerStats) => m.pointsFor,
  bestFinish: (m: ManagerCareerStats) => m.bestFinishRank,
  championships: (m: ManagerCareerStats) => m.championships,
};

export function CareerLeaderboard({ managers }: { managers: ManagerCareerStats[] }) {
  const maxChampionships = Math.max(1, ...managers.map((m) => m.championships));
  const { sorted, sortState, toggleSort } = useTableSort(managers, COLUMNS);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-grid text-xs uppercase tracking-wide text-ink-muted">
            <SortHeader sortKey="manager" state={sortState} onSort={toggleSort}>
              Manager
            </SortHeader>
            <SortHeader sortKey="seasons" state={sortState} onSort={toggleSort} align="right" className="hidden sm:table-cell">
              Seasons
            </SortHeader>
            <SortHeader sortKey="record" state={sortState} onSort={toggleSort} align="right">
              Record
            </SortHeader>
            <SortHeader sortKey="winPct" state={sortState} onSort={toggleSort} align="right">
              Win%
            </SortHeader>
            <SortHeader sortKey="pointsFor" state={sortState} onSort={toggleSort} align="right" className="hidden sm:table-cell">
              PF
            </SortHeader>
            <SortHeader sortKey="bestFinish" state={sortState} onSort={toggleSort} align="right">
              <span className="sm:hidden">Best</span>
              <span className="hidden sm:inline">Best finish</span>
            </SortHeader>
            <SortHeader sortKey="championships" state={sortState} onSort={toggleSort}>
              <span className="sm:hidden">Titles</span>
              <span className="hidden sm:inline">Championships</span>
            </SortHeader>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.userId} className="border-b border-grid last:border-0">
              <td className="py-2 pr-2 font-medium text-ink-primary sm:pr-3">{m.displayName}</td>
              <td className="hidden py-2 pr-3 text-right tabular-nums text-ink-secondary sm:table-cell">{m.seasonsPlayed}</td>
              <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums text-ink-secondary sm:pr-3">
                {m.wins}-{m.losses}
                {m.ties ? `-${m.ties}` : ""}
              </td>
              <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums text-ink-secondary sm:pr-3">
                {formatPct(winPct(m.wins, m.losses, m.ties))}
              </td>
              <td className="hidden py-2 pr-3 text-right tabular-nums text-ink-secondary sm:table-cell">{formatPoints(m.pointsFor)}</td>
              <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums text-ink-secondary sm:pr-3">
                {m.bestFinishRank ? ordinal(m.bestFinishRank) : "—"}
              </td>
              <td className="py-2 pr-2 sm:pr-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-10 overflow-hidden bg-page sm:w-24">
                    <div
                      className="h-full bg-series-1 transition-[width] duration-500"
                      style={{ width: `${(m.championships / maxChampionships) * 100}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-ink-secondary">{m.championships}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
