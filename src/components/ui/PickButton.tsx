"use client";

/**
 * One pick in a page's list down the right (League history's seasons, the
 * Values page's teams): the picked one is outlined and lightly shaded.
 */
export function PickButton({
  active,
  onClick,
  title,
  subtitle,
  note,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  note: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active || undefined}
      onClick={onClick}
      className={`flex w-full flex-col gap-0.5 border px-3 py-2 text-left transition-colors ${
        active ? "border-ink-primary bg-[color-mix(in_srgb,var(--map-tag)_7%,transparent)]" : "border-border hover:border-ink-primary/40"
      }`}
    >
      <span className="flex items-baseline gap-2">
        <span className="min-w-0 truncate font-semibold text-ink-primary">{title}</span>
        {subtitle ? <span className="min-w-0 truncate text-sm text-ink-secondary">{subtitle}</span> : null}
      </span>
      <span className="min-w-0 truncate text-sm text-ink-secondary">{note}</span>
    </button>
  );
}
