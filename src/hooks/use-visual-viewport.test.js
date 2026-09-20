import assert from "node:assert/strict";
import test from "node:test";
import { measureVisualViewport } from "./use-visual-viewport.js";

for (const [name, input, expected] of [
  ["overlay keyboard", { innerHeight: 844, visualViewport: { height: 471, offsetTop: 0, scale: 1 } }, { height: 471, offsetTop: 0, bottomInset: 373, keyboard: true }],
  ["already resized layout viewport", { innerHeight: 471, visualViewport: { height: 471, offsetTop: 0 } }, { height: 471, offsetTop: 0, bottomInset: 0, keyboard: false }],
  ["layout viewport fallback", { innerHeight: 844 }, { height: 844, offsetTop: 0, bottomInset: 0, keyboard: false }],
  ["iOS viewport panning", { innerHeight: 844, visualViewport: { height: 471, offsetTop: 80 } }, { height: 471, offsetTop: 80, bottomInset: 293, keyboard: true }],
  ["browser chrome is not a keyboard", { innerHeight: 844, visualViewport: { height: 800, offsetTop: 0 } }, { height: 800, offsetTop: 0, bottomInset: 44, keyboard: false }],
  ["pinch zoom preserves layout", { innerHeight: 844, visualViewport: { height: 422, offsetTop: 90, scale: 2 } }, { height: 844, offsetTop: 0, bottomInset: 0, keyboard: false }],
  ["rotation with stale viewport metrics", { innerHeight: 390, visualViewport: { height: 844, offsetTop: 45 } }, { height: 390, offsetTop: 0, bottomInset: 0, keyboard: false }],
  ["elastic negative offset", { innerHeight: 844, visualViewport: { height: 471, offsetTop: -10 } }, { height: 471, offsetTop: 0, bottomInset: 373, keyboard: true }],
]) {
  test(`visual viewport: ${name}`, () => assert.deepEqual(measureVisualViewport(input), expected));
}
