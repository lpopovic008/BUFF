"use client";

import { setPlayerMark, usePlayerMarks } from "@/hooks/usePlayerMarks";
import { PlayerMark } from "@/lib/localStore";

const MARKS: { mark: PlayerMark; label: string; said: string; on: string }[] = [
  { mark: "buy", label: "Buy", said: "Interested: on your lists of who to buy, in leagues he's on another team", on: "border-status-good text-status-good" },
  { mark: "sell", label: "Sell", said: "Looking to get rid of: on your lists of who to sell, in leagues he's on your team", on: "border-status-critical text-status-critical" },
];

/**
 * Marking a player from his card: interested in getting him (buy), or looking to get rid of him (sell) — each on the
 * Values page's lists of who to buy and sell in your leagues; tapped again, taken off. `reflected`: a copy of them in
 * the floor, just to look at.
 */
export function PlayerMarks({ playerId, name, size, reflected = false }: { playerId: string; name: string; size?: number; reflected?: boolean }) {
  const marks = usePlayerMarks();
  const marked = marks[playerId] ?? null;
  return (
    <span className="flex gap-[0.4em]" style={size ? { fontSize: size } : undefined}>
      {MARKS.map((m) => {
        const on = marked === m.mark;
        const look = `border px-[0.45em] py-[0.05em] font-extrabold uppercase leading-tight tracking-wide transition-colors ${on ? m.on : "border-border text-ink-muted"}`;
        return reflected ? (
          <span key={m.mark} aria-hidden className={look}>
            {m.label}
          </span>
        ) : (
          <button
            key={m.mark}
            type="button"
            aria-pressed={on}
            aria-label={`${m.label} ${name}`}
            title={m.said}
            onClick={() => setPlayerMark(playerId, m.mark)}
            className={`pointer-events-auto ${look} ${on ? "" : "hover:border-ink-primary hover:text-ink-primary"}`}
          >
            {m.label}
          </button>
        );
      })}
    </span>
  );
}
