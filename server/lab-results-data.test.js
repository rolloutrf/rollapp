import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LAB_REPORTS, LAB_TRENDS, flattenLabReport, labReportStatus, mergeLabReportsByDate,
} from "./lab-results-data.js";

test("lab reports keep the three source dates in reverse chronological order", () => {
  assert.deepEqual(LAB_REPORTS.map((report) => report.date), ["2026-07-15", "2025-08-10", "2025-07-07"]);
  assert.equal(new Set(LAB_REPORTS.map((report) => report.id)).size, LAB_REPORTS.length);
});

test("the 2026 report contains every transcribed row and no flagged result", () => {
  const latest = LAB_REPORTS[0];
  assert.equal(flattenLabReport(latest).length, 23);
  assert.deepEqual(labReportStatus(latest), { resultCount: 23, attentionCount: 0 });
});

test("historical flags remain attached to the source results", () => {
  const flagged = LAB_REPORTS.flatMap(flattenLabReport).filter((item) => ["low", "high"].includes(item.status));
  assert.deepEqual(flagged.map((item) => item.name), [
    "Лейкоциты",
    "Лимфоциты",
    "Витамин B9 · фолиевая кислота",
    "Витамин D · 25-OH",
  ]);
});

test("each trend preserves all three source dates", () => {
  for (const trend of LAB_TRENDS) {
    assert.deepEqual(trend.points.map((point) => point.date), ["07.07.25", "10.08.25", "15.07.26"]);
  }
});

test("reports from the same date keep only the freshest result for every analyte", () => {
  const reports = mergeLabReportsByDate([
    {
      id: "uploaded",
      date: "2026-07-15",
      dateLabel: "15 июля 2026",
      lab: "ИНВИТРО",
      groups: [{
        id: "biochemistry",
        title: "Биохимия",
        items: [
          { name: "Глюкоза", value: "5,1", unit: "ммоль/л", reference: "", status: "normal" },
          { code: "CREA", name: "Креатинин", value: "92", unit: "мкмоль/л", reference: "", status: "normal" },
        ],
      }],
      source: { uploaded: true, filename: "invitro.pdf", pdfUrl: "/invitro.pdf", uploadedAt: "2026-07-16T10:00:00Z" },
    },
    {
      id: "built-in",
      date: "2026-07-15",
      dateLabel: "15 июля 2026",
      lab: "ИНВИТРО СПб",
      groups: [{
        id: "biochemistry",
        title: "Биохимия",
        items: [
          { name: "Глюкоза", value: "5,1", unit: "ммоль/л", reference: "4,1–6", status: "normal" },
          { code: "CREA", name: "Креатинин", value: "9,1", unit: "мг/л", reference: "64–104", status: "normal" },
          { name: "АлАТ", value: "39", unit: "Ед/л", reference: "< 41", status: "normal" },
        ],
      }],
    },
  ]);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].id, "lab-2026-07-15");
  assert.deepEqual(reports[0].labs, ["ИНВИТРО", "ИНВИТРО СПб"]);
  assert.deepEqual(reports[0].groups[0].items.map((item) => [item.name, item.value]), [
    ["Глюкоза", "5,1"],
    ["Креатинин", "92"],
    ["АлАТ", "39"],
  ]);
  assert.equal(reports[0].groups[0].items[0].reference, "4,1–6");
  assert.deepEqual(reports[0].groups[0].items[1], {
    code: "CREA",
    name: "Креатинин",
    value: "92",
    unit: "мкмоль/л",
    reference: "64–104",
    status: "normal",
    secondary: undefined,
    note: undefined,
  });
  assert.equal("variants" in reports[0].groups[0].items[1], false);
  assert.equal(reports[0].sources[0].pdfUrl, "/invitro.pdf");
});
