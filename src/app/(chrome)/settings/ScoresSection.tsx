"use client";

import { setAsItStands } from "@/lib/localStore";
import { useAsItStands } from "@/hooks/useAsItStands";

const OPTIONS: { value: boolean; label: string }[] = [
  { value: false, label: "Final" },
  { value: true, label: "As it stands" },
];

/**
 * Whether the week being played counts before it's over: "Final" waits for
 * Sleeper to make it official; "As it stands" counts it as if it ended now —
 * records, standings, streaks, head-to-heads and payouts.
 */
export function ScoresSection() {
  const asItStands = useAsItStands();

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Count the week being played" className="flex w-fit">
        {OPTIONS.map(({ value, label }) => {
          const active = asItStands === value;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setAsItStands(value)}
              className={`-ml-px border px-4 py-1.5 text-sm font-medium transition-colors first:ml-0 ${
                active
                  ? "relative border-[var(--map-tag)] bg-[var(--map-tag)] text-[var(--map-tag-ink)]"
                  : "border-border text-ink-secondary hover:bg-page hover:text-ink-primary"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-muted">
        {asItStands ? "Counts the week being played as if it ended now." : "Counts a week once it's final."}
      </p>
    </div>
  );
}
