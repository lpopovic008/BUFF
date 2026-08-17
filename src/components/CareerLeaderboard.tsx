import { ManagerCareerStats } from "@/lib/league-data";
import { formatPoints, formatPct, ordinal, winPct } from "@/lib/format";

export function CareerLeaderboard({ managers }: { managers: ManagerCareerStats[] }) {
  const maxChampionships = Math.max(1, ...managers.map((m) => m.championships));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-grid text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="py-2 pr-3 font-medium">Manager</th>
            <th className="py-2 pr-3 font-medium text-right">Seasons</th>
            <th className="py-2 pr-3 font-medium text-right">Record</th>
            <th className="py-2 pr-3 font-medium text-right">Win%</th>
            <th className="py-2 pr-3 font-medium text-right">PF</th>
            <th className="py-2 pr-3 font-medium text-right">Best finish</th>
            <th className="py-2 pr-3 font-medium">Championships</th>
          </tr>
        </thead>
        <tbody>
          {managers.map((m) => (
            <tr key={m.userId} className="border-b border-grid last:border-0">
              <td className="py-2 pr-3 font-medium text-ink-primary">{m.displayName}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">{m.seasonsPlayed}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                {m.wins}-{m.losses}
                {m.ties ? `-${m.ties}` : ""}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                {formatPct(winPct(m.wins, m.losses, m.ties))}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">{formatPoints(m.pointsFor)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                {m.bestFinishRank ? ordinal(m.bestFinishRank) : "—"}
              </td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-page">
                    <div
                      className="h-full rounded-full bg-series-1"
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
