import assert from "node:assert/strict";
import test from "node:test";
import { privateHistoryPaths } from "./private-history-pre-push.mjs";

test("push guard detects personal blobs in ancestors even after deletion from the current tree", () => {
  assert.deepEqual(privateHistoryPaths(["abc src/data/cv.md", "def server/contacts-data.js", "ghi public/avatars/fixture.jpeg", "jkl src/components/cv-resume.jsx", "mno server/lab-results.js", "pqr"]), ["src/data/cv.md", "server/contacts-data.js", "public/avatars/fixture.jpeg"]);
  assert.deepEqual(privateHistoryPaths(["abc src/data/personal-values.js", "def server/private-data-import.js"]), []);
  assert.deepEqual(privateHistoryPaths(["abc server/lab-results-data.test.js", "def server/lab-results.test.js"]), ["server/lab-results-data.test.js"]);
});
