import { OPS, Util } from "pdfjs-dist/legacy/build/pdf.mjs";

const text = (items) => [...items].sort((a, b) => b.y - a.y || a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
const point = (x, y, m) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// Read the actual painted rectangles, including the transformation stack. Counts
// are never inferred from scale names, percentiles or an interpretation of a score.
export function sourceRectangles(operations) {
  let state = { matrix: [1, 0, 0, 1, 0, 0], color: "#000000" };
  const stack = [];
  const rectangles = [];
  operations.fnArray.forEach((operation, index) => {
    const args = operations.argsArray[index];
    if (operation === OPS.save) stack.push({ ...state, matrix: [...state.matrix] });
    if (operation === OPS.restore) state = stack.pop() || state;
    if (operation === OPS.transform) state.matrix = Util.transform(state.matrix, args);
    if (operation === OPS.setFillRGBColor) state.color = args[0];
    if (operation !== OPS.constructPath || args[0] !== OPS.fill || !args[2]) return;
    const path = args[1]?.[0];
    // A closed, straight rectangle; exclude logos, letter outlines and curves.
    if (!path || ![13, 16].includes(path.length) || path[0] !== 0 || path[3] !== 1 || path[6] !== 1 || path[9] !== 1) return;
    const bounds = args[2];
    const from = point(bounds[0], bounds[1], state.matrix);
    const to = point(bounds[2], bounds[3], state.matrix);
    rectangles.push({ x: Math.min(from[0], to[0]), y: Math.min(from[1], to[1]), width: Math.abs(to[0] - from[0]), height: Math.abs(to[1] - from[1]), color: state.color });
  });
  return rectangles;
}

export function sourceScaleTable(items) {
  const labelHeader = items.find((item) => /^ШКАЛА$/u.test(item.text.trim()));
  const valueHeader = items.find((item) => item.text.trim() === "%");
  const descriptionHeader = items.filter((item) => /ОПРЕДЕЛЕНИЯ|^ШКАЛ$/u.test(item.text.trim()));
  if (!labelHeader || !valueHeader || !descriptionHeader.length) return null;
  const left = (labelHeader.x + valueHeader.x) / 2;
  const right = Math.min(...descriptionHeader.map((item) => item.x)) - 2;
  const scores = items.filter((item) => item.y < valueHeader.y && Math.abs(item.x - valueHeader.x) < 5 && /^\d{1,3}$/u.test(item.text)).sort((a, b) => b.y - a.y);
  const groups = items.filter((item) => item.y < valueHeader.y && /Inventory|Survey/u.test(item.text)).sort((a, b) => b.y - a.y);
  if (scores.length < 3 || !groups.length) return null;
  const used = new Set([labelHeader, valueHeader, ...descriptionHeader]);
  const rows = [];
  groups.forEach((group, groupIndex) => {
    used.add(group);
    rows.push([group.text]);
    const nextGroupY = groups[groupIndex + 1]?.y ?? -Infinity;
    const groupScores = scores.filter((score) => score.y < group.y && score.y > nextGroupY);
    groupScores.forEach((score, index) => {
      const top = index ? (groupScores[index - 1].y + score.y) / 2 : group.y - 2;
      const bottom = index < groupScores.length - 1 ? (score.y + groupScores[index + 1].y) / 2 : Math.max(nextGroupY + 2, score.y - 12);
      const band = items.filter((item) => !used.has(item) && item.y < top && item.y > bottom);
      const labels = band.filter((item) => item.x < left);
      const descriptions = band.filter((item) => item.x > right);
      [score, ...labels, ...descriptions].forEach((item) => used.add(item));
      rows.push([text(labels), score.text, text(descriptions)]);
    });
  });
  if (rows.some((row) => row.length === 3 && (!row[0] || !row[2]))) return null;
  return { used, top: valueHeader.y, block: { type: "table", headers: [labelHeader.text, valueHeader.text, text(descriptionHeader)], rows } };
}

export function sourceSubscaleCharts(items, rectangles) {
  const headers = items.filter((item) => item.text.trim() === "Баллы по субшкалам").sort((a, b) => a.x - b.x);
  const cells = rectangles.filter((rect) => rect.width > 5 && rect.width < 15 && rect.height > 2 && rect.height < 8);
  if (headers.length !== 3 || cells.length < 100) return null;
  const used = new Set(headers);
  let matchedCells = 0;
  const columns = headers.map((header, column) => {
    const end = headers[column + 1]?.x ?? Infinity;
    const columnItems = items.filter((item) => item.x >= header.x - 1 && item.x < end - 2 && item.y < header.y && item.y > 55);
    const columnCells = cells.filter((rect) => rect.x >= header.x && rect.x < end);
    const rowMap = new Map();
    for (const cell of columnCells) {
      const key = Math.round(cell.y * 10);
      const row = rowMap.get(key) || [];
      row.push(cell); rowMap.set(key, row);
    }
    const chartRows = [...rowMap.values()].sort((a, b) => b[0].y - a[0].y).map((rowCells) => {
      rowCells.sort((a, b) => a.x - b.x);
      const labels = columnItems.filter((item) => Math.abs(item.y - rowCells[0].y) < 2 && item.right < rowCells[0].x + 1);
      if (!labels.length || ![4, 5].includes(rowCells.length)) return null;
      labels.forEach((item) => used.add(item));
      matchedCells += rowCells.length;
      return { y: rowCells[0].y, label: text(labels), cells: rowCells.map((cell) => cell.color) };
    });
    if (chartRows.some((row) => !row)) return null;
    const headings = columnItems.filter((item) => !used.has(item)).sort((a, b) => b.y - a.y);
    headings.forEach((item) => used.add(item));
    const sections = [];
    for (const entry of [...headings.map((item) => ({ y: item.y, heading: item.text })), ...chartRows].sort((a, b) => b.y - a.y)) {
      if (entry.heading) sections.push({ title: entry.heading, rows: [] });
      else {
        if (!sections.length) sections.push({ title: "", rows: [] });
        sections.at(-1).rows.push({ label: entry.label, cells: entry.cells });
      }
    }
    // These codes are outlined glyphs in the source PDF, not text objects.
    return { code: ["HPI", "HDS", "MVPI"][column], title: header.text, sections };
  });
  if (columns.some((column) => !column) || matchedCells !== cells.length) return null;
  return { used, top: headers[0].y, block: { type: "subscale-charts", columns } };
}
