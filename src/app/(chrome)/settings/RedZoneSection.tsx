"use client";

import { setFullPlays } from "@/lib/localStore";
import { useFullPlays } from "@/hooks/useFullPlays";

const OPTIONS: { value: boolean; label: string }[] = [
  { value: false, label: "Simple" },
  { value: true, label: "Full" },
];

/**
 * How the Red Zone describes a play: "Simple" says what each player did beside his name ("-1 yard rush");
 * "Full" keeps ESPN's whole description under the play too.
 */
export function RedZoneSection() {
  const full = useFullPlays();

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Play descriptions" className="flex w-fit">
        {OPTIONS.map(({ value, label }) => {
          const active = full === value;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFullPlays(value)}
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
      <p className="text-xs text-ink-muted">{full ? "Each play's full description under it." : "What each player did, beside his name."}</p>
    </div>
  );
}
