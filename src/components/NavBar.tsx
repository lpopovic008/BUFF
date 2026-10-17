"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNFLState } from "@/hooks/useNFLState";
import { useCombinedRecord } from "@/hooks/useCombinedRecord";
import { MenuIcon } from "@/components/ui/Icon";
import { useHeaderWeek } from "@/lib/header-week";
import { WeekPicker, weekLabel } from "@/components/WeekPicker";

/** The menu's pages — in the header's menu from tablet width up, the tab bar's on a phone. */
export const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/values", label: "Values" },
  { href: "/draft", label: "Draft" },
  { href: "/settings", label: "Settings" },
];

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);

  // An open menu closes on any click or tap outside it (or Escape), not only on picking a page.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menu.current?.contains(target) || menuButton.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
    <header ref={ref} className="sticky top-0 z-50 border-b border-border bg-page/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 sm:py-3 md:px-1">
        {/* The wordmark — a map tag. (Back and forward sit just under the header: see HistoryButtons.) */}
        <div className="flex items-center gap-2 justify-self-start sm:gap-3">
          <Link
            href="/"
            className="bg-[var(--map-tag)] px-1.5 text-sm font-bold leading-relaxed text-[var(--map-tag-ink)] sm:px-2 sm:text-lg"
          >
            COMMI$H
          </Link>
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
          <button
            ref={menuButton}
            type="button"
            aria-label="Menu"
            title="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            // On a phone the menu is in the tab bar along the bottom (see TabBar).
            className={`${HEADER_BUTTON} max-md:hidden`}
          >
            <MenuIcon />
          </button>
        </div>
        {open ? (
          <nav
            ref={menu}
            className="absolute right-4 top-full z-20 mt-1 flex w-40 flex-col overflow-hidden border border-grid bg-page shadow-md animate-[dropdown_0.15s_ease-out] sm:right-6 md:right-1"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-ink-secondary transition-colors hover:bg-[var(--map-tag)] hover:text-[var(--map-tag-ink)]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
