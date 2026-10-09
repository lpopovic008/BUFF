"use client";

import { useMemo } from "react";
import { ManagerCareerStats } from "@/lib/league-data";
import { formatMoney } from "@/lib/payout-plan";
import { formatPoints, formatPct, ordinal, winPct } from "@/lib/format";
import { useTableSort } from "@/hooks/useTableSort";
import { SortHeader } from "@/components/ui/SortHeader";

/** A manager's career, with what they've won across every season's payouts, when known. */
type CareerRow = ManagerCareerStats & { earned: number };

const COLUMNS = {
  manager: (m: CareerRow) => m.displayName,
  seasons: (m: CareerRow) => m.seasonsPlayed,
  record: (m: CareerRow) => m.wins,
  winPct: (m: CareerRow) => winPct(m.wins, m.losses, m.ties),
  pointsFor: (m: CareerRow) => m.pointsFor,
  bestFinish: (m: CareerRow) => m.bestFinishRank,
  championships: (m: CareerRow) => m.championships,
  earned: (m: CareerRow) => m.earned,
};

export function CareerLeaderboard({
  managers,
  earnings,
}: {
  managers: ManagerCareerStats[];
  /** All-time earnings by manager (Sleeper user id), across every season's payouts — null when no season pays anything. */
  earnings?: Map<string, number> | null;
}) {
  const maxChampionships = Math.max(1, ...managers.map((m) => m.championships));
  const rows = useMemo(
    () => managers.map((m) => ({ ...m, earned: earnings?.get(m.userId) ?? 0 })),
    [managers, earnings]
  );
  const { sorted, sortState, toggleSort } = useTableSort(rows, COLUMNS);

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
            {earnings ? (
              <SortHeader sortKey="earned" state={sortState} onSort={toggleSort} align="right">
                <span className="sm:hidden" title="Earned, all-time">
                  $
                </span>
                <span className="hidden sm:inline">Earned</span>
              </SortHeader>
            ) : null}
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
              {earnings ? (
                <td className="whitespace-nowrap py-2 pr-2 text-right font-semibold tabular-nums text-ink-primary sm:pr-3">
                  {formatMoney(m.earned)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
