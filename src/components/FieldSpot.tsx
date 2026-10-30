/** A little football, beside the team with the ball. */
export function PossessionMark() {
  return (
    <svg viewBox="0 0 12 7" className="h-[7px] w-3 shrink-0" aria-label="Has the ball">
      <ellipse cx={6} cy={3.5} rx={6} ry={3.5} fill="var(--color-ink-primary)" />
      <path d="M3.5,3.5 H8.5 M4.75,2.5 V4.5 M6,2.5 V4.5 M7.25,2.5 V4.5" stroke="var(--page)" strokeWidth={0.7} />
    </svg>
  );
}
