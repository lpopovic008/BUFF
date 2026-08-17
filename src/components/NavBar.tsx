"use client";

import { useState } from "react";
import Link from "next/link";
import { useNFLState } from "@/hooks/useNFLState";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/values", label: "Values" },
  { href: "/settings", label: "Settings" },
];

export function NavBar() {
  const phase = useNFLState();
  const [open, setOpen] = useState(false);

  return (
    <header className="relative border-b border-border bg-surface-raised">
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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-page hover:text-ink-primary"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <line x1="3" y1="5" x2="17" y2="5" />
            <line x1="3" y1="10" x2="17" y2="10" />
            <line x1="3" y1="15" x2="17" y2="15" />
          </svg>
        </button>
      </div>
      {open ? (
        <nav className="absolute right-6 top-full z-20 mt-1 flex w-40 flex-col overflow-hidden rounded-md border border-border bg-surface-raised shadow-md">
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
    </header>
  );
}
