"use client";

import { useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/Icon";
import { HEADER_BUTTON } from "@/components/NavBar";

interface NavigationLike extends EventTarget {
  canGoBack: boolean;
  canGoForward: boolean;
}

/**
 * Whether the browser has a page to go back or forward to, as "10"-style
 * flags, where the Navigation API can tell; elsewhere both read as available.
 */
function useHistoryFlags(): { canGoBack: boolean; canGoForward: boolean } {
  const flags = useSyncExternalStore(
    (onChange) => {
      const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
      nav?.addEventListener("currententrychange", onChange);
      return () => nav?.removeEventListener("currententrychange", onChange);
    },
    () => {
      const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
      return nav ? `${nav.canGoBack ? 1 : 0}${nav.canGoForward ? 1 : 0}` : "11";
    },
    () => "11"
  );
  return { canGoBack: flags[0] === "1", canGoForward: flags[1] === "1" };
}

/**
 * Back and forward through what you've browsed, at the top left of the page
 * just under the header (and under the league ticker on the dashboard).
 */
export function HistoryButtons() {
  const router = useRouter();
  const { canGoBack, canGoForward } = useHistoryFlags();
  return (
    <div className="flex gap-1">
      <button type="button" aria-label="Back" title="Back" disabled={!canGoBack} onClick={() => router.back()} className={HEADER_BUTTON}>
        <ChevronLeftIcon />
      </button>
      <button type="button" aria-label="Forward" title="Forward" disabled={!canGoForward} onClick={() => router.forward()} className={HEADER_BUTTON}>
        <ChevronRightIcon />
      </button>
    </div>
  );
}

/** The back/forward buttons at the top of every page but the dashboard, which places its own under its league ticker. */
export function PageHistoryButtons() {
  if (usePathname() === "/") return null;
  return (
    <div className="mb-0.5">
      <HistoryButtons />
    </div>
  );
}
