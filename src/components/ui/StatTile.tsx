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
    <div className="px-1">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-primary">{value}</div>
      {sublabel ? <div className="mt-0.5 text-xs text-ink-secondary">{sublabel}</div> : null}
    </div>
  );
}
