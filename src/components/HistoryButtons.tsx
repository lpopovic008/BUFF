"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/Icon";

// The size of the page's other icon buttons (IconButton "md"), so they line up on one row.
const HISTORY_BUTTON =
  "flex h-9 w-9 shrink-0 items-center justify-center border border-grid bg-page text-ink-secondary transition-colors hover:text-ink-primary active:scale-90 disabled:opacity-30 disabled:hover:text-ink-secondary";

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
      <button type="button" aria-label="Back" title="Back" disabled={!canGoBack} onClick={() => router.back()} className={HISTORY_BUTTON}>
        <ChevronLeftIcon />
      </button>
      <button type="button" aria-label="Forward" title="Forward" disabled={!canGoForward} onClick={() => router.forward()} className={HISTORY_BUTTON}>
        <ChevronRightIcon />
      </button>
    </div>
  );
}

/**
 * A page's title with the back/forward buttons, and the page's own buttons
 * (`actions`) if it has any. On a phone the buttons share the top line —
 * back/forward on the left, the page's on the right — with the title on the
 * line below; from tablet width up it's one line: back/forward, the title,
 * then the page's buttons at the right edge.
 */
export function TitleWithHistory({
  children,
  actions,
  className = "",
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 md:grid-cols-[auto_minmax(0,1fr)_auto] ${className}`}>
      <HistoryButtons />
      {actions ? <div className="flex items-center gap-2 justify-self-end md:order-last">{actions}</div> : null}
      <div className="col-span-2 min-w-0 md:col-span-1">{children}</div>
    </div>
  );
}
