"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

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
    (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
      router.push(href);
    });
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
