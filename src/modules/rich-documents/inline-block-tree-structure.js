import { Fragment } from "@tiptap/pm/model";

// Origin is occurrence-specific; duplicate blocks may share the same immutable
// ProseMirror node object. No temporary identity is written into saved content.
export function treeOf(doc) {
  const byPosition = new Map();
  const walk = (node, position, parent = null) => {
    const entry = { node, origin: position, parent, children: [], aliases: [] };
    if (position >= 0) byPosition.set(position, entry);
    node.forEach((child, offset) => entry.children.push(walk(child, position < 0 ? offset : position + 1 + offset, entry)));
    return entry;
  };
  return { root: walk(doc, -1), byPosition };
}
export function attach(parent, children) { parent.children = children; for (const child of children) child.parent = parent; }
export function newEntry(node, children, origin = null) { const entry = { node, origin, parent: null, children: [], aliases: [] }; attach(entry, children); return entry; }
export function renderTree(root) {
  const positions = new Map();
  const render = (entry, position) => {
    if (entry.origin != null && entry.origin >= 0) positions.set(entry.origin, position);
    for (const alias of entry.aliases) positions.set(alias, position);
    if (entry.node.isLeaf) return entry.node;
    let offset = 0;
    const children = entry.children.map(child => { const result = render(child, position < 0 ? offset : position + 1 + offset); offset += result.nodeSize; return result; });
    return children.length === entry.node.childCount && children.every((child, index) => child === entry.node.child(index)) ? entry.node : entry.node.copy(Fragment.fromArray(children));
  };
  return { doc: render(root, -1), positions };
}
