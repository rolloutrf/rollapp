import assert from "node:assert/strict";
import test from "node:test";
import { flattenLabReport, labReportStatus, mergeLabReportsByDate } from "./lab-results.js";

// Generated examples, deliberately unrelated to any imported patient record.
const date = "2030-02-01";
const item = (code, value, extra = {}) => ({ code, name: `Synthetic indicator ${code}`, value, unit: "synthetic units", reference: "", status: "normal", ...extra });
const report = (id, items, extra = {}) => ({ id, date, lab: `Synthetic laboratory ${id}`, groups: [{ id: "synthetic-panel", title: "Synthetic panel", items }], ...extra });

test("summaries handle generated values and empty owners without patient defaults", () => {
  const source = report("summary", [item("A", "1"), item("B", "2", { status: "high" })]);
  assert.equal(flattenLabReport(source).length, 2);
  assert.deepEqual(labReportStatus(source), { resultCount: 2, attentionCount: 1 });
  assert.deepEqual(mergeLabReportsByDate([]), []);
});

test("same-date merge prefers uploaded values and retains missing source fields without converting units", () => {
  const uploaded = report("upload", [item("A", "7"), item("B", "14", { unit: "new units" })], {
    source: { uploadId: "synthetic-upload", uploaded: true, filename: "synthetic.pdf", pdfUrl: "/synthetic.pdf", uploadedAt: "2030-02-02T10:00:00Z" },
  });
  const baseline = report("baseline", [
    item("A", "5", { reference: "1–9" }),
    item("B", "3", { unit: "old units", reference: "2–20" }),
    item("C", "21", { reference: "10–30" }),
  ]);
  const merged = mergeLabReportsByDate([baseline, uploaded]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, `lab-${date}`);
  assert.deepEqual(merged[0].labs, [uploaded.lab, baseline.lab]);
  const rows = flattenLabReport(merged[0]);
  assert.deepEqual(rows.map(row => [row.code, row.value]), [["A", "7"], ["B", "14"], ["C", "21"]]);
  assert.equal(rows[0].reference, "1–9");
  assert.equal(rows[1].unit, "new units");
  assert.equal(rows[1].reference, "2–20");
  assert.equal("variants" in rows[1], false);
  assert.equal(merged[0].source.uploadId, "synthetic-upload");
  assert.equal(merged[0].sources[0].pdfUrl, "/synthetic.pdf");
  assert.deepEqual(flattenLabReport(uploaded).map(row => row.value), ["7", "14"]);
});
