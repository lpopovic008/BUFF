"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNFLState } from "@/hooks/useNFLState";
import { useCombinedRecord } from "@/hooks/useCombinedRecord";
import { IconButton } from "@/components/ui/IconButton";
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
      className="text-sm font-bold tabular-nums text-ink-primary animate-[fade-in_0.2s_ease-out] sm:text-lg"
      title="Next kickoff"
    >
      {formatCountdown(target - now)}
    </span>
  );
}

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
    <header ref={ref} className="sticky top-0 z-50 border-b border-border bg-surface-raised">
      <div className="relative mx-auto grid max-w-[90rem] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="justify-self-start text-lg font-semibold tracking-tight">
          <span className="text-ink-primary">Commi$h</span>
          <span className="text-ink-muted">/</span>
          <span className="text-ink-primary">{phase.season ?? "—"}</span>
        </Link>

        {phase.loaded && phase.label ? (
          <span className="flex items-baseline gap-2 justify-self-center sm:gap-3">
            <span className="text-lg font-extrabold tracking-tight text-series-2 sm:text-2xl">{phase.label}</span>
            {/* The dashboard's next-kickoff clock, while it's scrolled out of view. */}
            {kickoff !== null ? <HeaderKickoffClock key={kickoff} target={kickoff} /> : null}
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center justify-self-end gap-4">
          {record ? (
            <span className="hidden text-lg font-semibold tracking-tight text-ink-primary sm:inline">{record}</span>
          ) : null}
          <IconButton
            icon={<MenuIcon />}
            label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          />
        </div>
        {open ? (
          <nav className="absolute right-4 top-full z-20 mt-1 flex w-40 flex-col overflow-hidden border border-border bg-surface-raised shadow-md animate-[dropdown_0.15s_ease-out] sm:right-6 lg:right-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-page hover:text-ink-primary"
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
