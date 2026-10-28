// A stadium standing up off the floor map in wires (see stadium-models.ts): each part's outline on the floor, the
// same outline at its height, and its walls up its corners — drawn far bigger than it'd be, so it shows.

import { FloorMapFit, floorMapStanding } from "./floor-map";
import type { StadiumPart } from "./stadium-models";

/** How big it's drawn: map units a metre (a stadium some 350 m long about 14 units of the map's 300 or so across). */
const UNITS_PER_M = 0.04;
/** How sharp a turn in an outline is a corner its wall's drawn up (radians). */
const CORNER = 0.45;

/** Its outline on the floor, its outline up top, and its corners' walls, as screen paths — `at` its middle, in map units. */
export function stadiumWire(fit: FloorMapFit, at: [number, number], parts: StadiumPart[]): { base: string; top: string; walls: string } {
  let base = "";
  let top = "";
  let walls = "";
  const f = (n: number) => n.toFixed(1);
  for (const part of parts) {
    for (const ring of part.rings) {
      // North up the map is up its y the other way.
      const points = ring.map(([x, y]) => floorMapStanding(fit, at[0] + x * UNITS_PER_M, at[1] - y * UNITS_PER_M));
      const lift = (i: number) => points[i][1] - part.h * UNITS_PER_M * points[i][2];
      points.forEach(([x, y], i) => {
        base += `${i ? "L" : "M"}${f(x)},${f(y)}`;
        top += `${i ? "L" : "M"}${f(x)},${f(lift(i))}`;
      });
      // Its walls, up the corners (a closed outline's last point is its first).
      const n = ring.length - 1;
      for (let i = 0; i < n; i++) {
        const [a, b, c] = [ring[(i - 1 + n) % n], ring[i], ring[(i + 1) % n]];
        let turn = Math.abs(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]));
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        if (turn > CORNER) walls += `M${f(points[i][0])},${f(points[i][1])}V${f(lift(i))}`;
      }
    }
  }
  return { base, top, walls };
}
