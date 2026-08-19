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
    // Safety net: never hang the transition if nothing mutates.
    const timeout = setTimeout(finish, 1500);
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
