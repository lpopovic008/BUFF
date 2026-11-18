"use client";

import { useEffect, useState } from "react";
import { DEFAULT_RECAP_THEME, RECAP_THEMES, RecapTheme } from "@/lib/recap-graphic";
import { getHomeView, saveHomeView } from "@/lib/localStore";

/** A theme's look in small: its background, a card on it, and its three accents. */
function Swatch({ theme }: { theme: RecapTheme }) {
  const { color, neon } = theme;
  return (
    <span
      aria-hidden
      className="flex h-10 w-16 shrink-0 flex-col justify-between border border-border p-1.5"
      style={{ background: `linear-gradient(${color.bgTop}, ${color.bgBottom})` }}
    >
      <span className="h-1.5 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${neon.pink}, ${neon.blue}, ${neon.green})` }} />
      <span className="flex items-center gap-1">
        <span className="h-2 flex-1" style={{ background: color.card, outline: `1px solid ${color.hairline}` }} />
        <span className="h-2 w-2 rounded-full" style={{ background: color.primary }} />
      </span>
    </span>
  );
}

/**
 * How the write-up's exported graphic looks (see RECAP_THEMES): the app's own (the default), the original neon, and
 * more. Applies to the next graphic copied, and is remembered on this device.
 */
export function ExportSection() {
  // (Read once mounted: there's no localStorage in the static prerender.)
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    queueMicrotask(() => setPicked(getHomeView().exportTheme ?? DEFAULT_RECAP_THEME));
  }, []);
  const pick = (id: string) => {
    setPicked(id);
    saveHomeView({ exportTheme: id });
  };
  return (
    <div role="radiogroup" aria-label="Write-up graphic theme" className="grid gap-2 sm:grid-cols-2">
      {RECAP_THEMES.map((theme) => {
        const on = picked === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => pick(theme.id)}
            className={`flex items-center gap-3 border p-2 text-left transition-colors ${on ? "border-ink-primary" : "border-border hover:border-ink-secondary"}`}
          >
            <Swatch theme={theme} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-primary">
                {theme.name}
                {theme.id === DEFAULT_RECAP_THEME ? <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">Default</span> : null}
              </span>
              <span className="block text-xs text-ink-secondary">{theme.blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
