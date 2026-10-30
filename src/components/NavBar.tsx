"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useNFLState } from "@/hooks/useNFLState";
import { useCombinedRecord } from "@/hooks/useCombinedRecord";
import { appPages } from "@/components/TabBar";
import { useHeaderWeek } from "@/lib/header-week";
import { WeekPicker, weekLabel } from "@/components/WeekPicker";
import { setHeaderSlot, useHeaderBare } from "@/lib/header-slot";
import { ChevronLeftIcon } from "@/components/ui/Icon";

/** The app's walkie-talkie on its own, no tile — flat, in the text's color, its speaker grille cut through. */
function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="26 12 41 76" className={className} fill="currentColor" aria-hidden>
      <defs>
        <mask id="logo-grille">
          <rect x="26" y="12" width="41" height="76" fill="white" />
          {[49, 58, 67].map((y) => (
            <rect key={y} x="39" y={y} width="20" height="5" rx="2.5" fill="black" />
          ))}
        </mask>
      </defs>
      <rect x="39" y="12" width="7" height="26" rx="3.5" />
      <rect x="54" y="25" width="6" height="12" rx="3" />
      <rect x="26" y="47" width="6" height="17" rx="3" />
      <rect x="31" y="33" width="36" height="55" rx="8" mask="url(#logo-grille)" />
    </svg>
  );
}

// The header's square buttons, styled like the map's own controls.
const HEADER_BUTTON =
  "flex h-7 w-7 shrink-0 items-center justify-center border border-grid bg-page text-ink-secondary transition-colors hover:text-ink-primary active:scale-90 disabled:opacity-30 disabled:hover:text-ink-secondary sm:h-9 sm:w-9";

/**
 * The page header, pinned to the top of the screen. It publishes its own
 * height as --header-h so whatever else sticks to the top (the phone league
 * ticker, the dashboard's columns) sits just beneath it.
 */
export function NavBar() {
  const phase = useNFLState();
  const record = useCombinedRecord();
  // A page showing a week of its own (the league page) makes the header's week its picker.
  const pickable = useHeaderWeek();
  const ref = useRef<HTMLElement>(null);
  // From tablet width up, the app's pages: Profile as an icon by your record, the rest as text tabs by the wordmark.
  const [profile, ...tabs] = appPages(usePathname());
  // A page that's taken the header over (see header-slot.ts).
  const bare = useHeaderBare();
  const router = useRouter();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty("--header-h", `${el.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // Padded down by the safe area, so on a phone its background fills the strip around the camera and
    // its contents start just under it — and no lower: a little less padding of its own on a phone.
    <header ref={ref} className="sticky top-0 z-50 border-b border-border bg-page/70 pt-[env(safe-area-inset-top)] backdrop-blur-[3px]">
      {bare ? (
        // Cleared by the page: back on the left, the page's own content in the middle, the app's icon (home) on the
        // right — the ends as wide as each other, so the middle's centred on the screen.
        <div className="relative grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2 px-4 py-2 sm:px-6 sm:py-3 md:px-1">
          <button
            type="button"
            aria-label="Back"
            title="Back"
            // Back where you came from — or, with nowhere to go back to (opened from a link), home.
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            className={HEADER_BUTTON}
          >
            <ChevronLeftIcon width={18} height={18} />
          </button>
          <div ref={setHeaderSlot} className="min-w-0" />
          <Link href="/" aria-label="Commi$h — home" title="Commi$h" className="justify-self-end text-ink-primary transition-transform active:scale-90">
            <Logo className="block h-7 sm:h-9" />
          </Link>
        </div>
      ) : (
      <>
      {/* The week centered — unless one side's too wide for that (the page tabs beside a long week, on a tablet), then just clear of it. */}
      <div className="relative grid grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 sm:py-3 md:px-1">
        {/* The app's icon, home — and from tablet width up the pages as text tabs, the one you're on lit like a map
            tag. (Back and forward sit just under the header: see HistoryButtons.) */}
        <div className="flex min-w-0 items-center gap-2 justify-self-start sm:gap-3 lg:gap-5">
          {/* From tablet width up, centered in a box the size of the profile button across the header, the same way in
              from its edge, so the two ends mirror each other. */}
          <Link
            href="/"
            aria-label="Commi$h — home"
            title="Commi$h"
            className="shrink-0 text-ink-primary transition-transform active:scale-90 md:flex md:h-9 md:w-9 md:items-center md:justify-center"
          >
            <Logo className="block h-7 sm:h-9" />
          </Link>
          <nav aria-label="Pages" className="flex items-center gap-1 max-md:hidden lg:gap-2">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={`px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide transition-colors lg:text-sm ${
                  tab.active ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>

        {phase.loaded && phase.label ? (
          <span className="flex items-baseline justify-self-center">
            {pickable ? (
              <WeekPicker
                {...pickable}
                // The NFL's own label ("Playoffs · Week 15") for the week it's in; else just the week.
                label={pickable.week === phase.week && pickable.week > 0 ? phase.label : weekLabel(pickable.week)}
              />
            ) : (
              <span className="text-lg font-extrabold uppercase tracking-wide text-ink-primary sm:text-3xl">{phase.label}</span>
            )}
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center justify-self-end gap-2 sm:gap-4">
          {/* Your record across the leagues you show (those hidden in Settings left out). */}
          {record ? <span className="text-sm font-bold tabular-nums tracking-wide text-ink-primary sm:text-lg">{record}</span> : null}
          <Link
            href={profile.href}
            aria-label={profile.label}
            title={profile.label}
            aria-current={profile.active ? "page" : undefined}
            // On a phone it's in the tab bar along the bottom (see TabBar).
            className={`${HEADER_BUTTON} max-md:hidden ${profile.active ? "border-[var(--map-tag)] bg-[var(--map-tag)] text-[var(--map-tag-ink)] hover:text-[var(--map-tag-ink)]" : ""}`}
          >
            <profile.icon width={18} height={18} />
          </Link>
        </div>
      </div>
      </>
      )}
    </header>
  );
}
