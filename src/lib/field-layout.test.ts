import test from "node:test";
import assert from "node:assert/strict";
import { FIELD_LONG, FIELD_WIDE, fieldRows, FieldSpot, layFields, layFocused, PHONE_ROW_GAP_PX, ROW_GAP_PX } from "./field-layout";
import { floorDepth, floorScale, floorY, HORIZON_SHARE, lowestGridLine } from "./grid-room";

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

// From tablet width up: laid around the middle of the floor, one game's field a box up from the screen's bottom.
const middle = { ...desk, anchor: lowestGridLine(desk.height, desk.share) };
const mid = (s: FieldSpot) => s.near - (FIELD_WIDE * s.yard) / 2;
const fitsAcross = (s: FieldSpot, floor = desk) => {
  const half = across(s) / 2;
  const at = floor.width / 2 + s.across * floorScale(s.near);
  return at - half >= floor.left - 1 && at + half <= floor.right + 1;
};

test("around the middle: one game a box up from the front, across the floor; two rows either side of its middle", () => {
  const [one] = layFields(1, middle);
  assert.ok(Math.abs(one.near - floorDepth(middle.anchor, desk.height, desk.share)) < 1e-6);
  assert.ok(Math.abs(across(one) - (desk.right - desk.left)) < 1);
  const center = mid(one);
  for (const n of [2, 3, 4, 5, 6]) {
    const spots = layFields(n, middle);
    assert.equal(spots.length, n);
    const nears = [...new Set(spots.map((s) => s.near))];
    assert.equal(nears.length, 2);
    // The gap between the rows on the middle, on the screen.
    const y = (d: number) => floorY(d, desk.height, desk.share);
    const gapMid = (y(nears[0] - FIELD_WIDE * spots[0].yard) + y(nears[1])) / 2;
    assert.ok(Math.abs(gapMid - y(center)) < 1e-3, `${n}`);
    assert.ok(spots.every((s) => fitsAcross(s)), `${n}`);
  }
});

test("around the middle: three rows, the middle one on it from one side of the floor to the other, the nearest wider", () => {
  const center = mid(layFields(1, middle)[0]);
  for (const n of [7, 8, 9]) {
    const spots = layFields(n, middle);
    assert.equal(spots.length, n);
    const rows = [...new Set(spots.map((s) => s.near))];
    assert.equal(rows.length, 3);
    const second = spots.filter((s) => s.near === rows[1]);
    assert.ok(Math.abs(mid(second[0]) - center) < 1e-6, `${n}`);
    // Never past the floor's front or back.
    assert.ok(rows[0] <= floorDepth(desk.front, desk.height, desk.share) + 1e-6);
    assert.ok(rows[2] - FIELD_WIDE * spots[0].yard >= floorDepth(desk.back, desk.height, desk.share) - 1e-6);
  }
  // Nine: the middle row from one side to the other; the nearest out past them.
  const nine = layFields(9, middle);
  const [near, mid2] = [nine.slice(0, 3), nine.slice(3, 6)];
  const span = (row: FieldSpot[]) => (FIELD_LONG * row.length + FIELD_LONG * 0.12 * (row.length - 1)) * row[0].yard * floorScale(row[0].near);
  assert.ok(Math.abs(span(mid2) - (desk.right - desk.left)) < 1);
  assert.ok(span(near) > desk.right - desk.left);
});

test("a phone: the game in view as big however many there are, the rest smaller behind it", () => {
  const phone = { width: 393, height: 852, share: HORIZON_SHARE, left: 16, right: 377, front: 722, back: 481 };
  const one = layFocused(1, phone);
  for (let n = 2; n <= 9; n++) {
    const spots = layFocused(n, phone);
    assert.equal(spots.length, n, `${n}`);
    assert.deepEqual(spots[0], one[0]);
    for (const s of spots.slice(1)) {
      assert.ok(s.yard < spots[0].yard);
      assert.ok(s.near < spots[0].near - FIELD_WIDE * spots[0].yard);
    }
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
      [`middle ${n}`, layFields(n, middle), desk.height, ROW_GAP_PX],
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
