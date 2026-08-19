"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

/**
 * Waits for the App Router's client-side navigation to actually paint new
 * content, since router.push() itself returns void — nothing to await.
 * Without this, document.startViewTransition() captures its "after"
 * snapshot before React has re-rendered anything, so old and new look
 * identical and no animation is visible even though the API ran fine.
 *
 * While this promise is pending, startViewTransition freezes the page on a
 * static screenshot of the old state — nothing visibly responds. That's
 * invisible when the destination route is already prefetched (mutation
 * lands within a couple of frames), but if it isn't — no hover-prefetch on
 * touch devices, a slow connection — router.push has to fetch the route's
 * chunk over the network first, and nothing mutates until it lands. The
 * cap below has to stay short: it's not a rare safety net, it's the ceiling
 * on how long the whole app can look frozen. Missing it just means this one
 * navigation skips the morph and falls through to a normal, unfrozen load.
 */
function waitForRender(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timeout);
      // A couple of frames so the new DOM has actually painted before the
      // transition takes its "after" screenshot.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    const observer = new MutationObserver(finish);
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = setTimeout(finish, 200);
  });
}

/**
 * Same as next/link, but on a plain left-click it wraps the navigation in
 * document.startViewTransition() when the browser supports it, so elements
 * sharing a view-transition-name (set via inline style) morph smoothly
 * between this page and the next instead of hard-cutting. Falls through to
 * ordinary Link navigation on unsupported browsers, and for modified clicks
 * (cmd/ctrl/shift/middle-click) so "open in new tab" keeps working.
 */
export function ViewTransitionLink({
  href,
  children,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (typeof document === "undefined" || !("startViewTransition" in document)) return;
    e.preventDefault();
    (
      document as Document & { startViewTransition: (cb: () => void | Promise<void>) => void }
    ).startViewTransition(() => {
      const rendered = waitForRender();
      router.push(href);
      return rendered;
    });
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
