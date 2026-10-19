import { requestInlineCaretReveal } from "./inline-caret-intent.js";
import { tableHeaderState } from "./inline-table-headers.js";
import { Fragment } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { closeHistory } from "@tiptap/pm/history";

export function tableSizeTransaction(state, position, height, width, focus = "corner") {
  if (!Number.isInteger(position) || position < 0 || position >= state.doc.content.size || !Number.isInteger(height) || !Number.isInteger(width) || height < 1 || width < 1 || height * width > 1000000) return null;
  const table = state.doc.nodeAt(position);
  if (table?.type.spec.tableRole !== "table") return null;
  const map = TableMap.get(table);
  if (map.problems || map.height === height && map.width === width) return null;
  const { headerRow, headerColumn } = tableHeaderState(table);
  const widths = Array(map.width).fill(0);
  for (const pos of new Set(map.map)) {
    const cell = table.nodeAt(pos), rect = map.findCell(pos);
    cell.attrs.colwidth?.forEach((value, index) => { if (value > 0) widths[rect.left + index] = value; });
  }
  const emptyCell = (r, c) => {
    const type = headerRow && r === 0 || headerColumn && c === 0 ? state.schema.nodes.tableHeader : state.schema.nodes.tableCell;
    return type.createAndFill({ colwidth: widths[c] > 0 ? [widths[c]] : null });
  };
  const rows = [];
  table.forEach((row, rowOffset, r) => {
    if (r >= height) return;
    const cells = [];
    row.forEach((cell, cellOffset) => {
      const rect = map.findCell(rowOffset + 1 + cellOffset);
      if (rect.left >= width) return;
      const colspan = Math.min(cell.attrs.colspan, width - rect.left), rowspan = Math.min(cell.attrs.rowspan, height - r);
      cells.push(colspan === cell.attrs.colspan && rowspan === cell.attrs.rowspan ? cell : cell.type.create({ ...cell.attrs, colspan, rowspan, colwidth: cell.attrs.colwidth?.slice(0, colspan) || null }, cell.content, cell.marks));
    });
    for (let c = map.width; c < width; c += 1) cells.push(emptyCell(r, c));
    rows.push(row.copy(Fragment.fromArray(cells)));
  });
  for (let r = map.height; r < height; r += 1) rows.push(table.firstChild.type.create(null, Array.from({ length: width }, (_, c) => emptyCell(r, c))));
  const next = table.type.create({ ...table.attrs, headerRow, headerColumn }, Fragment.fromArray(rows), table.marks), nextMap = TableMap.get(next);
  if (nextMap.problems) return null;
  const tr = state.tr.replaceWith(position, position + table.nodeSize, next);
  const r = focus === "column" ? 0 : focus === "row" && height > map.height ? map.height : height - 1;
  const c = focus === "row" ? 0 : focus === "column" && width > map.width ? map.width : width - 1;
  const cell = position + 1 + nextMap.map[r * width + c];
  const selection = Selection.findFrom(tr.doc.resolve(cell + 1), 1, true);
  return selection ? tr.setSelection(selection) : null;
}

export function resizeTable(editor, position, height, width, focus = "corner", dryRun = false) {
  if (!editor.isEditable || editor.view.composing) return false;
  const tr = tableSizeTransaction(editor.state, position, height, width, focus);
  if (!tr) return false;
  if (!dryRun) {
    // ProseMirror can reveal the new cell only after its editing host owns
    // focus. In a wide table, dispatching first leaves the caret offscreen.
    editor.view.focus();
    if (!editor.isEditable || editor.view.composing || editor.state.doc !== tr.before) return false;
    editor.view.dispatch(closeHistory(tr).scrollIntoView()); editor.view.dispatch(closeHistory(editor.state.tr));
    requestInlineCaretReveal(editor.view, { cell: true });
  }
  return true;
}
