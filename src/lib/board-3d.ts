// A flat board — the payouts grid — seen in the dashboard map's camera
// (cameraTransform in map-perspective.ts, with no spin), with blocks
// standing on it: the board tips back about its near edge, so its far rows
// recede and shrink, and anything raised off it lifts up the screen with its
// near-facing side showing.

/**
 * The board's tilt — its own, less than the map's (laid back as far as the
 * home page's floor, which would leave the board's rows too thin to read) —
 * and how strong its perspective is for its depth, as the map's is (FOCAL /
 * MAP_H in map-perspective.ts — copied, not imported, as that module carries
 * the whole map with it; a test keeps them in step).
 */
export const BOARD_TILT = 58;
export const BOARD_FOCAL_PER_DEPTH = 2;

/** [screen x, screen y, perspective scale] for a board point. */
export type BoardProjector = (x: number, y: number, height?: number) => [number, number, number];

/**
 * Projects points of a board `width` wide and `depth` deep — x across, y
 * from the far edge (0) to the near edge (`depth`), `height` up off it — so
 * the near edge stays put at screen y = `depth` and full scale. The
 * perspective is as strong, for the board's depth, as the map's is for its own.
 */
export function boardProjector(width: number, depth: number, tilt = BOARD_TILT): BoardProjector {
  const ts = Math.sin((tilt * Math.PI) / 180);
  const tc = Math.cos((tilt * Math.PI) / 180);
  const focal = BOARD_FOCAL_PER_DEPTH * depth;
  const cx = width / 2;
  return (x, y, height = 0) => {
    const back = depth - y;
    const up = back * tc + height * ts;
    const scale = focal / (focal + back * ts - height * tc);
    return [cx + (x - cx) * scale, depth - up * scale, scale];
  };
}

/** One visible face of a block, as an SVG polygon's points. */
export interface BlockFace {
  side: "top" | "front" | "left" | "right";
  points: string;
}

/**
 * The faces of a block on the board — footprint [x0, x1] by [y0, y1],
 * `height` tall, its bottom `bottom` up off the board (0: standing on it;
 * higher: sitting on another block) — that face the camera, ready to fill:
 * the side facing the board's middle, then the front (near) face, then the
 * top, the order they're painted in. The back never shows from this angle.
 */
export function blockFaces(
  project: BoardProjector,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  height: number,
  centerX: number,
  bottom = 0
): BlockFace[] {
  const p = (x: number, y: number, h: number) => {
    const [sx, sy] = project(x, y, h);
    return `${sx.toFixed(1)},${sy.toFixed(1)}`;
  };
  const top = bottom + height;
  const faces: BlockFace[] = [];
  // The camera sits over the board's middle: a block right of it shows its left side, one left of it its right.
  if (x0 > centerX) faces.push({ side: "left", points: [p(x0, y0, bottom), p(x0, y1, bottom), p(x0, y1, top), p(x0, y0, top)].join(" ") });
  else if (x1 < centerX) faces.push({ side: "right", points: [p(x1, y0, bottom), p(x1, y1, bottom), p(x1, y1, top), p(x1, y0, top)].join(" ") });
  faces.push({ side: "front", points: [p(x0, y1, bottom), p(x1, y1, bottom), p(x1, y1, top), p(x0, y1, top)].join(" ") });
  faces.push({ side: "top", points: [p(x0, y0, top), p(x1, y0, top), p(x1, y1, top), p(x0, y1, top)].join(" ") });
  return faces;
}
