import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function NavBar() {
  return (
    <header className="border-b border-border bg-surface-raised">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink-primary">
          BUFF <span className="font-normal text-ink-muted">/ Fantasy HQ</span>
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
