import assert from "node:assert/strict";
import test from "node:test";
import { assertApplicationLayout } from "./layout-checks.mjs";

const clean = {
  width: 390, scrollY: 0, overflow: false, headerOverlap: false,
  stacks: [], documentStarts: [], nestedBottomPadding: [],
};

test("horizontal list tiles may scroll but must stay on one row", () => {
  const navigation = { horizontalList: true, singleRow: true, verticalOverflow: false, scrollable: true, clipped: true };
  assertApplicationLayout({ ...clean, tabNavigation: [navigation] });
  assert.throws(() => assertApplicationLayout({ ...clean, tabNavigation: [{ ...navigation, singleRow: false }] }), /wrapped/);
  assert.throws(() => assertApplicationLayout({ ...clean, tabNavigation: [{ ...navigation, verticalOverflow: true }] }), /vertically clipped/);
  assert.throws(() => assertApplicationLayout({ ...clean, tabNavigation: [{ ...navigation, horizontalList: false }] }), /scrollable or clipped tab/);
});

test("primary actions retain their size, order and reachable start", () => {
  const rail = { singleRow: true, undersized: false, unreachableStart: false, overlap: false };
  assertApplicationLayout({ ...clean, actionRails: [rail] });
  for (const [key, value, message] of [
    ["singleRow", false, /wrapped primary/],
    ["undersized", true, /Large control/],
    ["unreachableStart", true, /unreachable start/],
    ["overlap", true, /overlapping primary/],
  ]) {
    assert.throws(() => assertApplicationLayout({ ...clean, actionRails: [{ ...rail, [key]: value }] }), message);
  }
});
