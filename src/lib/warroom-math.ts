// Pure SVG/geometry math for the War Room Console widgets — kept separate
// from WarRoomConsole.tsx so it's unit-testable without rendering React.

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * A short, fixed-width label for a team/manager name — initials for a
 * multi-word name ("Matt Ly" -> "ML"), a 3-letter truncation for a single
 * word ("Karan" -> "KAR") — so a row of these never varies enough in width
 * to force a scoreboard column wider than its neighbors.
 */
export function abbreviateTeamName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Evenly spaced diamond: QB top, RB right, WR bottom, TE left.
const RADAR_ANGLES = [-90, 0, 90, 180].map((d) => (d * Math.PI) / 180);

/** 4-axis (QB/RB/WR/TE) radar polygon points, centered at (cx, cy). */
export function radarPoints(values: number[], maxR: number, cx: number, cy: number): string {
  return values
    .map((v, i) => {
      const r = maxR * (clamp(v, 0, 100) / 100);
      const x = cx + r * Math.cos(RADAR_ANGLES[i]);
      const y = cy + r * Math.sin(RADAR_ANGLES[i]);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function radarAxisPoint(maxR: number, cx: number, cy: number, i: number): [number, number] {
  const x = cx + maxR * Math.cos(RADAR_ANGLES[i]);
  const y = cy + maxR * Math.sin(RADAR_ANGLES[i]);
  return [x, y];
}

/** Analog-dial sweep: 0 -> 135deg (dial start), 100 -> 405deg (270deg sweep). */
export function gaugeDeg(value: number): number {
  return 135 + (clamp(value, 0, 100) / 100) * 270;
}

/** good/warn/critical against a team's own season-average pace for that player. */
export function ledClass(seasonAvg: number, actual: number): "good" | "warn" | "critical" {
  const ratio = seasonAvg > 0 ? actual / seasonAvg : 1;
  if (ratio >= 1.1) return "good";
  if (ratio <= 0.85) return "critical";
  return "warn";
}

const BEAT_SHAPE: [number, number][] = [
  [-0.16, 0], [-0.1, -0.12], [-0.05, 0.04], [-0.02, 0.06],
  [0, -1.0], [0.03, 0.55], [0.07, -0.08], [0.14, -0.22], [0.22, -0.02],
];

/** One EKG-style tile: flat baseline punctuated by beats. Beat count + spike height both scale with pct. */
export function heartbeatTile(pct: number, width: number): [number, number][] {
  const baseline = 15;
  const amp = 3 + (clamp(pct, 0, 100) / 100) * 12;
  const beats = Math.max(1, Math.round(1 + (clamp(pct, 0, 100) / 100) * 5));
  const spacing = width / beats;
  const pts: [number, number][] = [[0, baseline]];
  for (let i = 0; i < beats; i++) {
    const bx = spacing * (i + 0.5);
    for (const [dx, dy] of BEAT_SHAPE) {
      pts.push([clamp(bx + dx * spacing, 0, width), baseline + dy * amp]);
    }
  }
  pts.push([width, baseline]);
  return pts;
}

export function tileToPoints(pts: [number, number][], xOffset: number): string {
  return pts.map(([x, y]) => `${(x + xOffset).toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function vitalsColorVar(pct: number): string {
  if (pct >= 65) return "var(--good)";
  if (pct <= 35) return "var(--critical)";
  return "var(--amber)";
}

export function momentumPoints(series: number[], w: number, h: number, scale: number): string {
  const midY = h / 2;
  const stepX = series.length > 1 ? w / (series.length - 1) : 0;
  return series.map((v, i) => `${(i * stepX).toFixed(1)},${(midY - v * scale).toFixed(1)}`).join(" ");
}

export function formClass(pct: number): "h1" | "h2" | "h3" | "h4" | "h5" {
  if (pct < 30) return "h1";
  if (pct < 45) return "h2";
  if (pct < 60) return "h3";
  if (pct < 75) return "h4";
  return "h5";
}

export interface CityDot {
  x: number;
  y: number;
  name: string;
  city: string;
}

/**
 * Golden-angle spiral jitter so players sharing a stadium city don't stack
 * into one dot. Keyed by NFL team code (the `cityPos` map's real key) rather
 * than the display city name, so the lookup actually lands on that team's
 * real projected position instead of silently falling through to a shared
 * default for every player.
 */
export function jitterCityDots(
  players: { name: string; team: string | null }[],
  cityPos: Record<string, { pos: [number, number]; city: string }>
): CityDot[] {
  const seen: Record<string, number> = {};
  const out: CityDot[] = [];
  for (const p of players) {
    if (!p.team) continue;
    const entry = cityPos[p.team];
    if (!entry) continue;
    seen[p.team] = (seen[p.team] ?? 0) + 1;
    const k = seen[p.team];
    const ang = (k * 137.5 * Math.PI) / 180;
    const rj = (k - 1) * 4.5;
    out.push({
      x: entry.pos[0] + rj * Math.cos(ang),
      y: entry.pos[1] + rj * Math.sin(ang),
      name: p.name,
      city: entry.city,
    });
  }
  return out;
}

/** Evenly-spaced points around a circle — used for the head-to-head web's node layout. */
export function circlePoints(n: number, cx: number, cy: number, r: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}
