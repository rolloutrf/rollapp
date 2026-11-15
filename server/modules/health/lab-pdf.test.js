import assert from "node:assert/strict";
import test from "node:test";
import { isPdfBuffer, LabPdfError, parseLabText } from "./lab-pdf.js";

function flatten(report) {
  return report.groups.flatMap((group) => group.items);
}

test("parseLabText extracts dated laboratory results and derives their statuses", () => {
  const report = parseLabText([
    "ИНВИТРО Санкт-Петербург",
    "Дата взятия биоматериала: 30.08.2026",
    "АлАТ 52 Ед/л < 41",
    "Глюкоза 5,1 ммоль/л 4,1–6,0",
    "Лейкоциты 4,24 тыс/мкл 4,5–11",
    "Липопротеин (а) 42 мг/дл < 30",
  ], { id: "report-1", filename: "result.pdf", uploadedAt: new Date("2026-08-30T12:00:00Z") });

  assert.equal(report.id, "report-1");
  assert.equal(report.date, "2026-08-30");
  assert.equal(report.dateLabel, "30 августа 2026");
  assert.equal(report.lab, "ИНВИТРО");

  const items = flatten(report);
  assert.deepEqual(
    items.map((item) => [item.name, item.value, item.unit, item.reference, item.status]),
    [
      ["АлАТ", "52", "Ед/л", "< 41", "high"],
      ["Глюкоза", "5,1", "ммоль/л", "4,1–6,0", "normal"],
      ["Лейкоциты", "4,24", "тыс/мкл", "4,5–11", "low"],
      ["Липопротеин (а)", "42", "мг/дл", "< 30", "high"],
    ],
  );
});

test("parseLabText falls back to the upload date when a report date is absent", () => {
  const report = parseLabText("Ферритин 58,2 нг/мл 24–425", {
    uploadedAt: new Date("2026-08-29T21:15:00Z"),
  });
  assert.equal(report.date, "2026-08-29");
});

test("parseLabText reports PDFs without usable results", () => {
  assert.throws(
    () => parseLabText("Это скан без таблицы результатов"),
    (error) => error instanceof LabPdfError && error.code === "LAB_PDF_NO_RESULTS",
  );
  assert.throws(
    () => parseLabText(""),
    (error) => error instanceof LabPdfError && error.code === "LAB_PDF_NO_TEXT",
  );
});

test("isPdfBuffer verifies the PDF signature", () => {
  assert.equal(isPdfBuffer(Buffer.from("%PDF-1.7\n")), true);
  assert.equal(isPdfBuffer(Buffer.from("not a pdf")), false);
});
