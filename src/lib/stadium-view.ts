// The close look at a stadium (see FloorStadiums): the floor zoomed in on it till it all but fills the floor that's
// free on the screen, a little of what's round it showing.

import { cameraPutting, MAX_ZOOM, MIN_ZOOM } from "./floor-camera";
import { FloorMapFit, floorMapFloor } from "./floor-map";
import { FloorCamera, floorAt } from "./grid-room";
import { placeStadium } from "./stadium-clay";
import type { StadiumPart } from "./stadium-models";

/** What's kept clear round it: above (a share of the free floor's height, for the overshoot as it pops up), and px. */
const TOP_GAP = 0.12;
const PAD = 8;

/**
 * The floor's camera on the stadium (`parts`) standing `at` (map units) on the map as it lies (`fit`): as close as it
 * can be with all of it — as it's drawn, its near side much bigger than its far — on the floor that's free (`free`,
 * screen px: left of a starters list beside it, over the map's buttons), its foot at the bottom, middled across.
 */
export function stadiumCamera(fit: FloorMapFit, at: [number, number], parts: StadiumPart[], free: { left: number; right: number; bottom: number }): FloorCamera {
  const horizon = fit.height * fit.share;
  const room = { left: free.left + PAD, right: free.right - PAD, top: horizon + TOP_GAP * (free.bottom - horizon), bottom: free.bottom - PAD };
  const grab = floorMapFloor(fit, at[0], at[1]);
  const boxOf = (camera: FloorCamera) => placeStadium({ ...fit, camera }, at, parts, 1, false).box;
  // As zoomed as `zoom`, its foot on the bottom and middled across: where its middle shows, found by halving.
  const settle = (zoom: number) => {
    let across = (room.left + room.right) / 2;
    let camera = cameraPutting(grab, [0, 0], zoom);
    let box = boxOf(camera);
    for (let pass = 0; pass < 3; pass++) {
      let [lo, hi] = [horizon + 1, room.bottom];
      for (let i = 0; i < 20; i++) {
        const y = (lo + hi) / 2;
        camera = cameraPutting(grab, floorAt(across, y, fit.width, fit.height, fit.share), zoom);
        box = boxOf(camera);
        if (box[3] > room.bottom) hi = y;
        else lo = y;
      }
      camera = cameraPutting(grab, floorAt(across, lo, fit.width, fit.height, fit.share), zoom);
      box = boxOf(camera);
      across += (room.left + room.right) / 2 - (box[0] + box[2]) / 2;
    }
    return { camera, box };
  };
  const fits = ({ box }: { box: [number, number, number, number] }) => box[1] >= room.top && box[0] >= room.left - 1 && box[2] <= room.right + 1;
  // The closest it all fits, found by halving (in steps of zoom alike near and far).
  let [lo, hi] = [Math.log(MIN_ZOOM), Math.log(MAX_ZOOM)];
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (fits(settle(Math.exp(mid)))) lo = mid;
    else hi = mid;
  }
  return settle(Math.exp(lo)).camera;
}
