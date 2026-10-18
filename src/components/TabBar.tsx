"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardIcon, HomeIcon, StandingsIcon, TrendIcon, UserIcon } from "@/components/ui/Icon";

const tabClass = (active: boolean) =>
  `flex h-full items-center justify-center transition-colors ${
    active ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-secondary hover:text-ink-primary active:scale-90"
  }`;

/**
 * On a phone, the app's pages along the bottom of the screen: Profile & settings,
 * Leagues, Home, Values and Draft — the header's menu is left to wider screens.
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

  const at = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const tabs = [
    { href: "/settings", label: "Profile & settings", icon: UserIcon, active: at("/settings") },
    { href: "/league", label: "Leagues", icon: StandingsIcon, active: at("/league") || at("/team") },
    { href: "/", label: "Home", icon: HomeIcon, active: pathname === "/" },
    { href: "/values", label: "Values", icon: TrendIcon, active: at("/values") },
    { href: "/draft", label: "Draft", icon: ClipboardIcon, active: at("/draft") },
  ];
  return (
    <nav
      ref={ref}
      aria-label="Pages"
      // Flush with the screen's bottom edge — no room left under the buttons.
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-page/95 backdrop-blur [transform:translateZ(0)] md:hidden"
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
