"use client";

import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { shownGrade, valueGrade } from "@/lib/player-values";
import { MonitorPlayer, PlayoffStanding, Reason } from "@/lib/trade-monitor";

// How each place against the playoff line reads: its label, and its colors.
const STATUS: Record<PlayoffStanding["status"], { label: string; className: string }> = {
  clinched: { label: "Clinched", className: "border-ink-primary bg-ink-primary text-page" },
  in: { label: "In", className: "border-status-good text-status-good" },
  bubble: { label: "Bubble", className: "border-status-warning text-status-warning" },
  out: { label: "Out", className: "border-border text-ink-muted" },
  eliminated: { label: "Eliminated", className: "border-status-critical text-status-critical" },
};

/** Where a team stands against the playoff line, as a tag. */
export function StatusChip({ standing }: { standing: PlayoffStanding }) {
  const s = STATUS[standing.status];
  return <span className={`border px-1.5 py-px text-[0.625rem] font-bold uppercase leading-[0.8125rem] tracking-wide ${s.className}`}>{s.label}</span>;
}

/**
 * One player on a list of who to buy or sell: photo, name (opening his card), position and age, NFL team, whose he
 * is, why he's there — and his value, with his stat (`stat`), where one's being looked at.
 */
export function AssetRow({
  player: p,
  reasons,
  onOpen,
  owner,
  stat,
}: {
  player: MonitorPlayer;
  reasons: Reason[];
  onOpen: (p: MonitorPlayer) => void;
  owner?: { name: string; standing?: PlayoffStanding };
  stat?: string | null;
}) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-border py-2 last:border-b-0">
      <PlayerHeadshot playerId={p.id} size={34} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <button type="button" onClick={() => onOpen(p)} className="min-w-0 truncate text-left text-sm font-bold text-ink-primary hover:underline">
            {p.name}
          </button>
          <span className={`text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[p.position] ?? "text-ink-muted"}`}>{p.position}</span>
          <span className="text-[0.6875rem] tabular-nums text-ink-muted">
            {p.age != null ? `${Math.floor(p.age)} yrs` : ""}
            {p.team ? ` · ${p.team}` : ""}
          </span>
        </div>
        {owner ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[0.6875rem] text-ink-secondary">
            <span className="truncate">{owner.name}</span>
            {owner.standing ? <StatusChip standing={owner.standing} /> : null}
          </span>
        ) : null}
        {reasons.length > 0 ? (
          <ul className="flex flex-wrap gap-x-2 gap-y-0.5">
            {reasons.map((r) => (
              <li key={r.text} className="text-[0.6875rem] leading-snug text-ink-secondary">
                {r.text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <span className="flex flex-col items-end leading-tight" title="KTC value">
        <span className="text-lg font-extrabold tabular-nums text-ink-primary">{p.value != null ? shownGrade(valueGrade(p.value)) : "–"}</span>
        <span className="text-[0.625rem] uppercase text-ink-muted">{stat ?? (p.valueRank != null ? `${p.position}${p.valueRank}` : "")}</span>
      </span>
    </li>
  );
}
