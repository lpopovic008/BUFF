"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, StandingsIcon, SwapIcon, TrendIcon, UserIcon } from "@/components/ui/Icon";

/** The app's pages, in order, and whether each is the one at `pathname` — the phone's tab bar and the header's tabs alike. */
export function appPages(pathname: string) {
  const at = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return [
    { href: "/settings", label: "Profile & settings", icon: UserIcon, active: at("/settings") },
    { href: "/league", label: "Leagues", icon: StandingsIcon, active: at("/league") || at("/team") },
    { href: "/", label: "Home", icon: HomeIcon, active: pathname === "/" },
    { href: "/values", label: "Values", icon: TrendIcon, active: at("/values") },
    { href: "/monitor", label: "Trade Monitor", icon: SwapIcon, active: at("/monitor") },
  ];
}

const tabClass = (active: boolean) =>
  `flex h-full items-center justify-center transition-colors ${
    active ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-secondary hover:text-ink-primary active:scale-90"
  }`;

/**
 * On a phone, the app's pages along the bottom of the screen: Profile & settings,
 * Leagues, Home, Values and the Trade Monitor — wider, the header has them (see NavBar).
 * It publishes its height as --tabbar-h, so the page leaves room for it under its end.
 */
export function TabBar() {
  const pathname = usePathname();
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

  const tabs = appPages(pathname);
  return (
    <nav
      ref={ref}
      aria-label="Pages"
      // Its background down to the screen's bottom edge, its icons as far above the phone's home indicator as that is
      // above the screen's bottom, 8px: the indicator's top is 21px under the safe area's (13px up an iPhone's 34px),
      // and the icons 21px up their row, so the row's bottom sits 34px under the safe area's top — at the screen's
      // bottom on an iPhone. On the home page, see-through to the room's floor under it.
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-border pb-[max(0px,calc(env(safe-area-inset-bottom)-34px))] [transform:translateZ(0)] md:hidden ${
        pathname === "/" ? "bg-page/40" : "bg-page/95 backdrop-blur"
      }`}
    >
      <div className="grid h-16 grid-cols-5">
        {tabs.map(({ href, label, icon: Icon, active }) => (
          <Link key={href} href={href} aria-label={label} title={label} aria-current={active ? "page" : undefined} className={tabClass(active)}>
            <Icon width={22} height={22} />
          </Link>
        ))}
      </div>
    </nav>
  );
}
