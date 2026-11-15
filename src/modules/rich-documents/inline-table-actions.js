import { tableHeaderState, applyTableHeaderState } from "./inline-table-headers.js";
import { duplicateTableAxis, moveTableAxis, tableAxisBand } from "./inline-table-axis.js";
import { createChainableState } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { CellSelection, TableMap, selectedRect, addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn, deleteTable, mergeCells, splitCell, toggleHeader } from "@tiptap/pm/tables";

export function tablePosition($pos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) if ($pos.node(depth).type.spec.tableRole === "table") return $pos.before(depth);
  return null;
}

export function tableState(state, position) {
  const table = state.doc.nodeAt(position);
  if (table?.type.spec.tableRole !== "table") return null;
  if (tablePosition(state.selection.$from) === position && tablePosition(state.selection.$to) === position) return state;
  const tr = state.tr.setSelection(Selection.findFrom(state.doc.resolve(position + 1), 1, true));
  return createChainableState({ state, transaction: tr });
}

export function headerEnabled(state, position, axis) {
  const table = state.doc.nodeAt(position);
  if (table?.type.spec.tableRole !== "table") return false;
  return tableHeaderState(table)[axis === "row" ? "headerRow" : "headerColumn"];
}

function clearCommand(state, dispatch) {
  const rect = selectedRect(state), positions = rect.map.cellsInRect(rect).sort((a, b) => b - a);
  if (dispatch) {
    const tr = state.tr;
    for (const pos of positions) {
      const cell = rect.table.nodeAt(pos);
      tr.replaceWith(rect.tableStart + pos + 1, rect.tableStart + pos + cell.nodeSize - 1, state.schema.nodes.paragraph.create());
    }
    dispatch(tr);
  }
  return true;
}

function mergeCommand(state, dispatch) {
  if (!mergeCells(state)) return false;
  if (!dispatch) return true;
  const rect = selectedRect(state), anchor = rect.map.map[rect.top * rect.map.width + rect.left];
  // Notion keeps the top-left cell's content. One history event also restores
  // the other cells' original text when the user undoes this merge.
  return mergeCells(state, tr => {
    const pos = tr.mapping.map(rect.tableStart + anchor), merged = tr.doc.nodeAt(pos);
    tr.replaceWith(pos + 1, pos + merged.nodeSize - 1, rect.table.nodeAt(anchor).content);
    dispatch(tr);
  });
}

const commands = { rowAbove: addRowBefore, rowBelow: addRowAfter, columnLeft: addColumnBefore, columnRight: addColumnAfter, deleteRow, deleteColumn, deleteTable, headerRow: toggleHeader("row"), headerColumn: toggleHeader("column"), merge: mergeCommand, split: splitCell, clear: clearCommand };

export function applyTableAction(editor, position, action, dryRun = false) {
  if (!editor.isEditable || !Number.isInteger(position)) return false;
  const state = tableState(editor.state, position);
  if (!state) return false;
  if (["selectRow", "selectColumn", "selectTable"].includes(action)) {
    if (dryRun) return true;
    const rect = selectedRect(state), a = rect.tableStart + rect.map.map[rect.top * rect.map.width + rect.left];
    const $a = state.doc.resolve(a);
    const selection = action === "selectRow" ? CellSelection.rowSelection($a) : action === "selectColumn" ? CellSelection.colSelection($a)
      : CellSelection.create(state.doc, rect.tableStart + rect.map.map[0], rect.tableStart + rect.map.map.at(-1));
    editor.view.dispatch(state.tr.setSelection(selection));
    return true;
  }
  if (["duplicateRow", "duplicateColumn"].includes(action)) {
    const rect = selectedRect(state), axis = action === "duplicateRow" ? "row" : "column";
    return duplicateTableAxis(editor, position, axis, axis === "row" ? rect.top : rect.left, axis === "row" ? rect.bottom : rect.right, dryRun);
  }
  if (["headerRow", "headerColumn"].includes(action)) {
    if (dryRun) return true;
    const flags = tableHeaderState(state.doc.nodeAt(position));
    editor.view.dispatch(closeHistory(applyTableHeaderState(state.tr, position, { ...flags, [action]: !flags[action] })).scrollIntoView());
    editor.view.dispatch(closeHistory(editor.state.tr));
    return true;
  }
  const axisMoves = { rowUp: ["row", -1], rowDown: ["row", 1], columnLeftward: ["column", -1], columnRightward: ["column", 1] };
  if (axisMoves[action]) {
    const [axis, direction] = axisMoves[action], rect = selectedRect(state);
    const index = axis === "row" ? rect.top : rect.left, band = tableAxisBand(state.doc.nodeAt(position), axis, index);
    if (!band || (axis === "row" ? rect.bottom : rect.right) > band.end) return false;
    return moveTableAxis(editor, position, axis, index, direction < 0 ? band.start - 1 : band.end, dryRun);
  }
  const command = commands[action];
  if (!command) return false;
  const result = command(state, dryRun ? undefined : tr => editor.view.dispatch(closeHistory(applyTableHeaderState(tr, position)).scrollIntoView()));
  if (result && !dryRun) editor.view.dispatch(closeHistory(editor.state.tr));
  return result;
}
