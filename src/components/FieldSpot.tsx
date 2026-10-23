/** Every ten yards, goal line to goal line. */
const TICKS = Array.from({ length: 11 }, (_, i) => i * 10);

/**
 * Where the ball is in a live game, as a little diagram stretched across the
 * room it's given: the field a line in the theme's ink (black, or white in dark
 * mode) with a tick up from it every ten yards — the goal lines and the 50 a
 * little taller — and the ball's yard line over it, a slim triangle beside the
 * number on the side the offense is going. ESPN doesn't say which end
 * of the stadium a team is attacking (teams switch ends every quarter), so the
 * field is laid out the same way all game: the home team's goal line on the
 * left, the home team driving right and the visitors left.
 */
export function FieldSpot({ yardsToEndzone, homeOffense }: { yardsToEndzone: number; homeOffense: boolean }) {
  // How far the ball is from the home team's goal line, 0–100.
  const fromHomeGoal = homeOffense ? 100 - yardsToEndzone : yardsToEndzone;
  const yard = Math.min(yardsToEndzone, 100 - yardsToEndzone);
  return (
    <span className="relative block h-[1.125rem] w-[90%]" aria-hidden>
      {/* The ticks run down to the field line's bottom edge, flush with it. */}
      {TICKS.map((t) => (
        <span
          key={t}
          className={`absolute bottom-0 w-px -translate-x-1/2 bg-ink-primary ${t % 50 === 0 ? "h-[6px]" : "h-[4px]"}`}
          style={{ left: `${t}%` }}
        />
      ))}
      <span className="absolute inset-x-0 bottom-0 h-[1.5px] bg-ink-primary" />
      {/* Centered over the ball — even at the goal line — with a triangle longer than it is wide beside it, on the
          side it points: toward the goal the offense is driving at. */}
      <span
        className="absolute top-0 -translate-x-1/2 text-[0.5rem] font-bold leading-none tabular-nums text-ink-primary"
        style={{ left: `${fromHomeGoal}%` }}
      >
        <span className="relative">
          {yard}
          <svg
            viewBox="0 0 7 5"
            className={`absolute top-1/2 h-[5px] w-[7px] -translate-y-1/2 ${homeOffense ? "left-full ml-0.5" : "right-full mr-0.5 -scale-x-100"}`}
          >
            <path d="M7,2.5 L0,0 L0,5 Z" fill="var(--color-ink-primary)" />
          </svg>
        </span>
      </span>
    </span>
  );
}

/** A little football, beside the team with the ball. */
export function PossessionMark() {
  return (
    <svg viewBox="0 0 12 7" className="h-[7px] w-3 shrink-0" aria-label="Has the ball">
      <ellipse cx={6} cy={3.5} rx={6} ry={3.5} fill="var(--color-ink-primary)" />
      <path d="M3.5,3.5 H8.5 M4.75,2.5 V4.5 M6,2.5 V4.5 M7.25,2.5 V4.5" stroke="var(--page)" strokeWidth={0.7} />
    </svg>
  );
}
