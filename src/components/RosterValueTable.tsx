import { RankedPlayer } from "@/lib/matchup-players";

/** Rank/name/position/KTC-value table for a full roster — shared by the team page and the Values tab's per-league sections. */
export function RosterValueTable({ players }: { players: RankedPlayer[] }) {
  const maxValue = Math.max(1, ...players.map((p) => p.ktcValue ?? 0));

  return (
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
  );
}
