import { canReloadNestedBlocks } from "./inline-block-depth.js";
import { requestInlineImage } from "./inline-image-intent.js";
import { requestInlineCaretReveal } from "./inline-caret-intent.js";
import { removeColumnContent } from "./inline-column-structure.js";
import { blockMovePlan, blockMoveTransaction } from "./inline-block-move.js";
import { AllSelection, NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { createBlockNode } from "./inline-block-nodes.js";
import { BlockSelection, blockRange, blockUnitPosition, blockSelectionRanges, containsSelectedBlock, isBlockSelection } from "./inline-block-selection.js";
import { Fragment } from "@tiptap/pm/model";

// A list item moves with its nested children; ordinary prose moves one block.
export function selectedBlockPosition(selection) {
  if (isBlockSelection(selection)) return selection.headBlock;
  if (selection instanceof NodeSelection && selection.node.isBlock) return blockUnitPosition(selection.$from.doc, selection.from);
  const { $from } = selection;
  if (!$from.depth && $from.pos === $from.doc.content.size && $from.doc.lastChild) return $from.pos - $from.doc.lastChild.nodeSize;
  if ($from.parent.type.name === "detailsSummary") return $from.before($from.depth - 1);
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (["table", "codeBlock"].includes(node.type.name)) return $from.before(depth);
  }
  return blockUnitPosition($from.doc, $from.depth ? $from.before($from.depth) : $from.pos);
}

export function insertTextBlock(editor, position, side, type, { separateHistory = true, attrs, scopeToTextBlock = false } = {}) {
  if (editor.isEditable === false) return false;
  if (type === "image" && !attrs) return requestInlineImage(editor, { position, side });
  const selected = scopeToTextBlock ? null : selectedBlockRange(editor.state.doc, position, editor.state.selection);
  if (selected && side !== "replace") position = side === "before" ? selected.from : selected.positions?.at(-1) ?? selected.to - selected.content.lastChild.nodeSize;
  let block = blockAt(editor.state.doc, position);
  if (!block) return false;
  let inserted = createBlockNode(editor.schema, type, attrs);
  // Plain text in a list creates a sibling item. Other types find the nearest
  // valid parent, rather than breaking a list/table's required child schema.
  if (type === "paragraph" && ["listItem", "taskItem"].includes(block.node.type.name)) inserted = block.node.type.createAndFill();
  // A leaf owns a real editable paragraph, so immediate typing never
  // changes a neighbouring block. Validate the actual destination/fragment,
  // rather than testing insertion before the source even for an after action.
  const leaf = type === "horizontalRule" || type === "image";
  const content = Fragment.from(leaf ? [inserted, editor.schema.nodes.paragraph.create()] : inserted);
  const insertionAt = candidate => {
    const replacing = side === "replace" && candidate.node.type.name === "paragraph" && !candidate.node.content.size;
    const before = side === "before" || replacing;
    const index = candidate.index + (before ? 0 : 1);
    if (candidate.parent.canReplace(index, index + (replacing ? 1 : 0), content)) {
      const from = candidate.position + (before ? 0 : candidate.node.nodeSize);
      return { from, to: from + (replacing ? candidate.node.nodeSize : 0) };
    }
    // A list parent can require its first paragraph. Keep that anchor
    // when its empty text is the insertion context instead of lifting media
    // outside the complete parent and its existing children.
    if (scopeToTextBlock && replacing && candidate.parent.canReplace(candidate.index + 1, candidate.index + 1, content)) {
      const from = candidate.position + candidate.node.nodeSize;
      return { from, to: from };
    }
    return null;
  };
  let insertion = insertionAt(block);
  while (!insertion) {
    const $pos = editor.state.doc.resolve(block.position);
    if (!$pos.depth) return false;
    block = blockAt(editor.state.doc, $pos.before($pos.depth));
    if (!block) return false;
    insertion = insertionAt(block);
  }
  const destination = insertion.from;
  const tr = (separateHistory ? closeHistory(editor.state.tr) : editor.state.tr).replaceWith(destination, insertion.to, content);
  if (!canReloadNestedBlocks(tr.doc)) return false;
  tr.setSelection(Selection.near(tr.doc.resolve(destination + (leaf ? inserted.nodeSize : 0) + 1)));
  // The picker owns focus until this authoring command succeeds. Return it
  // before dispatch so native reconciliation sees the new caret immediately.
  editor.view.focus();
  editor.view.dispatch(tr.scrollIntoView());
  if (separateHistory) editor.view.dispatch(closeHistory(editor.state.tr));
  editor.commands.focus();
  requestInlineCaretReveal(editor.view, { cell: true });
  return true;
}

export function blockAt(doc, position) {
  if (!Number.isInteger(position) || position < 0 || position >= doc.content.size) return null;
  const $pos = doc.resolve(position);
  const node = $pos.nodeAfter;
  if (!node?.isBlock) return null;
  const index = $pos.index();
  return { node, position, parent: $pos.parent, index };
}

export function selectedBlockRange(doc, position, selection) {
  if (selection instanceof AllSelection && Number.isInteger(position) && position >= 0 && position < doc.content.size) return blockRange(doc, 0, doc.content.size - doc.lastChild.nodeSize);
  if (containsSelectedBlock(selection, position)) {
    const ranges = blockSelectionRanges(doc, selection);
    if (ranges.length === 1) return ranges[0];
    const first = ranges[0], last = ranges.at(-1);
    return { from: first.from, to: last.to, parent: null, index: first.index, count: selection.positions.length, content: Fragment.fromArray(selection.positions.map(pos => doc.nodeAt(pos))), ranges, positions: selection.positions };
  }
  return blockRange(doc, position);
}

export function canMoveTextBlock(doc, position, selection, direction) {
  const range = selectedBlockRange(doc, position, selection);
  return Boolean(blockMovePlan(doc, range, direction));
}

function changeSeparateBlocks(editor, range, action, separateHistory) {
  const { selection } = editor.state, tr = separateHistory ? closeHistory(editor.state.tr) : editor.state.tr;
  if (action === "delete") tr.deleteSelection();
  else if (action === "duplicate") {
    const inserted = [];
    for (const run of [...range.ranges].reverse()) {
      if (!run.parent.canReplace(run.index + run.count, run.index + run.count, run.content)) return false;
      tr.insert(run.to, run.content);
      run.content.forEach((_node, offset) => inserted.push({ source: run.from + offset, position: run.to + offset, mapFrom: tr.mapping.maps.length }));
    }
    const mapped = new Map(inserted.map(item => [item.source, tr.mapping.slice(item.mapFrom).map(item.position, 1)]));
    tr.setSelection(BlockSelection.fromPositions(tr.doc, selection.positions.map(pos => mapped.get(pos)), mapped.get(selection.anchorBlock), mapped.get(selection.headBlock)));
  } else if (["before", "after"].includes(action)) return insertTextBlock(editor, positionForSide(range, action), action, "paragraph", { separateHistory });
  else return false;
  editor.view.dispatch(tr.scrollIntoView()); if (separateHistory) editor.view.dispatch(closeHistory(editor.state.tr)); editor.commands.focus(); return true;
}

const positionForSide = (range, side) => side === "before" ? range.from : range.positions.at(-1);

function relocateSelection(tr, selection, range, destination) {
  const offset = destination - range.from;
  if (isBlockSelection(selection) && selection.from === range.from && selection.to === range.to) {
    tr.setSelection(BlockSelection.create(tr.doc, selection.anchorBlock + offset, selection.headBlock + offset));
  } else if (selection instanceof AllSelection) {
    tr.setSelection(BlockSelection.create(tr.doc, destination, destination + range.content.size - range.content.lastChild.nodeSize));
  } else if (selection.from >= range.from && selection.to <= range.to && selection instanceof TextSelection) {
    tr.setSelection(TextSelection.create(tr.doc, selection.anchor + offset, selection.head + offset));
  } else if (selection instanceof NodeSelection && selection.from === range.from) {
    tr.setSelection(NodeSelection.create(tr.doc, destination));
  } else tr.setSelection(Selection.near(tr.doc.resolve(Math.min(destination + 1, tr.doc.content.size))));
}

// Single transactions preserve marks, nesting and undo, and feed normal autosave.
export function moveTextBlock(editor, position, direction) {
  if (editor.isEditable === false) return false;
  const range = selectedBlockRange(editor.state.doc, position, editor.state.selection);
  const tr = blockMoveTransaction(editor.state, range, direction);
  if (!tr) return false;
  editor.view.dispatch(closeHistory(tr).scrollIntoView());
  editor.view.dispatch(closeHistory(editor.state.tr));
  editor.commands.focus();
  return true;
}

export function changeTextBlock(editor, position, action, { separateHistory = true } = {}) {
  if (editor.isEditable === false) return false;
  const range = selectedBlockRange(editor.state.doc, position, editor.state.selection);
  if (!range) return false;
  if (range.ranges) return changeSeparateBlocks(editor, range, action, separateHistory);
  const { from, to, parent, index, count, content } = range;
  const tr = separateHistory ? closeHistory(editor.state.tr) : editor.state.tr;
  let destination = from;
  if (action === "delete") {
    const removed = removeColumnContent(tr, from, to);
    if (removed == null) tr.deleteRange(from, to);
    destination = removed ?? Math.min(from, tr.doc.content.size);
  } else if (action === "duplicate") {
    destination = to;
    if (!parent.canReplace(index + count, index + count, content)) return false;
    tr.insert(destination, content);
    relocateSelection(tr, editor.state.selection, range, destination);
    if (tr.selection.empty && editor.state.storedMarks) tr.setStoredMarks(editor.state.storedMarks);
  } else {
    if (!["before", "after"].includes(action)) return false;
    const type = parent.canReplaceWith(index, index, editor.schema.nodes.paragraph) ? editor.schema.nodes.paragraph : parent.child(index).type;
    const inserted = type.createAndFill();
    if (!inserted) return false;
    destination = action === "before" ? from : to;
    tr.insert(destination, inserted);
  }
  if (action !== "duplicate") tr.setSelection(Selection.near(tr.doc.resolve(Math.min(destination + 1, tr.doc.content.size))));
  editor.view.dispatch(tr.scrollIntoView());
  if (separateHistory) editor.view.dispatch(closeHistory(editor.state.tr));
  editor.commands.focus();
  return true;
}
