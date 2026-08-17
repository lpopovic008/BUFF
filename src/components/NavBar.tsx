"use client";

import Link from "next/link";
import { useNFLState } from "@/hooks/useNFLState";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function NavBar() {
  const phase = useNFLState();

  return (
    <header className="border-b border-border bg-surface-raised">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
          <span className="text-ink-primary">BUFF</span>
          {phase.loaded && phase.label ? (
            <span className="text-ink-secondary">
              <span className="text-ink-muted">/</span> {phase.label}
              {phase.season ? <span className="text-ink-muted"> {phase.season}</span> : null}
            </span>
          ) : null}
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-page hover:text-ink-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
