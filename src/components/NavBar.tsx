"use client";

import { useState } from "react";
import Link from "next/link";
import { useNFLState } from "@/hooks/useNFLState";
import { useCombinedRecord } from "@/hooks/useCombinedRecord";
import { IconButton } from "@/components/ui/IconButton";
import { MenuIcon } from "@/components/ui/Icon";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/values", label: "Values" },
  { href: "/settings", label: "Settings" },
];

export function NavBar() {
  const phase = useNFLState();
  const record = useCombinedRecord();
  const [open, setOpen] = useState(false);

  return (
    <header className="relative border-b border-border bg-surface-raised">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-4">
        <Link href="/" className="justify-self-start text-lg font-semibold tracking-tight">
          <span className="text-ink-primary">BUFF</span>
          <span className="text-ink-muted">/</span>
          <span className="text-ink-primary">{phase.season ?? "—"}</span>
        </Link>

        {phase.loaded && phase.label ? (
          <span className="justify-self-center text-lg font-extrabold tracking-tight text-series-2 sm:text-2xl">
            {phase.label}
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center justify-self-end gap-4">
          {record ? (
            <span className="hidden text-lg font-semibold tracking-tight text-ink-primary sm:inline">{record}</span>
          ) : null}
          <IconButton
            icon={<MenuIcon />}
            label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          />
        </div>
      </div>
      {open ? (
        <nav className="absolute right-6 top-full z-20 mt-1 flex w-40 flex-col overflow-hidden border border-border bg-surface-raised shadow-md animate-[dropdown_0.15s_ease-out]">
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
