import { RankedPlayer } from "@/lib/matchup-players";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";

/** Name/position/team/KTC-value rows for a full roster — shared by the team page and the Values tab's per-league sections. */
export function RosterValueTable({ players }: { players: RankedPlayer[] }) {
  return (
    <div className="flex w-full flex-col">
      {players.map((p) => (
        <div
          key={p.playerId}
          className="flex w-full items-center justify-between gap-3 border-b border-grid py-2.5 last:border-0"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`w-7 shrink-0 text-xs font-bold ${POSITION_TEXT_COLOR[p.position] ?? "text-ink-muted"}`}>
              {p.position}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ink-primary">{p.name}</div>
              {p.team ? <div className="text-xs text-ink-muted">{p.team}</div> : null}
            </div>
          </div>
          <div className="shrink-0 text-sm font-semibold tabular-nums text-ink-primary">
            {p.ktcValue ?? "—"}
          </div>
        </div>
      ))}
    </div>
  );
}
