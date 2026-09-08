import test from "node:test";
import assert from "node:assert/strict";
import { ariaSortFor, nextSortState, sortRows, SortState } from "./table-sort";

interface Row {
  name: string;
  points: number;
  finish: number | null;
}

const rows: Row[] = [
  { name: "Charlie", points: 10, finish: 3 },
  { name: "alice", points: 30, finish: null },
  { name: "Bob", points: 20, finish: 1 },
];

const valueOf = (row: Row, key: string): string | number | null =>
  key === "name" ? row.name : key === "points" ? row.points : row.finish;

const names = (list: Row[]) => list.map((r) => r.name);

test("a column cycles descending, then ascending, then back to unsorted", () => {
  const first = nextSortState(null, "points");
  assert.deepEqual(first, { key: "points", direction: "desc" });
  const second = nextSortState(first, "points");
  assert.deepEqual(second, { key: "points", direction: "asc" });
  assert.equal(nextSortState(second, "points"), null);
});

test("clicking a different column restarts the cycle on that column", () => {
  const state: SortState = { key: "points", direction: "asc" };
  assert.deepEqual(nextSortState(state, "name"), { key: "name", direction: "desc" });
});

test("an unsorted table is handed back in its original order, untouched", () => {
  const result = sortRows(rows, null, valueOf);
  assert.equal(result, rows); // same reference — nothing copied or reordered
});

test("numbers sort numerically in both directions", () => {
  assert.deepEqual(names(sortRows(rows, { key: "points", direction: "desc" }, valueOf)), [
    "alice",
    "Bob",
    "Charlie",
  ]);
  assert.deepEqual(names(sortRows(rows, { key: "points", direction: "asc" }, valueOf)), [
    "Charlie",
    "Bob",
    "alice",
  ]);
});

test("text sorts case-insensitively rather than by character code", () => {
  // A naive comparison would put lowercase "alice" after uppercase "Charlie".
  assert.deepEqual(names(sortRows(rows, { key: "name", direction: "asc" }, valueOf)), [
    "alice",
    "Bob",
    "Charlie",
  ]);
});

test("rows with no value stay at the bottom whichever way the column points", () => {
  const desc = names(sortRows(rows, { key: "finish", direction: "desc" }, valueOf));
  const asc = names(sortRows(rows, { key: "finish", direction: "asc" }, valueOf));
  assert.equal(desc.at(-1), "alice"); // no finish recorded
  assert.equal(asc.at(-1), "alice");
  assert.deepEqual(asc.slice(0, 2), ["Bob", "Charlie"]);
});

test("ties keep their original relative order", () => {
  const tied: Row[] = [
    { name: "first", points: 5, finish: 1 },
    { name: "second", points: 5, finish: 1 },
    { name: "third", points: 5, finish: 1 },
  ];
  assert.deepEqual(names(sortRows(tied, { key: "points", direction: "desc" }, valueOf)), [
    "first",
    "second",
    "third",
  ]);
});

test("sorting never mutates the caller's array", () => {
  const original = [...rows];
  sortRows(rows, { key: "points", direction: "asc" }, valueOf);
  assert.deepEqual(rows, original);
});

test("headers report their sort state to screen readers", () => {
  assert.equal(ariaSortFor(null, "points"), "none");
  assert.equal(ariaSortFor({ key: "name", direction: "asc" }, "points"), "none");
  assert.equal(ariaSortFor({ key: "points", direction: "asc" }, "points"), "ascending");
  assert.equal(ariaSortFor({ key: "points", direction: "desc" }, "points"), "descending");
});
