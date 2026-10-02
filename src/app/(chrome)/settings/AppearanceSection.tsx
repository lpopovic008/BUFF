"use client";

import { useSyncExternalStore } from "react";
import { ThemePreference, getThemePreference, setThemePreference, subscribeThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Light / dark / match-the-OS switch. Applies instantly and is remembered on this device. */
export function AppearanceSection() {
  // null during the static prerender, where there's no localStorage to read.
  const preference = useSyncExternalStore(subscribeThemePreference, getThemePreference, () => null);

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Theme" className="flex w-fit">
        {OPTIONS.map(({ value, label }) => {
          const active = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setThemePreference(value)}
              className={`-ml-px border px-4 py-1.5 text-sm font-medium transition-colors first:ml-0 ${
                active
                  ? "relative border-series-1 bg-series-1/10 text-series-1"
                  : "border-border text-ink-secondary hover:bg-page hover:text-ink-primary"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-muted">
        System follows your device&rsquo;s light or dark setting. Saved on this device only.
      </p>
    </div>
  );
}
