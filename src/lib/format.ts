export function combinePoints(whole: number | undefined, decimal: number | undefined): number {
  return (whole ?? 0) + (decimal ?? 0) / 100;
}

export function formatPoints(points: number): string {
  return points.toFixed(2);
}

export function formatRecord(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function winPct(wins: number, losses: number, ties: number): number {
  const games = wins + losses + ties;
  if (games === 0) return 0;
  return (wins + ties * 0.5) / games;
}

export function formatPct(pct: number): string {
  return `${(pct * 100).toFixed(1)}%`;
}

export function displayManagerName(user: { display_name?: string; metadata?: { team_name?: string } | null } | undefined): string {
  return user?.metadata?.team_name || user?.display_name || "Unclaimed team";
}

/** Splits a name into two lines at the space closest to the midpoint, so both lines come out as close to equal length as possible. Returns null for a single word — there's no space to break on. */
export function splitNameTwoLines(name: string): [string, string] | null {
  const trimmed = name.trim();
  const mid = trimmed.length / 2;
  let bestIndex = -1;
  let bestDist = Infinity;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== " ") continue;
    const dist = Math.abs(i - mid);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  if (bestIndex === -1) return null;
  return [trimmed.slice(0, bestIndex).trim(), trimmed.slice(bestIndex + 1).trim()];
}
