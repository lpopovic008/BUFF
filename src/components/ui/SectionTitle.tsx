/** A section's name over it, and what goes at its right (`aside`) — on a line, ruled under, as the room pages' are. */
export function SectionTitle({ title, aside }: { title: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-ink-primary/60 pb-1 text-xs font-bold uppercase tracking-wide text-ink-primary">
      <span className="min-w-0 truncate">{title}</span>
      {aside ? <span className="shrink-0 truncate text-[0.6875rem] text-ink-muted">{aside}</span> : null}
    </div>
  );
}
