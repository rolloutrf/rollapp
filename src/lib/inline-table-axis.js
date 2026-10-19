import { tableHeaderState } from "./inline-table-headers.js";
import { Fragment } from "@tiptap/pm/model";
import { CellSelection, TableMap, moveTableRow, moveTableColumn } from "@tiptap/pm/tables";
import { closeHistory } from "@tiptap/pm/history";
import { createChainableState } from "@tiptap/core";

// Merged cells connect their covered rows/columns. A move carries the whole
// connected band so no span is split and no hidden cell content is discarded.
export function tableAxisBand(table, axis, index) {
  if (!["row", "column"].includes(axis) || table?.type.spec.tableRole !== "table") return null;
  const map = TableMap.get(table), size = axis === "row" ? map.height : map.width;
  if (map.problems || !Number.isInteger(index) || index < 0 || index >= size) return null;
  let start = index, end = index + 1, changed = true;
  const rects = [...new Set(map.map)].map(position => map.findCell(position));
  while (changed) {
    changed = false;
    for (const rect of rects) {
      const a = axis === "row" ? rect.top : rect.left, b = axis === "row" ? rect.bottom : rect.right;
      if (a >= end || b <= start) continue;
      if (a < start || b > end) { start = Math.min(start, a); end = Math.max(end, b); changed = true; }
    }
  }
  return { start, end, size };
}

export function tableAxisSelection(doc, position, axis, start, end = start + 1) {
  if (!Number.isInteger(position) || position < 0 || position >= doc.content.size) return null;
  const table = doc.nodeAt(position), band = tableAxisBand(table, axis, start);
  if (!band || !Number.isInteger(end) || end <= start || end > band.size) return null;
  const map = TableMap.get(table), first = axis === "row" ? start * map.width : start;
  const last = axis === "row" ? end * map.width - 1 : (map.height - 1) * map.width + end - 1;
  const $a = doc.resolve(position + 1 + map.map[first]), $b = doc.resolve(position + 1 + map.map[last]);
  return axis === "row" ? CellSelection.rowSelection($a, $b) : CellSelection.colSelection($a, $b);
}

export function selectTableAxis(editor, position, axis, index) {
  if (!editor.isEditable || editor.view.composing) return false;
  if (!Number.isInteger(position) || position < 0 || position >= editor.state.doc.content.size) return false;
  const band = tableAxisBand(editor.state.doc.nodeAt(position), axis, index);
  const selection = band && tableAxisSelection(editor.state.doc, position, axis, band.start, band.end);
  if (!selection) return false;
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  return true;
}

export function tableAxisMoveTransaction(state, position, axis, from, to) {
  if (!Number.isInteger(position) || position < 0 || position >= state.doc.content.size) return null;
  const table = state.doc.nodeAt(position), source = tableAxisBand(table, axis, from), target = tableAxisBand(table, axis, to);
  if (!source || !target || source.start < target.end && target.start < source.end) return null;
  const selection = tableAxisSelection(state.doc, position, axis, source.start, source.end);
  if (!selection) return null;
  const staged = state.tr.setSelection(selection);
  const local = createChainableState({ state, transaction: staged });
  // The upstream command resolves both its explicit table position and current
  // cell selection; stage the requested table even if another editor block is active.
  let transaction = null;
  const command = axis === "row" ? moveTableRow : moveTableColumn;
  if (!command({ from, to, pos: position + 1 })(local, tr => { transaction = tr; })) return null;
  const next = transaction?.doc.nodeAt(position);
  if (!next || TableMap.get(next).problems || next.eq(table)) return null;
  const start = source.start > target.start ? target.start : target.end - (source.end - source.start);
  transaction.setSelection(tableAxisSelection(transaction.doc, position, axis, start, start + source.end - source.start));
  return transaction;
}

export function moveTableAxis(editor, position, axis, from, to, dryRun = false) {
  if (!editor.isEditable || editor.view.composing) return false;
  const tr = tableAxisMoveTransaction(editor.state, position, axis, from, to);
  if (!tr) return false;
  if (!dryRun) { editor.view.dispatch(closeHistory(tr).scrollIntoView()); editor.view.dispatch(closeHistory(editor.state.tr)); }
  return true;
}

// Duplicate complete connected bands. The cut never crosses a merged cell,
// including spans that connect more than two adjacent rows or columns.
export function tableAxisDuplicateTransaction(state, position, axis, start, end = start + 1) {
  if (!Number.isInteger(position) || position < 0 || position >= state.doc.content.size || !Number.isInteger(end) || end <= start) return null;
  const table = state.doc.nodeAt(position), first = tableAxisBand(table, axis, start), last = tableAxisBand(table, axis, end - 1);
  if (!first || !last) return null;
  const from = Math.min(first.start, last.start), to = Math.max(first.end, last.end), map = TableMap.get(table);
  const { headerRow, headerColumn } = tableHeaderState(table);
  const rows = [], duplicates = [];
  let rowIndex = 0;
  table.forEach((row, rowOffset) => {
    const cells = [], copies = [];
    let inserted = false;
    row.forEach((cell, cellOffset) => {
      const rect = map.findCell(rowOffset + 1 + cellOffset);
      const copied = axis === "row" ? rowIndex >= from && rowIndex < to : rect.left >= from && rect.left < to;
      let copy = cell;
      if (copied && (axis === "row" ? headerRow && rowIndex === 0 : headerColumn && rect.left === 0)) {
        const staysHeader = axis === "row" ? headerColumn && rect.left === 0 : headerRow && rowIndex === 0;
        if (!staysHeader) copy = state.schema.nodes.tableCell.create(cell.attrs, cell.content, cell.marks);
      }
      if (axis === "column" && rect.left >= to && !inserted) { cells.push(...copies); inserted = true; }
      cells.push(cell);
      if (copied) copies.push(copy);
    });
    if (axis === "column" && !inserted) cells.push(...copies);
    rows.push(axis === "column" ? row.copy(Fragment.fromArray(cells)) : row);
    if (axis === "row" && rowIndex >= from && rowIndex < to) duplicates.push(row.copy(Fragment.fromArray(copies)));
    rowIndex += 1;
  });
  if (axis === "row") rows.splice(to, 0, ...duplicates);
  const next = table.copy(Fragment.fromArray(rows));
  if (TableMap.get(next).problems) return null;
  const tr = state.tr.replaceWith(position, position + table.nodeSize, next);
  const selection = tableAxisSelection(tr.doc, position, axis, to, to + to - from);
  return selection ? tr.setSelection(selection) : null;
}

export function duplicateTableAxis(editor, position, axis, start, end = start + 1, dryRun = false) {
  if (!editor.isEditable || editor.view.composing) return false;
  const tr = tableAxisDuplicateTransaction(editor.state, position, axis, start, end);
  if (!tr) return false;
  if (!dryRun) { editor.view.dispatch(closeHistory(tr).scrollIntoView()); editor.view.dispatch(closeHistory(editor.state.tr)); }
  return true;
}
