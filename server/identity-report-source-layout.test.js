import assert from "node:assert/strict";
import test from "node:test";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { sourceRectangles, sourceScaleTable, sourceSubscaleCharts } from "./identity-report-source-layout.js";
const item = (text, x, y, width = 70) => ({ text, x, y, right: x + width, size: 10 });

test("source scale table keeps multiline labels and descriptions attached to their score", () => {
  const items = [item("ШКАЛА", 40, 650), item("%", 170, 650), item("ОПРЕДЕЛЕНИЯ ШКАЛ", 200, 650), item("Hogan Personality Inventory", 230, 620),
    item("Первая", 40, 596), item("шкала", 40, 586), item("5", 170, 591), item("Первое описание", 200, 596), item("с продолжением.", 200, 586),
    item("Вторая шкала", 40, 560), item("84", 170, 560), item("Второе описание.", 200, 560),
    item("Третья шкала", 40, 535), item("2", 170, 535), item("Третье описание.", 200, 535)];
  const result = sourceScaleTable(items);
  assert.deepEqual(result.block.headers, ["ШКАЛА", "%", "ОПРЕДЕЛЕНИЯ ШКАЛ"]);
  assert.deepEqual(result.block.rows[1], ["Первая шкала", "5", "Первое описание с продолжением."]);
  assert.equal(result.used.size, items.length);
});

test("source rectangles retain the painted color and saved PDF coordinate transforms", () => {
  const path = [0, 0, 0, 1, 10, 0, 1, 10, 4, 1, 0, 4, 3];
  const operations = { fnArray: [OPS.save, OPS.transform, OPS.setFillRGBColor, OPS.constructPath, OPS.restore, OPS.constructPath], argsArray: [null, [2, 0, 0, 2, 100, 200], ["#ffb000"], [OPS.fill, [path], [0, 0, 10, 4]], null, [OPS.fill, [path], [0, 0, 10, 4]]] };
  assert.deepEqual(sourceRectangles(operations), [{ x: 100, y: 200, width: 20, height: 8, color: "#ffb000" }, { x: 0, y: 0, width: 10, height: 4, color: "#000000" }]);
});

test("source subscale charts preserve every painted segment and its original label", () => {
  const items = [], rectangles = [];
  for (let column = 0; column < 3; column += 1) {
    const x = 30 + column * 180;
    items.push(item("Баллы по субшкалам", x, 700), item(`Группа ${column + 1}`, x, 660));
    for (let row = 0; row < 9; row += 1) {
      const y = 640 - row * 14;
      items.push(item(`Подшкала ${row + 1}`, x, y, 85));
      for (let cell = 0; cell < 4; cell += 1) rectangles.push({ x: x + 100 + cell * 14, y, width: 11, height: 4, color: cell <= row % 4 ? "#ffb000" : "#e6e7e8" });
    }
  }
  const result = sourceSubscaleCharts(items, rectangles);
  assert.equal(result.used.size, items.length);
  assert.deepEqual(result.block.columns.map((column) => column.code), ["HPI", "HDS", "MVPI"]);
  assert.deepEqual(result.block.columns[0].sections[0].rows[0], { label: "Подшкала 1", cells: ["#ffb000", "#e6e7e8", "#e6e7e8", "#e6e7e8"] });
  assert.equal(result.block.columns.reduce((sum, column) => sum + column.sections.reduce((n, section) => n + section.rows.reduce((m, row) => m + row.cells.length, 0), 0), 0), rectangles.length);
});
