import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractIdentityPdfLayout, formatIdentityPdfPage } from "./identity-report-layout.js";

const item = (text, x, y, size = 10, width = text.length * size * 0.4) => ({ text, x, y, size, right: x + width, bottom: y, top: y + size });
const characters = (value) => [...value.replace(/\s/gu, "")].sort().join("");
function blockText(block) {
  if (block.type === "rank-chart") return "";
  if (block.type === "source-emphasis") return block.blocks.map(blockText).join(" ");
  if (block.type === "score-chart") return block.rows.map((row) => `${row.label} ${row.value}`).join(" ");
  if (block.type === "subscale-charts") return block.columns.map((column) => `${column.title} ${column.sections.map((section) => `${section.title} ${section.rows.map((row) => row.label).join(" ")}`).join(" ")}`).join(" ");
  if (block.type === "table") return [...(block.headers || []), ...block.rows.flat()].join(" ");
  if (block.type === "list") return block.items.map((entry) => `${entry.marker} ${entry.text}`).join(" ");
  return block.text;
}

test("PDF layout restores headings, paragraph breaks, score rows and list continuation", () => {
  const blocks = formatIdentityPdfPage([
    item("ВВЕДЕНИЕ", 40, 700, 24),
    item("Первая строка", 40, 660), item("продолжает абзац.", 40, 646),
    item("Новый абзац.", 40, 623),
    item("Адаптация 5", 40, 590), item("Амбициозность 84", 40, 576), item("Общительность 2", 40, 562),
    item("1. Начало пункта", 40, 530), item("его продолжение", 53, 516), item("и завершение.", 53, 502),
    item("2. Второй пункт", 40, 480),
  ], 792);
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[1].text, "Первая строка продолжает абзац.");
  assert.equal(blocks[2].text, "Новый абзац.");
  assert.deepEqual(blocks.find((block) => block.type === "table").rows, [["Адаптация", "5"], ["Амбициозность", "84"], ["Общительность", "2"]]);
  const lists = blocks.filter((block) => block.type === "list");
  assert.equal(lists[0].items[0].text, "Начало пункта его продолжение и завершение.");
  assert.equal(lists.flatMap((block) => block.items).at(-1).number, 2);
});

test("PDF layout reads independent columns without interleaving their lines", () => {
  const blocks = formatIdentityPdfPage([
    item("Левая первая", 40, 600), item("левая вторая", 40, 586), item("левая третья.", 40, 572),
    item("Правая первая", 300, 600), item("правая вторая", 300, 586), item("правая третья.", 300, 572),
  ], 792);
  assert.deepEqual(blocks.map((block) => block.text), ["Левая первая левая вторая левая третья.", "Правая первая правая вторая правая третья."]);
});

test("PDF layout retains source subheadings and right-aligned label groups", () => {
  const blocks = formatIdentityPdfPage([
    { ...item("Подраздел", 40, 700), font: "emphasis" },
    { ...item("Первая длинная строка основного текста", 40, 686), font: "body" },
    { ...item("с продолжением абзаца.", 40, 672), font: "body" },
    { ...item("Субшкалы", 40, 630), font: "emphasis" },
    { ...item("Короткая", 100, 616, 10, 50), font: "body" },
    { ...item("Более длинная", 80, 602, 10, 70), font: "body" },
    { ...item("Третья", 115, 588, 10, 35), font: "body" },
  ], 792);
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[1].text, "Первая длинная строка основного текста с продолжением абзаца.");
  assert.equal(blocks.at(-1).plain, true);
  assert.deepEqual(blocks.at(-1).items.map((entry) => entry.text), ["Короткая", "Более длинная", "Третья"]);
});

test("PDF layout keeps every source character in the bundled Gallup report", async () => {
  const buffer = await readFile(new URL("../src/assets/gallup/cliftonstrengths-34.pdf", import.meta.url));
  const layout = await extractIdentityPdfLayout(buffer);
  const pdf = await getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
  try {
    assert.equal(layout.pages.length, pdf.numPages);
    for (const page of layout.pages) {
      const source = await (await pdf.getPage(page.number)).getTextContent();
      const original = source.items.map((entry) => entry.str || "").join(" ").replaceAll("\u00a0", " ");
      assert.equal(characters(page.blocks.map(blockText).join(" ")), characters(original), `page ${page.number}: source content changed`);
    }
    assert(layout.pages.some((page) => page.blocks.some((block) => block.type === "heading")));
    assert.equal(layout.pages[2].blocks.filter((block) => block.type === "source-emphasis").length, 5);
    assert.equal(layout.pages[2].blocks.find((block) => block.type === "rank-chart").cells.length, 34);
    assert(layout.pages[2].blocks.find((block) => block.type === "heading" && block.text.startsWith("1. Learner")).runs.some((run) => run.superscript));
    assert(!layout.pages[2].blocks.some((block) => block.text === "®"));
    assert(layout.pages[2].blocks.find((block) => block.text?.startsWith("These Strengths Insights")).runs.some((run) => run.italic));
    for (const block of layout.pages.flatMap((page) => page.blocks)) {
      if (block.runs) assert.equal(block.runs.map((run) => run.text).join(""), block.text);
      if (block.type === "list") for (const item of block.items) if (item.runs) assert.equal(item.runs.map((run) => run.text).join(""), item.text);
    }
    assert(layout.pages.some((page) => page.blocks.some((block) => block.type === "list")));
  } finally { await pdf.destroy(); }
});
