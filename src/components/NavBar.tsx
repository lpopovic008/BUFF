"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNFLState } from "@/hooks/useNFLState";
import { useCombinedRecord } from "@/hooks/useCombinedRecord";
import { MenuIcon } from "@/components/ui/Icon";
import { formatCountdown } from "@/lib/format";
import { useHeaderKickoff } from "@/lib/header-clock";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/values", label: "Values" },
  { href: "/draft", label: "Draft" },
  { href: "/settings", label: "Settings" },
];

/** The next-kickoff countdown, ticking each second, once the dashboard hands it up (see header-clock.ts). */
function HeaderKickoffClock({ target }: { target: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, []);
  if (now === null || target <= now) return null;
  return (
    <span
      className="text-base font-bold tabular-nums text-ink-secondary animate-[fade-in_0.2s_ease-out] sm:text-2xl"
      title="Next kickoff"
    >
      {formatCountdown(target - now)}
    </span>
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
  const kickoff = useHeaderKickoff();
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
    const publish = () => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={ref} className="sticky top-0 z-50 border-b border-border bg-page/95 backdrop-blur">
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 md:px-1">
        {/* The wordmark — a map tag. (Back and forward sit just under the header: see HistoryButtons.) */}
        <div className="flex items-center gap-2 justify-self-start sm:gap-3">
          <Link
            href="/"
            className="bg-[var(--map-tag)] px-1.5 text-sm font-bold leading-relaxed text-[var(--map-tag-ink)] sm:px-2 sm:text-lg"
          >
            Commi$h
          </Link>
        </div>

        {phase.loaded && phase.label ? (
          <span className="flex items-baseline gap-2 justify-self-center sm:gap-4">
            <span className="text-lg font-extrabold uppercase tracking-wide text-ink-primary sm:text-3xl">{phase.label}</span>
            {/* The dashboard's next-kickoff clock, while it's scrolled out of view. */}
            {kickoff !== null ? <HeaderKickoffClock key={kickoff} target={kickoff} /> : null}
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center justify-self-end gap-4">
          {record ? (
            <span className="hidden text-lg font-bold tabular-nums tracking-wide text-ink-primary sm:inline">{record}</span>
          ) : null}
          <button
            ref={menuButton}
            type="button"
            aria-label="Menu"
            title="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={HEADER_BUTTON}
          >
            <MenuIcon />
          </button>
        </div>
        {open ? (
          <nav
            ref={menu}
            className="absolute right-4 top-full z-20 mt-1 flex w-40 flex-col overflow-hidden border border-grid bg-page shadow-md animate-[dropdown_0.15s_ease-out] sm:right-6 md:right-1"
          >
            {links.map((link) => (
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
