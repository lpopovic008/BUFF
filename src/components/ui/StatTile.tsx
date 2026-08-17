export function StatTile({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-primary">{value}</div>
      {sublabel ? <div className="mt-0.5 text-xs text-ink-secondary">{sublabel}</div> : null}
    </div>
  );
}
