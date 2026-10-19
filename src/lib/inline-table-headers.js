import { TableMap } from "@tiptap/pm/tables";

// Explicit intent distinguishes row/column headers even in a one-cell table.
// Legacy documents infer conventional row headers from a single header row.
export function tableHeaderState(table) {
  const map = TableMap.get(table);
  const row = map.map.slice(0, map.width).every(pos => table.nodeAt(pos).type.spec.tableRole === "header_cell");
  const column = Array.from({ length: map.height }, (_, r) => map.map[r * map.width]).every(pos => table.nodeAt(pos).type.spec.tableRole === "header_cell");
  return {
    headerRow: table.attrs.headerRow ?? (row && (!column || map.width > 1 || map.height === 1)),
    headerColumn: table.attrs.headerColumn ?? (column && (!row || map.height > 1)),
  };
}

export function applyTableHeaderState(tr, position, flags) {
  let table = tr.doc.nodeAt(position);
  if (table?.type.spec.tableRole !== "table") return tr;
  if (flags) {
    tr.setNodeMarkup(position, undefined, { ...table.attrs, ...flags });
    table = tr.doc.nodeAt(position);
  }
  if (table.attrs.headerRow == null && table.attrs.headerColumn == null) return tr;
  const state = tableHeaderState(table), map = TableMap.get(table);
  for (const offset of new Set(map.map)) {
    const cell = table.nodeAt(offset), rect = map.findCell(offset);
    if (rect.top !== 0 && rect.left !== 0) continue;
    const header = state.headerRow && rect.top === 0 || state.headerColumn && rect.left === 0;
    const type = header ? tr.doc.type.schema.nodes.tableHeader : tr.doc.type.schema.nodes.tableCell;
    if (cell.type !== type) tr.setNodeMarkup(position + 1 + offset, type, cell.attrs, cell.marks);
  }
  return tr;
}
