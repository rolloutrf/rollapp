import { canReloadNestedBlocks } from "./inline-block-depth.js";
import { Selection } from "@tiptap/pm/state";
import { MapResult } from "@tiptap/pm/transform";
import { blockUnitPosition } from "./inline-block-selection.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";
import { treeOf, attach, newEntry, renderTree } from "./inline-block-tree-structure.js";

const lists = new Set(["bulletList", "orderedList", "taskList"]);
const items = new Set(["listItem", "taskItem"]);
const ownsFirstLine = entry => ["nestedBlock", "listItem", "taskItem"].includes(entry.node.type.name);
const isQuestionDocument = doc => doc.childCount === IDENTITY_QUESTION_TITLES.length && doc.content.content.every((node, index) => node.type.name === "questionSection" && node.attrs.index === index);

function selectedPositions(range) {
  if (range.positions) return range.positions;
  const positions = [];
  range.content.forEach((_node, offset) => positions.push(range.from + offset));
  return positions;
}

// List wrappers describe markers, not a second user-visible block level.
// Their items share the surrounding text's logical sibling rail. Each slot
// remembers its source wrapper and ordinal so reconstruction keeps attrs,
// inherited colour, checked children and untouched ordered-list segments.
function siblingSlots(owner, selected) {
  return owner.children.flatMap((entry, wrapperIndex) => lists.has(entry.node.type.name) && !selected.has(entry)
    ? entry.children.map((item, index) => ({ entry: item, list: entry, index, sourceOwner: owner, wrapperIndex, listLength: entry.children.length }))
    : [{ entry, list: null }]);
}

function reconstructOwner(owner, slots, usedOrigins) {
  const groups = [];
  for (let index = 0; index < slots.length;) {
    const slot = slots[index];
    if (!slot.list) { groups.push({ entry: slot.entry }); index += 1; continue; }
    const list = slot.list, run = [];
    while (index < slots.length && slots[index].list === list) run.push(slots[index++]);
    const attrs = { ...list.node.attrs, ...(list.node.type.name === "orderedList" ? { start: list.node.attrs.start + Math.min(...run.map(item => item.index)) } : {}) };
    const previous = groups.at(-1), last = previous?.run?.at(-1);
    const sourceBoundary = last && last.sourceOwner === slot.sourceOwner && last.wrapperIndex + 1 === slot.wrapperIndex && last.index === last.listLength - 1 && slot.index === 0;
    const attributesWithoutStart = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "start"));
    const compatible = previous?.list?.node.type === list.node.type && JSON.stringify(attributesWithoutStart(previous.attrs)) === JSON.stringify(attributesWithoutStart(attrs)) && (list.node.type.name !== "orderedList" || previous.attrs.start + previous.run.length === attrs.start);
    // Join only boundaries created by this move. Untouched adjacent source
    // wrappers remain byte-for-byte equivalent; distinct marker colours or
    // custom ordered starts never get folded into another list's styling.
    if (compatible && !sourceBoundary) { previous.run.push(...run); previous.sources.add(list); }
    else groups.push({ list, attrs, run, sources: new Set([list]) });
  }
  const children = groups.map(group => {
    if (group.entry) return group.entry;
    const { list, attrs, run, sources } = group, entries = run.map(item => item.entry);
    const unchanged = sources.size === 1 && entries.length === list.children.length && entries.every((entry, index) => entry === list.children[index]) && JSON.stringify(attrs) === JSON.stringify(list.node.attrs);
    const origins = [...sources].filter(source => !usedOrigins.has(source)).map(source => source.origin);
    for (const source of sources) usedOrigins.add(source);
    const result = unchanged ? list : newEntry(list.node.type.create(attrs), entries, origins[0] ?? null);
    if (!unchanged) result.aliases.push(...origins.slice(1).filter(origin => origin != null));
    return result;
  });
  attach(owner, children);
}

export function blockMovePlan(doc, range, direction) {
  if (!range || ![-1, 1].includes(direction)) return null;
  const tree = treeOf(doc), origins = selectedPositions(range);
  const entries = origins.map(position => tree.byPosition.get(position));
  if (entries.some(entry => !entry?.parent)) return null;
  const selected = new Set(entries), owners = new Set(entries.map(entry => items.has(entry.node.type.name) && lists.has(entry.parent.node.type.name) ? entry.parent.parent : entry.parent));
  if (owners.has(null)) return null;
  const questions = isQuestionDocument(doc);
  const adjacentOwner = owner => owner.node.type.name === "column" && owner.parent?.node.type.name === "columns"
    ? owner.parent.children[owner.parent.children.indexOf(owner) + direction]
    : questions && owner.node.type.name === "questionSection" ? tree.root.children[tree.root.children.indexOf(owner) + direction] : null;
  for (const owner of [...owners]) { const adjacent = adjacentOwner(owner); if (adjacent) owners.add(adjacent); }
  const slots = new Map([...owners].map(owner => [owner, siblingSlots(owner, selected)]));
  const crossings = [], crossed = new Set();
  for (const owner of owners) {
    const destination = adjacentOwner(owner);
    if (!destination) continue;
    const order = direction < 0 ? slots.get(owner) : [...slots.get(owner)].reverse(), run = [];
    for (const slot of order) { if (!selected.has(slot.entry)) break; run.push(slot); }
    if (direction > 0) run.reverse();
    if (run.length) { crossings.push({ source: owner, destination, run }); run.forEach(slot => crossed.add(slot.entry)); }
  }
  // Capture all boundary runs before applying any. One command never carries
  // an incoming block through another answer or applies a local move to it.
  for (const crossing of crossings) slots.set(crossing.source, slots.get(crossing.source).filter(slot => !crossed.has(slot.entry)));
  let moved = crossings.length > 0;
  const descendantCache = new Map();
  const hasSelectedDescendant = entry => {
    if (!descendantCache.has(entry)) descendantCache.set(entry, entry.children.some(child => selected.has(child) || hasSelectedDescendant(child)));
    return descendantCache.get(entry);
  };
  for (const owner of owners) {
    const siblings = slots.get(owner), own = ownsFirstLine(owner) ? owner.children[0] : null;
    if (direction < 0) {
      for (let index = 1; index < siblings.length; index += 1) {
        const entry = siblings[index].entry, previous = siblings[index - 1].entry;
        if (selected.has(entry) && !selected.has(previous) && previous !== own && !hasSelectedDescendant(previous)) {
          [siblings[index - 1], siblings[index]] = [siblings[index], siblings[index - 1]]; moved = true;
        }
      }
    } else {
      for (let index = siblings.length - 2; index >= 0; index -= 1) {
        const entry = siblings[index].entry, next = siblings[index + 1].entry;
        if (selected.has(entry) && !selected.has(next) && entry !== own && !hasSelectedDescendant(next)) {
          [siblings[index], siblings[index + 1]] = [siblings[index + 1], siblings[index]]; moved = true;
        }
      }
    }
  }
  for (const crossing of crossings) {
    let destination = slots.get(crossing.destination);
    if (destination.length === 1 && !destination[0].list && !selected.has(destination[0].entry) && destination[0].entry.node.eq(doc.type.schema.nodes.paragraph.create())) destination = [];
    slots.set(crossing.destination, direction < 0 ? [...destination, ...crossing.run] : [...crossing.run, ...destination]);
  }
  if (!moved) return null;
  if (questions) for (const section of tree.root.children) {
    if (slots.has(section) && !slots.get(section).length) slots.set(section, [{ entry: newEntry(doc.type.schema.nodes.paragraph.create(), []), list: null }]);
  }
  const depth = entry => { let result = 0; for (let parent = entry.parent; parent; parent = parent.parent) result += 1; return result; };
  const usedOrigins = new Set();
  for (const owner of [...owners].sort((a, b) => depth(b) - depth(a))) reconstructOwner(owner, slots.get(owner), usedOrigins);
  pruneColumns(tree.root, doc.type.schema);
  const output = renderTree(tree.root);
  try { output.doc.check(); } catch { return null; }
  if (!canReloadNestedBlocks(output.doc)) return null;
  if (questions && !isQuestionDocument(output.doc) || output.doc.eq(doc)) return null;
  return { ...output, source: tree, origins };
}

// Empty source columns disappear when their last block moves out. A remaining
// sole column becomes ordinary document flow; no empty spacer is persisted.
function pruneColumns(entry, schema) {
  const children = [];
  for (const child of entry.children) {
    pruneColumns(child, schema);
    if (child.node.type.name === "column" && !child.children.length) continue;
    if (child.node.type.name === "columns" && child.children.length < 2) {
      if (child.children.length) children.push(...child.children[0].children);
    } else children.push(child);
  }
  attach(entry, children);
  if (!entry.children.length && ["doc", "questionSection"].includes(entry.node.type.name)) attach(entry, [newEntry(schema.nodes.paragraph.create(), [])]);
}

function columnRelocationPlan(doc, range, targetPosition, side) {
  if (!range || !doc.type.schema.nodes.columns) return null;
  const schema = doc.type.schema, tree = treeOf(doc), origins = selectedPositions(range);
  const entries = origins.map(position => tree.byPosition.get(position));
  if (!entries.length || entries.some(entry => !entry?.parent)) return null;
  const selected = new Set(entries);
  let target = tree.byPosition.get(blockUnitPosition(doc, targetPosition));
  if (!target?.parent || target.node.type.spec.selectable === false) return null;
  for (let ancestor = target; ancestor; ancestor = ancestor.parent) if (selected.has(ancestor)) return null;
  if (lists.has(target.node.type.name)) target = target.children[0];
  if (!target) return null;
  const logicalOwner = entry => items.has(entry.node.type.name) && lists.has(entry.parent.node.type.name) ? entry.parent.parent : entry.parent;
  const destination = logicalOwner(target), owners = new Set([...entries.map(logicalOwner), destination]);
  if (owners.has(null)) return null;
  const slots = new Map([...owners].map(owner => [owner, siblingSlots(owner, selected)]));
  const moving = entries.map(entry => slots.get(logicalOwner(entry)).find(slot => slot.entry === entry));
  if (moving.some(slot => !slot)) return null;
  for (const owner of owners) slots.set(owner, slots.get(owner).filter(slot => !selected.has(slot.entry)));
  const usedOrigins = new Set(), column = newEntry(schema.nodes.column.create(), []);
  reconstructOwner(column, moving, usedOrigins);
  if (destination.node.type.name === "column") {
    const row = destination.parent;
    if (row?.node.type.name !== "columns") return null;
    const index = row.children.indexOf(destination) + (side === "right" ? 1 : 0);
    attach(row, [...row.children.slice(0, index), column, ...row.children.slice(index)]);
  } else {
    const siblings = slots.get(destination), index = siblings.findIndex(slot => slot.entry === target);
    if (index < 0) return null;
    const peer = newEntry(schema.nodes.column.create(), []);
    reconstructOwner(peer, [siblings[index]], usedOrigins);
    const row = newEntry(schema.nodes.columns.create(), side === "left" ? [column, peer] : [peer, column]);
    slots.set(destination, [...siblings.slice(0, index), { entry: row, list: null }, ...siblings.slice(index + 1)]);
  }
  const depth = entry => { let result = 0; for (let parent = entry.parent; parent; parent = parent.parent) result += 1; return result; };
  for (const owner of [...owners].sort((a, b) => depth(b) - depth(a))) {
    if (!slots.get(owner).length && owner.node.type.name !== "column") slots.set(owner, [{ entry: newEntry(schema.nodes.paragraph.create(), []), list: null }]);
    reconstructOwner(owner, slots.get(owner), usedOrigins);
  }
  pruneColumns(tree.root, schema);
  const output = renderTree(tree.root);
  try { output.doc.check(); } catch { return null; }
  if (!canReloadNestedBlocks(output.doc) || isQuestionDocument(doc) && !isQuestionDocument(output.doc) || output.doc.eq(doc)) return null;
  return { ...output, source: tree, origins };
}

export function blockRelocationPlan(doc, range, targetPosition, side) {
  if (["left", "right"].includes(side)) return columnRelocationPlan(doc, range, targetPosition, side);
  if (!range || !["before", "after"].includes(side)) return null;
  const tree = treeOf(doc), origins = selectedPositions(range);
  const entries = origins.map(position => tree.byPosition.get(position));
  if (entries.some(entry => !entry?.parent)) return null;
  const selected = new Set(entries);
  let target = tree.byPosition.get(blockUnitPosition(doc, targetPosition));
  if (!target?.parent || target.node.type.spec.selectable === false) return null;
  for (let ancestor = target; ancestor; ancestor = ancestor.parent) if (selected.has(ancestor)) return null;
  if (lists.has(target.node.type.name)) target = side === "before" ? target.children[0] : target.children.at(-1);
  if (!target || selected.has(target)) return null;
  const logicalOwner = entry => items.has(entry.node.type.name) && lists.has(entry.parent.node.type.name) ? entry.parent.parent : entry.parent;
  const destination = logicalOwner(target), owners = new Set([...entries.map(logicalOwner), destination]);
  if (owners.has(null)) return null;
  const slots = new Map([...owners].map(owner => [owner, siblingSlots(owner, selected)]));
  const moving = origins.map(origin => {
    const entry = tree.byPosition.get(origin);
    return slots.get(logicalOwner(entry)).find(slot => slot.entry === entry);
  });
  if (moving.some(slot => !slot)) return null;
  for (const owner of owners) slots.set(owner, slots.get(owner).filter(slot => !selected.has(slot.entry)));
  let siblings = slots.get(destination), index = siblings.findIndex(slot => slot.entry === target);
  if (index < 0) return null;
  if (side === "after") index += 1;
  // A sole canonical blank is the destination answer's input, not an authored
  // spacer. Styled blanks and empty paragraphs among real content stay intact.
  if (["questionSection", "column"].includes(destination.node.type.name) && siblings.length === 1 && !siblings[0].list && target.node.eq(doc.type.schema.nodes.paragraph.create())) { siblings = []; index = 0; }
  slots.set(destination, [...siblings.slice(0, index), ...moving, ...siblings.slice(index)]);
  for (const owner of owners) if (!slots.get(owner).length && owner.node.type.name !== "column") slots.set(owner, [{ entry: newEntry(doc.type.schema.nodes.paragraph.create(), []), list: null }]);
  const depth = entry => { let result = 0; for (let parent = entry.parent; parent; parent = parent.parent) result += 1; return result; };
  const usedOrigins = new Set();
  for (const owner of [...owners].sort((a, b) => depth(b) - depth(a))) reconstructOwner(owner, slots.get(owner), usedOrigins);
  pruneColumns(tree.root, doc.type.schema);
  const output = renderTree(tree.root);
  try { output.doc.check(); } catch { return null; }
  if (!canReloadNestedBlocks(output.doc)) return null;
  if (isQuestionDocument(doc) && !isQuestionDocument(output.doc) || output.doc.eq(doc)) return null;
  return { ...output, source: tree, origins };
}

function transactionFromPlan(state, range, plan) {
  if (!plan) return null;
  const point = (position, association = 1) => {
    let best = null;
    for (const [origin, entry] of plan.source.byPosition) {
      if (origin <= position && (association >= 0 || origin < position) && position <= origin + entry.node.nodeSize && plan.positions.has(origin) && (!best || origin >= best.origin)) best = entry;
    }
    return best ? plan.positions.get(best.origin) + Math.min(position - best.origin, best.node.nodeSize) : Math.min(position, plan.doc.content.size);
  };
  const mapping = { map: point, mapResult: (position, association) => new MapResult(point(position, association), 0, null) };
  const tr = state.tr.replaceWith(0, state.doc.content.size, plan.doc.content);
  const ranges = range.ranges || [range];
  const inside = ranges.some(run => state.selection.from >= run.from && state.selection.to <= run.to) || Boolean(range.positions);
  if (inside) tr.setSelection(state.selection.getBookmark().map(mapping).resolve(tr.doc));
  else tr.setSelection(Selection.near(tr.doc.resolve(Math.min(plan.positions.get(plan.origins[0]) + 1, tr.doc.content.size))));
  if (tr.selection.empty && state.storedMarks) tr.setStoredMarks(state.storedMarks);
  return tr;
}

export function blockMoveTransaction(state, range, direction) {
  return transactionFromPlan(state, range, blockMovePlan(state.doc, range, direction));
}

export function blockRelocationTransaction(state, range, position, side) {
  return transactionFromPlan(state, range, blockRelocationPlan(state.doc, range, position, side));
}
