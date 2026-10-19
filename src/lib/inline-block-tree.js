import { canReloadNestedBlocks } from "./inline-block-depth.js";
import { Node } from "@tiptap/core";
import { treeOf, attach, newEntry, renderTree } from "./inline-block-tree-structure.js";
import { TextSelection } from "@tiptap/pm/state";
import { BlockSelection, blockRange, blockSelectionBetween, containsSelectedBlock, isBlockSelection } from "./inline-block-selection.js";
import { selectedBlockPosition } from "./inline-blocks.js";
import { blockHTML } from "./inline-table-markdown.js";

export const NestedBlock = Node.create({
  name: "nestedBlock", group: "block", content: "block+", defining: true, draggable: true,
  parseHTML: () => [{ tag: 'div[data-type="nestedBlock"]' }],
  renderHTML: ({ node }) => ["div", { "data-type": "nestedBlock", ...(node.childCount === 1 && node.firstChild.type.name === "heading" ? { "data-nested-leaf-heading": "" } : {}), ...(node.childCount === 1 && node.firstChild.type.name === "typographyBlock" && node.firstChild.attrs.role === "label" ? { "data-nested-leaf-label": "" } : {}) }, 0],
  renderMarkdown: node => blockHTML(node),
});

const lists = new Set(["bulletList", "orderedList", "taskList"]);
const items = new Set(["listItem", "taskItem"]);

function normalizeTree(entry) {
  attach(entry, entry.children.map(normalizeTree));
  if (entry.node.type.name === "nestedBlock" && entry.children.length === 1 && !entry.node.attrs.blockColor) {
    const own = entry.children[0]; if (entry.origin != null) own.aliases.push(entry.origin); return own;
  }
  return entry;
}
function rootListLift(group, schema) {
  const list = group.parent, owner = list.parent, index = owner.children.indexOf(list), selected = new Set(group.entries), output = [];
  let run = [], start = 0;
  const flush = () => {
    if (!run.length) return;
    const attrs = { ...list.node.attrs, ...(list.node.type.name === "orderedList" ? { start: list.node.attrs.start + start } : {}) };
    output.push(newEntry(list.node.type.create(attrs), run, output.length ? null : list.origin));run = [];
  };
  list.children.forEach((item, itemIndex) => {
    if (!selected.has(item)) { if (!run.length) start = itemIndex; run.push(item); return; }
    flush();
    const color = item.node.attrs.blockColor || list.node.attrs.blockColor;
    if (item.children.length === 1 && (!color || !item.children[0].node.attrs.blockColor || color === item.children[0].node.attrs.blockColor)) {
      const own = item.children[0];
      if (color && !own.node.attrs.blockColor) own.node = own.node.type.create({ ...own.node.attrs, blockColor: color }, own.node.content, own.node.marks);
      own.aliases.push(item.origin);output.push(own);
    } else output.push(newEntry(schema.nodes.nestedBlock.create({ blockColor: color }), item.children, item.origin));
  });
  flush();attach(owner, [...owner.children.slice(0, index), ...output, ...owner.children.slice(index + 1)]);
  return true;
}
function liftGroup(group, schema) {
  const parent = group.parent, owner = parent.parent;
  if (!owner) return false;
  const name = parent.node.type.name, selected = new Set(group.entries);
  if (lists.has(name)) {
    if (!items.has(owner.node.type.name)) return rootListLift(group, schema);
    const outer = owner.parent;
    if (!lists.has(outer?.node.type.name) || group.entries.some(entry => entry.node.type !== outer.node.type.contentMatch.defaultType)) return false;
    attach(parent, parent.children.filter(entry => !selected.has(entry)));
    if (!parent.children.length) attach(owner, owner.children.filter(entry => entry !== parent));
    const index = outer.children.indexOf(owner) + 1;attach(outer, [...outer.children.slice(0, index), ...group.entries, ...outer.children.slice(index)]);return true;
  }
  if (items.has(name)) {
    if (group.entries.includes(parent.children[0]) || !lists.has(owner.node.type.name)) return false;
    const container = owner.parent, listIndex = container.children.indexOf(owner), itemIndex = owner.children.indexOf(parent);
    attach(parent, parent.children.filter(entry => !selected.has(entry)));
    const before = newEntry(owner.node.type.create(owner.node.attrs), owner.children.slice(0, itemIndex + 1), owner.origin);
    const afterItems = owner.children.slice(itemIndex + 1), afterAttrs = { ...owner.node.attrs, ...(owner.node.type.name === "orderedList" ? { start: owner.node.attrs.start + itemIndex + 1 } : {}) };
    const after = afterItems.length ? [newEntry(owner.node.type.create(afterAttrs), afterItems)] : [];
    attach(container, [...container.children.slice(0, listIndex), before, ...group.entries, ...after, ...container.children.slice(listIndex + 1)]);return true;
  }
  if (name === "detailsContent" && owner.node.type.name === "details") {
    attach(parent, parent.children.filter(entry => !selected.has(entry)));
    if (!parent.children.length) attach(parent, [newEntry(schema.nodes.paragraph.create(), [])]);
    const container = owner.parent, index = container.children.indexOf(owner) + 1;
    attach(container, [...container.children.slice(0, index), ...group.entries, ...container.children.slice(index)]);return true;
  }
  if (!["nestedBlock", "blockquote"].includes(name) || group.entries.includes(parent.children[0])) return false;
  attach(parent, parent.children.filter(entry => !selected.has(entry)));
  const index = owner.children.indexOf(parent) + 1;attach(owner, [...owner.children.slice(0, index), ...group.entries, ...owner.children.slice(index)]);return true;
}
function sinkGroup(group, schema) {
  const parent = group.parent, selected = new Set(group.entries), output = [];
  for (let index = 0; index < parent.children.length;) {
    const entry = parent.children[index];
    if (!selected.has(entry)) { output.push(entry); index += 1; continue; }
    const run = [];
    while (index < parent.children.length && selected.has(parent.children[index])) run.push(parent.children[index++]);
    const previous = output.at(-1);
    if (!previous || parent.node.type.name === "nestedBlock" && output.length === 1 || previous.node.type.spec.selectable === false) return false;
    if (lists.has(parent.node.type.name)) {
      if (!items.has(previous.node.type.name)) return false;
      let list = previous.children.at(-1);
      if (list?.node.type !== parent.node.type) { list = newEntry(parent.node.type.create(), []); attach(previous, [...previous.children, list]); }
      attach(list, [...list.children, ...run]); continue;
    }
    if (lists.has(previous.node.type.name)) {
      const last = previous.children.at(-1); attach(last, [...last.children, ...run]); continue;
    }
    if (previous.node.type.name === "details") {
      const content = previous.children[1]; attach(content, [...content.children, ...run]);
      if (!previous.node.attrs.open) previous.node = previous.node.type.create({ ...previous.node.attrs, open: true }, previous.node.content, previous.node.marks);
      continue;
    }
    if (previous.node.type.name === "nestedBlock") { attach(previous, [...previous.children, ...run]); continue; }
    if (!previous.node.isTextblock && previous.node.type.name !== "blockquote") return false;
    output[output.length - 1] = newEntry(schema.nodes.nestedBlock.create(), [previous, ...run]);
  }
  attach(parent, output); return true;
}


export function changeBlockDepth(state, outdent = false, { position = null } = {}) {
  const { doc } = state;
  let { selection } = state;
  if (Number.isInteger(position) && !containsSelectedBlock(selection, position) && selectedBlockPosition(selection) !== blockRange(doc, position)?.from) {
    const range = blockRange(doc, position);
    if (!range) return null;
    selection = BlockSelection.create(doc, range.from);
  }
  let units = isBlockSelection(selection) ? selection : null;
  if (!units) {
    for (let depth = selection.$from.depth; depth > 0; depth -= 1) if (["table", "codeBlock"].includes(selection.$from.node(depth).type.name)) return null;
    const first = selectedBlockPosition({ $from: selection.$from });
    let end = selection.$to;
    if (!selection.empty && end.parent.isTextblock && end.parentOffset === 0) {
      let boundary = doc.resolve(end.before());
      while (boundary.depth && boundary.parentOffset === 0) boundary = doc.resolve(boundary.before());
      end = doc.resolve(Math.max(selection.from, boundary.pos - 1));
      if (end.parent.type.spec.selectable === false && end.nodeBefore?.isBlock) end = doc.resolve(end.pos - end.nodeBefore.nodeSize + (end.nodeBefore.isLeaf ? 0 : 1));
    } else if (!selection.empty) end = doc.resolve(selection.to - 1);
    const last = selectedBlockPosition({ $from: end });
    units = selection.anchor <= selection.head ? blockSelectionBetween(doc, first, last) : blockSelectionBetween(doc, last, first);
  }
  if (!units) return null;
  const { root, byPosition } = treeOf(doc), entries = units.positions.map(position => byPosition.get(position));
  if (entries.some(entry => !entry?.parent)) return null;
  const grouped = new Map();
  for (const entry of entries) { if (!grouped.has(entry.parent)) grouped.set(entry.parent, []);grouped.get(entry.parent).push(entry); }
  const groups = [...grouped].map(([parent, entries]) => ({ parent, entries })).sort((a, b) => Math.max(...b.entries.map(entry => entry.origin)) - Math.max(...a.entries.map(entry => entry.origin)));
  for (const group of groups) if (!(outdent ? liftGroup : sinkGroup)(group, state.schema)) return null;
  const output = renderTree(normalizeTree(root));
  try { output.doc.check(); } catch { return null; }
  if (output.doc.eq(doc)) return null;
  if (!canReloadNestedBlocks(output.doc)) return null;
  const tr = state.tr.replaceWith(0, doc.content.size, output.doc.content);
  if (isBlockSelection(selection)) {
    const positions = selection.positions.map(position => output.positions.get(position));
    if (positions.some(position => position == null)) return null;
    tr.setSelection(BlockSelection.fromPositions(tr.doc, positions, output.positions.get(selection.anchorBlock), output.positions.get(selection.headBlock)));
  } else {
    const mapPoint = position => {
      let best = null;
      for (const [origin, entry] of byPosition) if (origin <= position && position <= origin + entry.node.nodeSize && output.positions.has(origin) && (!best || origin >= best.origin)) best = entry;
      return best ? output.positions.get(best.origin) + Math.min(position - best.origin, best.node.nodeSize) : null;
    };
    const anchor = mapPoint(selection.anchor), head = mapPoint(selection.head);
    if (anchor == null || head == null) return null;
    tr.setSelection(TextSelection.between(tr.doc.resolve(Math.min(anchor, tr.doc.content.size)), tr.doc.resolve(Math.min(head, tr.doc.content.size))));
  }
  if (tr.selection.empty && state.storedMarks) tr.setStoredMarks(state.storedMarks);
  return tr;
}
