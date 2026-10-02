// Real US elevation for the dashboard's 3D terrain, as a heightfield over
// the flat 320x200 map space (same geoAlbersUsa fit as every other US path).
//
// public/terrain/us-heightfield.png is built offline from AWS Terrain Tiles
// (terrarium encoding, zoom 5 — derived from public-domain SRTM, GMTED2010,
// ETOPO1 and USGS NED data): elevation sampled one texel per map unit (texel
// i,j sits at x = i, y = j), smoothed with three 2-texel box-blur passes so
// the surface reads as landforms rather than noise, clamped at sea level,
// and packed as 16-bit meters — red is the high byte, green the low.

import { MAP_H, MAP_W, RISE_PER_METER, SLAB_HEIGHT, insideUS } from "./map-perspective";

export const HEIGHTFIELD_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/terrain/us-heightfield.png`;

export interface Heightfield {
  /** Texels across and down. */
  width: number;
  height: number;
  /** Map units per texel. */
  res: number;
  /** Elevation in meters, row-major. */
  meters: Float32Array;
  /** The highest elevation in the field, in meters. */
  peak: number;
}

let pending: Promise<Heightfield> | null = null;

/** Fetches and decodes the heightfield once per page; later calls share the result. */
export function loadHeightfield(): Promise<Heightfield> {
  pending ??= (async () => {
    const response = await fetch(HEIGHTFIELD_URL);
    if (!response.ok) throw new Error(`heightfield ${response.status}`);
    // No color management or alpha premultiplication: the bytes are data, not color.
    const bitmap = await createImageBitmap(await response.blob(), {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
    });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const meters = new Float32Array(bitmap.width * bitmap.height);
    let peak = 0;
    for (let i = 0; i < meters.length; i++) {
      meters[i] = data[i * 4] * 256 + data[i * 4 + 1];
      if (meters[i] > peak) peak = meters[i];
    }
    return { width: bitmap.width, height: bitmap.height, res: MAP_W / (bitmap.width - 1), meters, peak };
  })();
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

/** Elevation in meters at a flat-map point, bilinearly interpolated between texels. */
export function elevationAt(hf: Heightfield, x: number, y: number): number {
  const fx = Math.min(hf.width - 1, Math.max(0, x / hf.res));
  const fy = Math.min(hf.height - 1, Math.max(0, Math.min(MAP_H, y) / hf.res));
  const x0 = Math.min(hf.width - 2, Math.floor(fx));
  const y0 = Math.min(hf.height - 2, Math.floor(fy));
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (i: number, j: number) => hf.meters[j * hf.width + i];
  return (
    at(x0, y0) * (1 - tx) * (1 - ty) +
    at(x0 + 1, y0) * tx * (1 - ty) +
    at(x0, y0 + 1) * (1 - tx) * ty +
    at(x0 + 1, y0 + 1) * tx * ty
  );
}

/** The land surface's height (map units above the ground plane) at a flat-map point — the slab top plus terrain on US land, just the slab top elsewhere or before the heightfield loads. */
export function surfaceHeightAt(hf: Heightfield | null, x: number, y: number): number {
  if (!hf || !insideUS(x, y)) return SLAB_HEIGHT;
  return SLAB_HEIGHT + elevationAt(hf, x, y) * RISE_PER_METER;
}
