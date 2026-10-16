import test from "node:test";
import assert from "node:assert/strict";
import { BOARD_FOCAL_PER_DEPTH, BOARD_TILT, blockFaces, boardProjector } from "./board-3d";
import { DEFAULT_CAMERA, FOCAL, MAP_H } from "./map-perspective";

test("the board's camera is the map's opening one", () => {
  assert.equal(BOARD_TILT, DEFAULT_CAMERA.tilt);
  assert.equal(BOARD_FOCAL_PER_DEPTH, FOCAL / MAP_H);
});

test("the near edge stays put at full scale; the far edge recedes and shrinks", () => {
  const project = boardProjector(400, 300, 32);
  const [nx, ny, ns] = project(0, 300);
  assert.deepEqual([nx, ny, ns], [0, 300, 1]);
  const [fx, fy, fs] = project(0, 0);
  assert.ok(fs < 1, "far edge is smaller");
  assert.ok(fx > 0, "and drawn in toward the middle");
  assert.ok(fy > 0 && fy < 300, "and higher up the screen, though not all the way");
  // The middle of the board stays in the middle at any depth.
  assert.equal(project(200, 0)[0], 200);
});

test("raising a point lifts it up the screen", () => {
  const project = boardProjector(400, 300, 32);
  const [, flat] = project(100, 150);
  const [, raised] = project(100, 150, 40);
  assert.ok(raised < flat);
});

test("a block shows the side facing the board's middle, its front and its top", () => {
  const project = boardProjector(400, 300, 32);
  assert.deepEqual(blockFaces(project, 10, 30, 100, 120, 20, 200).map((f) => f.side), ["right", "front", "top"]);
  assert.deepEqual(blockFaces(project, 300, 320, 100, 120, 20, 200).map((f) => f.side), ["left", "front", "top"]);
  assert.deepEqual(blockFaces(project, 190, 210, 100, 120, 20, 200).map((f) => f.side), ["front", "top"]);
});

test("a block set on another starts where that one ends", () => {
  const project = boardProjector(400, 300, 32);
  const resting = blockFaces(project, 10, 30, 100, 120, 20, 200);
  const raised = blockFaces(project, 10, 30, 100, 120, 20, 200, 20);
  // Its front face's bottom edge is the resting block's top edge.
  const frontBottom = raised.find((f) => f.side === "front")!.points.split(" ").slice(0, 2);
  const restingTop = resting.find((f) => f.side === "front")!.points.split(" ").slice(2, 4).reverse();
  assert.deepEqual(frontBottom, restingTop);
});
