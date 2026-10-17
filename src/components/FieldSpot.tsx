/** The field line's thickness. */
const FIELD_LINE = 1.5;

/**
 * Where the ball is in a live game, as a little diagram: the field a
 * green line with short green ticks at the two goal lines and the 50 — half
 * the line's height, so the yard line fits above them — and a slim triangle
 * at the ball, pointing the way the offense is going, its yard line centered
 * over it. ESPN doesn't say which end of the stadium a team is attacking
 * (teams switch ends every quarter), so the field is laid out the same way all
 * game: the home team's goal line on the left, the home team driving right
 * and the visitors left.
 */
export function FieldSpot({ yardsToEndzone, homeOffense }: { yardsToEndzone: number; homeOffense: boolean }) {
  const left = 2;
  const right = 62;
  const ground = 13.5;
  // How far the ball is from the home team's goal line, 0–100.
  const fromHomeGoal = homeOffense ? 100 - yardsToEndzone : yardsToEndzone;
  const x = left + ((right - left) * fromHomeGoal) / 100;
  const yard = Math.min(yardsToEndzone, 100 - yardsToEndzone);
  // A triangle longer than it is wide, centered on the ball, its tip toward the goal it's driving at.
  const dir = homeOffense ? 1 : -1;
  const half = 2.75;
  const wide = 1.6;
  return (
    <svg viewBox="0 0 64 15" className="h-auto w-16 min-w-0 max-w-full overflow-visible" aria-hidden>
      {/* The ticks run down to the field line's bottom edge, flush with it. */}
      {[left, (left + right) / 2, right].map((tx) => (
        <line key={tx} x1={tx} y1={ground + FIELD_LINE / 2} x2={tx} y2={ground - 4.5} stroke="var(--color-status-good)" strokeWidth={1} />
      ))}
      <line x1={left} y1={ground} x2={right} y2={ground} stroke="var(--color-status-good)" strokeWidth={FIELD_LINE} />
      <path
        d={`M${x + dir * half},${ground} L${x - dir * half},${ground - wide} L${x - dir * half},${ground + wide} Z`}
        fill="var(--color-ink-primary)"
      />
      {/* Always centered over the ball, even at the goal line. */}
      <text x={x} y={6.5} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--color-ink-primary)" className="tabular-nums">
        {yard}
      </text>
    </svg>
  );
}
