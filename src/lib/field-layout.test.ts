import test from "node:test";
import assert from "node:assert/strict";
import { FIELD_LONG, FIELD_WIDE, fieldRows, FieldSpot, layFields, layFocused, PHONE_ROW_GAP_PX, ROW_GAP_PX } from "./field-layout";
import { floorDepth, floorScale, floorY, HORIZON_SHARE } from "./grid-room";
import { tiltFor } from "./floor-tilt";

test("rows of fields: as many in each, the nearer ones one more where they can't be; a third row from seven", () => {
  assert.deepEqual(fieldRows(0), []);
  assert.deepEqual(fieldRows(1), [1]);
  assert.deepEqual(fieldRows(2), [1, 1]);
  assert.deepEqual(fieldRows(3), [2, 1]);
  assert.deepEqual(fieldRows(4), [2, 2]);
  assert.deepEqual(fieldRows(5), [3, 2]);
  assert.deepEqual(fieldRows(6), [3, 3]);
  assert.deepEqual(fieldRows(7), [3, 2, 2]);
  assert.deepEqual(fieldRows(8), [3, 3, 2]);
  assert.deepEqual(fieldRows(9), [3, 3, 3]);
  // No more than nine.
  assert.deepEqual(fieldRows(12), [3, 3, 3]);
});

const desk = { width: 1440, height: 900, share: HORIZON_SHARE, left: 320, right: 1120, front: 888, back: 512 };
const across = (s: FieldSpot) => FIELD_LONG * s.yard * floorScale(s.near);

test("one game: front and center, from one side of the floor to the other", () => {
  const [one] = layFields(1, desk);
  assert.ok(Math.abs(one.across) < 1e-6);
  assert.ok(Math.abs(one.near - floorDepth(desk.front, desk.height, desk.share)) < 1e-6);
  assert.ok(Math.abs(across(one) - (desk.right - desk.left)) < 1);
});

test("more games: smaller fields, all the same size, rows going back — never overlapping, all on the floor", () => {
  let last = Infinity;
  for (let n = 1; n <= 9; n++) {
    const spots = layFields(n, desk);
    assert.equal(spots.length, n);
    const yard = spots[0].yard;
    assert.ok(spots.every((s) => Math.abs(s.yard - yard) < 1e-9));
    assert.ok(yard <= last + 1e-9, `${n}`);
    last = yard;
    const back = floorDepth(desk.back, desk.height, desk.share);
    for (const s of spots) {
      assert.ok(s.near - FIELD_WIDE * s.yard >= back - 1e-6);
      // Within the floor across, at its near sideline.
      const half = across(s) / 2;
      const mid = desk.width / 2 + s.across * floorScale(s.near);
      assert.ok(mid - half >= desk.left - 1 && mid + half <= desk.right + 1, `${n}`);
    }
    // Rows don't overlap: each farther row's near sideline behind the one in front's far sideline.
    const nears = [...new Set(spots.map((s) => s.near))];
    for (let i = 1; i < nears.length; i++) assert.ok(nears[i] < nears[i - 1] - FIELD_WIDE * yard);
  }
  // Two games: one near, one far, as big as one.
  const two = layFields(2, desk);
  assert.ok(two[1].near < two[0].near);
  assert.ok(Math.abs(two[0].yard - layFields(1, desk)[0].yard) < 1e-9);
});

// From tablet width up: centered on the floor, the nearest row's outermost end lines on its sides.
const centered = { ...desk, centered: true };
/** How wide a row of fields is across the screen, `at` of the way from its far sideline to its near one. */
const spanAt = (row: FieldSpot[], at: number, tilt?: number) =>
  (FIELD_LONG * row.length + FIELD_LONG * 0.12 * (row.length - 1)) * row[0].yard * floorScale(row[0].near - FIELD_WIDE * row[0].yard * (1 - at), tilt);

/** How much floor in front of and behind a block of fields, on the screen (px) and on the floor (px back). */
function slack(spots: FieldSpot[], floor: { height: number; share: number; front: number; back: number }, tilt?: number) {
  const { height, share, front, back } = floor;
  const near = Math.max(...spots.map((s) => s.near));
  const far = Math.min(...spots.map((s) => s.near - FIELD_WIDE * s.yard));
  const y = (d: number) => floorY(d, height, share, tilt);
  return {
    screen: [front - y(near), y(far) - back],
    floor: [floorDepth(front, height, share, tilt) - near, far - floorDepth(back, height, share, tilt)],
  };
}

test("centered: however many fields, the rows centered north to south, the nearest row from one column to the other", () => {
  for (let n = 1; n <= 9; n++) {
    // At the tilt the floor's laid back to for that many (see floor-tilt).
    const tilt = tiltFor(n);
    const spots = layFields(n, { ...centered, tilt });
    assert.equal(spots.length, n);
    // Between as much screen in front of them as behind and as much floor: back of the screen's middle, short of
    // the floor's (it crowds toward the horizon).
    const { screen, floor } = slack(spots, desk, tilt);
    assert.ok(screen[0] > screen[1] - 1, `${n}: screen ${screen.map((v) => v.toFixed(1))}`);
    assert.ok(floor[1] > floor[0] - 1, `${n}: floor ${floor.map((v) => v.toFixed(1))}`);
    // The nearest row's outermost end lines on the columns' edges (a lone field's at its near sideline, the whole
    // of it clear of them; others' halfway), centered.
    const nears = [...new Set(spots.map((s) => s.near))].sort((a, b) => b - a);
    const nearest = spots.filter((s) => s.near === nears[0]);
    const span = spanAt(nearest, nearest.length === 1 ? 1 : 0.5, tilt);
    assert.ok(Math.abs(span - (desk.right - desk.left)) < 1, `${n}: ${span.toFixed(1)}`);
    assert.ok(Math.abs(nearest.reduce((a, s) => a + s.across, 0) / nearest.length) < 1e-6);
  }
  // Where the floor's too short for that (laid back far more than so few fields would have it), as big as fills it.
  const [one, two] = layFields(2, { ...centered, tilt: 60 });
  const y = (d: number) => floorY(d, desk.height, desk.share, 60);
  assert.ok(spanAt([one], 0.5, 60) < desk.right - desk.left);
  assert.ok(Math.abs(y(one.near) - desk.front) < 1 && Math.abs(y(two.near - FIELD_WIDE * two.yard) - desk.back) < 1);
});

test("a phone: the game in view across the floor however many there are, the rest smaller behind it, all centered", () => {
  const phone = { width: 393, height: 852, share: HORIZON_SHARE, left: 16, right: 377, front: 722, back: 481 };
  for (let n = 1; n <= 9; n++) {
    const spots = layFocused(n, phone);
    assert.equal(spots.length, n, `${n}`);
    const [main] = spots;
    assert.ok(Math.abs(FIELD_LONG * main.yard * floorScale(main.near) - (phone.right - phone.left)) < 1, `${n}`);
    for (const s of spots.slice(1)) {
      assert.ok(s.yard < main.yard);
      assert.ok(s.near < main.near - FIELD_WIDE * main.yard);
    }
    const { screen, floor } = slack(spots, phone);
    assert.ok(screen[0] > screen[1] - 1 && floor[1] > floor[0] - 1, `${n}`);
    assert.ok(screen[1] >= -0.5, `${n}`);
  }
  // No floor, no fields.
  assert.deepEqual(layFocused(3, { ...phone, front: phone.back }), []);
});

test("rows of fields stand clear of each other on the screen: room between them for a play's name", () => {
  const phone = { width: 393, height: 852, share: HORIZON_SHARE, left: 16, right: 377, front: 722, back: 481 };
  const layouts: [string, FieldSpot[], number, number][] = [];
  for (let n = 2; n <= 9; n++) {
    layouts.push(
      [`desk ${n}`, layFields(n, desk), desk.height, ROW_GAP_PX],
      [`centered ${n}`, layFields(n, centered), desk.height, ROW_GAP_PX],
      // On a phone, just a little apart: room there is short.
      [`phone ${n}`, layFocused(n, phone), phone.height, PHONE_ROW_GAP_PX]
    );
  }
  for (const [what, spots, height, gap] of layouts) {
    const rows = [...new Map(spots.map((s) => [s.near, s])).values()].sort((a, b) => b.near - a.near);
    for (let i = 1; i < rows.length; i++) {
      const farOfFront = floorY(rows[i - 1].near - FIELD_WIDE * rows[i - 1].yard, height, HORIZON_SHARE);
      const nearOfBack = floorY(rows[i].near, height, HORIZON_SHARE);
      assert.ok(farOfFront - nearOfBack >= gap - 0.5, `${what}: ${(farOfFront - nearOfBack).toFixed(1)}px`);
    }
  }
});
