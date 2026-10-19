import { removeColumnContent } from "./inline-column-structure.js";
import { Selection, SelectionRange } from "@tiptap/pm/state";
import { Fragment, Slice } from "@tiptap/pm/model";

const selectionType = "rollappBlocks";
const structuralChildren = new Set(["column", "tableRow", "tableCell", "tableHeader", "detailsSummary", "detailsContent"]);
export const isBlockSelection = selection => selection?.toJSON?.()?.type === selectionType;

export function blockUnitPosition(doc, position) {
  if (!Number.isInteger(position) || position < 0 || position >= doc.content.size) return position;
  const $pos = doc.resolve(position);
  // Legacy multi-paragraph quotes can contain several independently selected
  // prose blocks (including a freshly converted group). Only an explicit own
  // quote in a nested parent, or a single-paragraph quote, is one parent unit.
  const ownQuote = $pos.parent.type.name === "blockquote" && ($pos.parent.childCount === 1 || $pos.depth > 1 && $pos.node(-1).type.name === "nestedBlock" && $pos.index(-1) === 0);
  if ($pos.parentOffset === 0 && ($pos.nodeAfter?.isTextblock || $pos.parent.type.name === "nestedBlock") && (["listItem", "taskItem", "nestedBlock"].includes($pos.parent.type.name) || ownQuote)) return blockUnitPosition(doc, $pos.before());
  return position;
}

// A parent owns its children. Never keep overlapping parent/child entries or
// silently expand a sparse selection to the unselected blocks between them.
export function normalizeBlockPositions(doc, positions) {
  let end = -1;
  return [...new Set(positions.map(pos => blockUnitPosition(doc, pos)))].sort((a, b) => a - b).filter(pos => {
    const range = blockRange(doc, pos);
    if (!range || pos < end) return false;
    end = range.to;
    return true;
  });
}

export function blockSelectionRanges(doc, selection) {
  const positions = selection.positions || [];
  const ranges = [];
  for (const pos of positions) {
    const range = blockRange(doc, pos), previous = ranges.at(-1);
    if (previous && previous.to === pos && previous.parent === range.parent) {
      previous.to = range.to;
      previous.count += 1;
      previous.content = previous.content.append(range.content);
    } else ranges.push({ ...range });
  }
  return ranges;
}

export const containsSelectedBlock = (selection, position) => isBlockSelection(selection) && selection.positions.some(pos => position >= pos && position < pos + selection.$anchor.doc.nodeAt(pos).nodeSize);

export function prepareBlockComposition(tr) {
  const start = tr.selection.from, mapFrom = tr.mapping.maps.length;
  tr.replaceSelectionWith(tr.doc.type.schema.nodes.paragraph.create());
  const position = tr.doc.resolve(tr.mapping.slice(mapFrom).map(start, -1));
  tr.setSelection(Selection.findFrom(position, 1, true) || Selection.near(position));
  return tr;
}

// Positions identify whole sibling nodes, independently of the direction in
// which the user extended the selection. List items include nested children.
export function blockRange(doc, anchorBlock, headBlock = anchorBlock) {
  if (![anchorBlock, headBlock].every(pos => Number.isInteger(pos) && pos >= 0 && pos < doc.content.size)) return null;
  anchorBlock = blockUnitPosition(doc, anchorBlock); headBlock = blockUnitPosition(doc, headBlock);
  let $anchor = doc.resolve(anchorBlock), $head = doc.resolve(headBlock);
  if (!$anchor.sameParent($head)) {
    const depth = $anchor.sharedDepth(headBlock);
    anchorBlock = $anchor.depth > depth ? $anchor.before(depth + 1) : anchorBlock;
    headBlock = $head.depth > depth ? $head.before(depth + 1) : headBlock;
    $anchor = doc.resolve(anchorBlock); $head = doc.resolve(headBlock);
  }
  const a = $anchor.nodeAfter, h = $head.nodeAfter;
  if (!a?.isBlock || !h?.isBlock || a.type.spec.selectable === false || h.type.spec.selectable === false || structuralChildren.has(a.type.name) || structuralChildren.has(h.type.name)) return null;
  const from = Math.min(anchorBlock, headBlock);
  const to = Math.max(anchorBlock + a.nodeSize, headBlock + h.nodeSize);
  const $from = doc.resolve(from), $to = doc.resolve(to);
  if (!$from.sameParent($to)) return null;
  return { from, to, anchorBlock, headBlock, parent: $from.parent, index: $from.index(), count: $to.index() - $from.index(), content: $from.parent.content.cut($from.parentOffset, $to.parentOffset) };
}

// A protected section is a boundary for edits, not for choosing blocks.
// Retain exact units on both sides instead of selecting its immutable wrapper.
export function blockSelectionBetween(doc, anchorBlock, headBlock = anchorBlock) {
  anchorBlock = normalizeBlockPositions(doc, [anchorBlock])[0];
  headBlock = normalizeBlockPositions(doc, [headBlock])[0];
  if (anchorBlock == null || headBlock == null) return null;
  const range = blockRange(doc, anchorBlock, headBlock);
  if (range) return BlockSelection.create(doc, range.anchorBlock, range.headBlock);
  const from = Math.min(anchorBlock, headBlock), last = Math.max(anchorBlock, headBlock);
  const to = last + doc.nodeAt(last).nodeSize, positions = [];
  doc.nodesBetween(from, to, (node, position) => {
    if (position < from || position + node.nodeSize > to || !node.isBlock || node.type.spec.selectable === false || structuralChildren.has(node.type.name)) return;
    positions.push(position);
    return false;
  });
  return positions.length ? BlockSelection.fromPositions(doc, positions, anchorBlock, headBlock) : null;
}

export class BlockSelection extends Selection {
  constructor(doc, anchorBlock, headBlock = anchorBlock, positions = null) {
    const range = positions ? null : blockRange(doc, anchorBlock, headBlock);
    if (positions) {
      positions = normalizeBlockPositions(doc, positions);
      if (!positions.length) throw new RangeError("Invalid block selection");
      anchorBlock = blockUnitPosition(doc, anchorBlock); headBlock = blockUnitPosition(doc, headBlock);
      if (!positions.includes(anchorBlock)) anchorBlock = positions[0];
      if (!positions.includes(headBlock)) headBlock = positions.at(-1);
    } else if (range) {
      positions = [];
      range.content.forEach((_node, offset) => positions.push(range.from + offset));
      anchorBlock = range.anchorBlock; headBlock = range.headBlock;
    }
    if (!positions?.length) throw new RangeError("Invalid block selection");
    const ranges = blockSelectionRanges(doc, { positions });
    const forward = anchorBlock <= headBlock;
    super(doc.resolve(forward ? anchorBlock : anchorBlock + doc.nodeAt(anchorBlock).nodeSize), doc.resolve(forward ? headBlock + doc.nodeAt(headBlock).nodeSize : headBlock), ranges.map(range => new SelectionRange(doc.resolve(range.from), doc.resolve(range.to))));
    this.anchorBlock = anchorBlock;
    this.headBlock = headBlock;
    this.positions = positions;
    this.disjoint = ranges.length > 1;
    this.visible = false;
  }
  eq(other) { return isBlockSelection(other) && this.anchorBlock === other.anchorBlock && this.headBlock === other.headBlock && this.positions.length === other.positions.length && this.positions.every((pos, index) => pos === other.positions[index]); }
  map(doc, mapping) { return this.getBookmark().map(mapping).resolve(doc); }
  content() {
    if (!this.disjoint) return super.content();
    let content = Fragment.empty;
    for (const { $from, $to } of this.ranges) content = content.append($from.doc.slice($from.pos, $to.pos, true).content);
    return new Slice(content, 0, 0);
  }
  // Finish at the insertion point: history's adjacency rule can then group
  // subsequent typing with the first character that replaced this selection.
  // The default multi-range replacement finishes with a remote deletion.
  replace(tr, content = Slice.empty) {
    if (!content.size && !this.disjoint) {
      const removed = removeColumnContent(tr, this.from, this.to);
      if (removed != null) { tr.setSelection(Selection.near(tr.doc.resolve(removed))); return; }
    }
    if (!this.disjoint) return super.replace(tr, content);
    this.remainingRange(tr).replace(tr, content);
  }
  replaceWith(tr, node) {
    if (!this.disjoint) return super.replaceWith(tr, node);
    this.remainingRange(tr).replaceWith(tr, node);
  }
  remainingRange(tr) {
    const mapFrom = tr.mapping.maps.length;
    for (const { $from, $to } of [...this.ranges].slice(1).reverse()) {
      const mapping = tr.mapping.slice(mapFrom);
      tr.deleteRange(mapping.map($from.pos, 1), mapping.map($to.pos, -1));
    }
    const first = this.ranges[0], mapping = tr.mapping.slice(mapFrom);
    return BlockSelection.create(tr.doc, mapping.map(first.$from.pos, 1), mapping.map(first.$to.pos - first.$to.nodeBefore.nodeSize, 1));
  }
  toJSON() { return { type: selectionType, anchorBlock: this.anchorBlock, headBlock: this.headBlock, positions: this.positions }; }
  getBookmark() { return new BlockBookmark(this.anchorBlock, this.headBlock, this.positions.map(position => {
    const node = this.$anchor.doc.nodeAt(position);
    return { position, end: position + node.nodeSize };
  })); }
  static create(doc, anchorBlock, headBlock = anchorBlock) { return new BlockSelection(doc, anchorBlock, headBlock); }
  static fromPositions(doc, positions, anchorBlock = positions[0], headBlock = positions.at(-1)) { return new BlockSelection(doc, anchorBlock, headBlock, positions); }
  static fromJSON(doc, json) { return new BlockSelection(doc, json.anchorBlock, json.headBlock, json.positions); }
}

class BlockBookmark {
  constructor(anchorBlock, headBlock, entries) { this.anchorBlock = anchorBlock; this.headBlock = headBlock; this.entries = entries; }
  map(mapping) {
    const entries = [];
    for (const entry of this.entries) {
      const position = mapping.map(entry.position, 1), end = mapping.map(entry.end, -1);
      // Attribute changes and wrapping can replace every boundary token.
      // Keep the mapped node interval; a real deletion collapses it to zero.
      // Opposite associations exclude content inserted just outside the node.
      if (end > position) entries.push({ position, end });
    }
    return new BlockBookmark(mapping.map(this.anchorBlock, 1), mapping.map(this.headBlock, 1), entries);
  }
  resolve(doc) {
    const positions = normalizeBlockPositions(doc, this.entries.map(entry => entry.position));
    if (positions.length) return BlockSelection.fromPositions(doc, positions, this.anchorBlock, this.headBlock);
    return Selection.near(doc.resolve(Math.max(0, Math.min(this.headBlock, doc.content.size))));
  }
}

// ProseMirror keeps its registry during Vite HMR. Keep the adapter, but let
// deserialization use the current implementation after an editor hot update.
const registration = import.meta.hot?.data.blockSelectionRegistration || {};
registration.create = BlockSelection.fromJSON;
if (!registration.registered) {
  Selection.jsonID(selectionType, class { static fromJSON(doc, json) { return registration.create(doc, json); } });
  registration.registered = true;
}
import.meta.hot?.dispose(data => { data.blockSelectionRegistration = registration; });
