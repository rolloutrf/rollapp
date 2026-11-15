import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { sourceRectangles, sourceScaleTable, sourceSubscaleCharts } from "./identity-report-source-layout.js";

// Only structure comes from these rules. Every displayed word comes from a PDF item.
export const IDENTITY_PDF_LAYOUT_VERSION = 2;
const normalize = (text) => text.replaceAll("\u00a0", " ").replace(/\s+/g, " ").trim();
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] || 10;
const numeric = (text) => /^\d+[.)]?%?$/.test(text.trim());
function dominantFont(items) {
  const weights = new Map();
  for (const item of items) weights.set(item.font, (weights.get(item.font) || 0) + item.text.length);
  return [...weights].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function gaps(items, start, end) {
  const ranges = items.map((item) => [item[start], item[end]]).sort((a, b) => a[0] - b[0]);
  const result = [];
  let edge = ranges[0]?.[1] || 0;
  for (const [from, to] of ranges.slice(1)) {
    if (from > edge) result.push({ from: edge, to: from, size: from - edge });
    edge = Math.max(edge, to);
  }
  return result.sort((a, b) => b.size - a.size);
}

function rowsFromItems(items) {
  const rows = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let row = rows.find((entry) => Math.abs(entry.y - item.y) <= Math.min(entry.size, item.size) * 0.2);
    if (!row) { row = { y: item.y, size: item.size, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  const superscripts = new Set();
  for (const row of rows) {
    if (!/^[®™¹²³⁰⁴⁵⁶⁷⁸⁹*]+$/u.test(row.items.map((item) => item.text).join(""))) continue;
    const parent = rows.find((candidate) => candidate !== row && candidate.size > row.size * 1.5 && row.y >= candidate.y && row.y - candidate.y < candidate.size * 0.75 && row.items[0].x >= Math.min(...candidate.items.map((item) => item.x)) && row.items[0].x <= Math.max(...candidate.items.map((item) => item.right)) + candidate.size * 0.5);
    if (parent) { parent.items.push(...row.items.map((item) => ({ ...item, superscript: true }))); superscripts.add(row); }
  }
  return rows.filter((row) => !superscripts.has(row)).sort((a, b) => b.y - a.y).map((row) => {
    const sorted = row.items.sort((a, b) => a.x - b.x);
    return {
      text: normalize(sorted.map((item, index) => `${index && !item.superscript ? " " : ""}${item.text}`).join("")),
      runs: sorted.map((item, index) => ({ text: `${index && !item.superscript ? " " : ""}${normalize(item.text)}`, bold: Boolean(item.bold), italic: Boolean(item.italic), superscript: item.superscript })),
      labelColor: sorted.find((item) => item.labelColor)?.labelColor,
      bold: sorted.every((item) => item.bold === undefined) ? undefined : sorted.filter((item) => item.bold).reduce((sum, item) => sum + item.text.length, 0) > sorted.reduce((sum, item) => sum + item.text.length, 0) * 0.85,
      x: sorted[0].x, y: row.y,
      right: Math.max(...sorted.map((item) => item.right)),
      font: dominantFont(sorted),
      size: median(sorted.flatMap((item) => Array(Math.min(item.text.length, 80)).fill(item.size))),
    };
  });
}

// Whitespace separates page bands, then independent columns. Numeric columns stay
// with their labels so scores and list numbers cannot become detached from them.
function readingRegions(items, bodySize, depth = 0) {
  if (items.length < 2 || depth > 20) return [rowsFromItems(items)];
  const horizontal = gaps(items, "bottom", "top").find((gap) => gap.size > bodySize * 1.8);
  if (horizontal) {
    const split = (horizontal.from + horizontal.to) / 2;
    return [
      ...readingRegions(items.filter((item) => item.bottom >= split), bodySize, depth + 1),
      ...readingRegions(items.filter((item) => item.top <= split), bodySize, depth + 1),
    ];
  }
  const vertical = gaps(items, "x", "right").find((gap) => {
    if (gap.size < bodySize * 1.6) return false;
    const split = (gap.from + gap.to) / 2;
    const sides = [items.filter((item) => item.right <= split), items.filter((item) => item.x >= split)];
    return sides.every((side) => side.length >= 3 && side.filter((item) => numeric(item.text)).length < side.length * 0.6);
  });
  if (vertical) {
    const split = (vertical.from + vertical.to) / 2;
    return [
      ...readingRegions(items.filter((item) => item.right <= split), bodySize, depth + 1),
      ...readingRegions(items.filter((item) => item.x >= split), bodySize, depth + 1),
    ];
  }
  return [rowsFromItems(items)];
}

function listItem(text) {
  const match = text.match(/^(?:(\d{1,3})([.)])|([•●▪◦]))\s+(.+)$/u);
  return match ? { number: match[1] ? Number(match[1]) : null, marker: match[1] ? `${match[1]}${match[2]}` : match[3], text: match[4] } : null;
}

function heading(row, bodySize, bodyFont) {
  const letters = row.text.replace(/[^\p{L}]/gu, "");
  const uppercase = letters.length >= 4 && row.text.length < 140 && letters === letters.toLocaleUpperCase();
  if (row.size >= bodySize * 1.7) return 3;
  if (uppercase && row.bold && row.size < bodySize * 0.95) return 6;
  if (row.size >= bodySize * 1.2 || uppercase) return 4;
  if ((row.bold ?? (row.font && row.font !== bodyFont)) && row.text.length < 120 && !/[.!?]|\|/u.test(row.text) && letters.length >= 4) return 5;
  return null;
}

function formatRegion(rows, bodySize, bodyFont, pageHeight) {
  const blocks = [];
  const regionWidth = Math.max(...rows.map((row) => row.right)) - Math.min(...rows.map((row) => row.x));
  let previous;
  let listX;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const last = blocks.at(-1);
    const gap = previous ? previous.y - row.y : Infinity;
    const nearby = gap >= 0 && gap <= Math.max(row.size, previous?.size || 0) * 1.8;
    const score = row.text.match(/^(.+\p{L}.*?)\s+([+-]?\d+(?:[.,]\d+)?%?)$/u);
    let scoreCount = 0;
    for (let next = index; next < rows.length && /^(.+\p{L}.*?)\s+([+-]?\d+(?:[.,]\d+)?%?)$/u.test(rows[next].text); next += 1) scoreCount += 1;
    const caption = row.size < bodySize * 0.8 || row.y < pageHeight * 0.055 || /^(?:Copyright|©|Leadership Forecast)/i.test(row.text) || /\|.*\d{1,2}[./-]\d{1,2}[./-]\d{4}/u.test(row.text);
    const metadata = /^(?:Отч[её]т для|Дата|Report for|Date)\s*:/iu.test(row.text);
    const item = listItem(row.text);
    const level = caption || metadata || (item && row.size < bodySize * 1.7) ? null : heading(row, bodySize, bodyFont);
    const labels = [];
    if (!caption && !level && !item && !score) {
      for (let next = index; next < rows.length; next += 1) {
        const candidate = rows[next];
        if (candidate.font !== bodyFont || candidate.text.length > 85 || /[.!?:;\d]/u.test(candidate.text) || heading(candidate, bodySize, bodyFont) || listItem(candidate.text)) break;
        if (next > index && rows[next - 1].y - candidate.y > bodySize * 1.8) break;
        labels.push(candidate);
      }
    }
    const rightAlignedLabels = labels.length >= 3
      && Math.max(...labels.map((entry) => entry.right)) - Math.min(...labels.map((entry) => entry.right)) < bodySize
      && Math.max(...labels.map((entry) => entry.x)) - Math.min(...labels.map((entry) => entry.x)) > bodySize * 1.5;
    if (rightAlignedLabels) {
      blocks.push({ type: "list", ordered: false, plain: true, items: labels.map((entry) => ({ marker: "", text: entry.text })) });
      index += labels.length - 1;
      previous = rows[index];
      continue;
    }
    if (score && (scoreCount >= 3 || last?.type === "table")) {
      if (last?.type === "table") last.rows.push([score[1], score[2]]);
      else blocks.push({ type: "table", rows: [[score[1], score[2]]] });
    } else if (metadata) {
      blocks.push({ type: "metadata", text: row.text, runs: row.runs });
    } else if (caption) {
      if (last?.type === "caption" && nearby) { last.text += ` ${row.text}`; last.runs.push({ text: " " }, ...row.runs); }
      else blocks.push({ type: "caption", text: row.text, runs: row.runs });
    } else if (row.labelColor) {
      blocks.push({ type: "label", text: row.text, color: row.labelColor });
    } else if (level) {
      if (last?.type === "heading" && nearby && Math.abs(row.size - previous.size) < 1 && row.font === previous.font) { last.text += ` ${row.text}`; last.runs.push({ text: " " }, ...row.runs); }
      else blocks.push({ type: "heading", level, text: row.text, runs: row.runs });
    } else if (item) {
      let skip = row.text.length - item.text.length;
      item.runs = row.runs.map((run) => {
        const clipped = { ...run, text: run.text.slice(skip) };
        skip = Math.max(0, skip - run.text.length);
        return clipped;
      }).filter((run) => run.text);
      const ordered = item.number !== null;
      if (last?.type === "list" && !last.plain && last.ordered === ordered) last.items.push(item);
      else blocks.push({ type: "list", ordered, items: [item] });
      listX = row.x;
    } else if (last?.type === "list" && !last.plain && nearby && row.x > listX + bodySize * 0.5) {
      last.items.at(-1).text += ` ${row.text}`;
      last.items.at(-1).runs.push({ text: " " }, ...row.runs);
    } else if (last?.type === "paragraph" && nearby && Math.abs(row.size - previous.size) < 1 && previous.right - previous.x >= regionWidth * 0.55) {
      last.text += ` ${row.text}`;
      last.runs.push({ text: " " }, ...row.runs);
    } else {
      blocks.push({ type: "paragraph", text: row.text, runs: row.runs });
    }
    previous = row;
  }
  return blocks;
}

export function formatIdentityPdfPage(items, height) {
  if (!items.length) return [];
  const bodySize = median(items.flatMap((item) => Array(Math.min(item.text.length, 80)).fill(item.size)));
  const bodyFont = dominantFont(items);
  return readingRegions(items, bodySize).flatMap((rows) => formatRegion(rows, bodySize, bodyFont, height));
}

function sourceColor(color) {
  if (!/^#[0-9a-f]{6}$/iu.test(color)) return false;
  const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  return Math.max(...channels) - Math.min(...channels) > 40;
}

export function formatIdentityPdfSourcePage(items, height, rectangles = []) {
  const structured = sourceScaleTable(items) || sourceSubscaleCharts(items, rectangles);
  if (structured) {
    const rest = items.filter((item) => !structured.used.has(item));
    return [
      ...formatIdentityPdfPage(rest.filter((item) => item.y > structured.top), height),
      structured.block,
      ...formatIdentityPdfPage(rest.filter((item) => item.y <= structured.top), height),
    ];
  }
  const features = [];
  const used = new Set();
  for (const stripe of rectangles.filter((rect) => rect.width >= 2 && rect.width <= 4 && rect.height > 20 && rect.x < 100 && sourceColor(rect.color))) {
    const content = items.filter((item) => !used.has(item) && item.y >= stripe.y && item.y <= stripe.y + stripe.height && item.x >= stripe.x + stripe.width);
    if (content.reduce((sum, item) => sum + item.text.length, 0) < 40) continue;
    content.forEach((item) => used.add(item));
    features.push({ top: stripe.y + stripe.height, block: { type: "source-emphasis", color: stripe.color, blocks: formatIdentityPdfPage(content, height) } });
  }
  const ribbon = rectangles.filter((rect) => rect.width > 3 && rect.width < 5 && rect.height > 20 && rect.height < 60);
  if (ribbon.length === 34 && Math.max(...ribbon.map((rect) => rect.y)) - Math.min(...ribbon.map((rect) => rect.y)) < 1) {
    features.push({ top: ribbon[0].y + ribbon[0].height, block: { type: "rank-chart", cells: ribbon.sort((a, b) => a.x - b.x).map((rect) => rect.color) } });
  }
  let remaining = items.filter((item) => !used.has(item));
  const formatted = [];
  for (const feature of features.sort((a, b) => b.top - a.top)) {
    formatted.push(...formatIdentityPdfPage(remaining.filter((item) => item.y > feature.top), height), feature.block);
    remaining = remaining.filter((item) => item.y <= feature.top);
  }
  formatted.push(...formatIdentityPdfPage(remaining, height));
  return formatted.map((block) => {
    if (block.type !== "table" || block.rows.some((row) => row.length !== 2)) return block;
    const rows = block.rows.map(([label, value]) => {
      const source = items.find((item) => item.text.trim() === label);
      const bar = source && rectangles.find((rect) => sourceColor(rect.color) && rect.x > source.right && rect.y <= source.y + 2 && rect.y + rect.height >= source.y && rect.height > 3 && rect.height < 12);
      return bar && Number(value) >= 0 && Number(value) <= 100 ? { label, value, color: bar.color } : null;
    });
    return rows.every(Boolean) ? { type: "score-chart", rows } : block;
  });
}

export async function extractIdentityPdfLayout(buffer) {
  let pdf;
  try {
    pdf = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      const operations = await page.getOperatorList();
      const rectangles = sourceRectangles(operations);
      const textItems = items.filter((item) => item.str?.trim() && Array.isArray(item.transform)).map((item) => {
        const size = Math.hypot(item.transform[0], item.transform[1]) || item.height || 10;
        const x = item.transform[4];
        const y = item.transform[5];
        let font = "";
        try { font = page.commonObjs.get(item.fontName)?.name || ""; } catch { /* A missing font name does not discard readable source text. */ }
        const label = item.str.length < 80 && item.str === item.str.toLocaleUpperCase() && rectangles.find((rect) => sourceColor(rect.color) && rect.height < size * 2.2 && rect.width > size * 3 && x >= rect.x - 1 && y >= rect.y && x + item.width <= rect.x + rect.width + 1 && y <= rect.y + rect.height);
        return { text: item.str, font: item.fontName, bold: font ? /bold|demi|black/iu.test(font) : undefined, italic: /italic|oblique/iu.test(font), labelColor: label?.color, size, x, y, right: x + item.width, bottom: y, top: y + size };
      });
      pages.push({ number, blocks: formatIdentityPdfSourcePage(textItems, page.view[3] - page.view[1], rectangles) });
      page.cleanup();
    }
    return { version: IDENTITY_PDF_LAYOUT_VERSION, pages };
  } finally {
    await pdf?.destroy?.();
  }
}
