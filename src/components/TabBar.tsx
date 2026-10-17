"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DocumentIcon, FootballIcon, HomeIcon, MenuIcon, StandingsIcon } from "@/components/ui/Icon";
import { NAV_LINKS } from "@/components/NavBar";

const TAB = "flex h-full items-center justify-center transition-colors";
const tabClass = (active: boolean) =>
  `${TAB} ${active ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-secondary hover:text-ink-primary active:scale-90"}`;

/**
 * On a phone, the common pages along the bottom of the screen: Games (still
 * to come), Leagues, Home, Write-ups and the menu — the header's own menu
 * button is left to wider screens. It publishes its height as --tabbar-h, so
 * the page leaves room for it under its end.
 */
export function TabBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement.style;
    const publish = () => root.setProperty("--tabbar-h", `${el.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty("--tabbar-h");
    };
  }, []);

  // The menu closes on any tap outside the bar (or Escape).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
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

  const at = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return (
    <nav
      ref={ref}
      aria-label="Pages"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {open ? (
        <div className="absolute bottom-full right-2 mb-1 flex w-40 flex-col overflow-hidden border border-grid bg-page shadow-md animate-[dropdown_0.15s_ease-out]">
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
        </div>
      ) : null}
      <div className="grid h-12 grid-cols-5">
        {/* Games: still to be designed. */}
        <span className={`${TAB} text-ink-muted opacity-40`} aria-disabled title="Games — coming soon" aria-label="Games — coming soon">
          <FootballIcon width={22} height={22} />
        </span>
        <Link href="/league" aria-label="Leagues" title="Leagues" className={tabClass(at("/league") || at("/team"))}>
          <StandingsIcon width={22} height={22} />
        </Link>
        <Link href="/" aria-label="Home" title="Home" className={tabClass(pathname === "/")}>
          <HomeIcon width={22} height={22} />
        </Link>
        <Link href="/recap" aria-label="Write-ups" title="Write-ups" className={tabClass(at("/recap"))}>
          <DocumentIcon width={22} height={22} />
        </Link>
        <button type="button" aria-label="Menu" title="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={tabClass(open)}>
          <MenuIcon width={22} height={22} />
        </button>
      </div>
    </nav>
  );
}
