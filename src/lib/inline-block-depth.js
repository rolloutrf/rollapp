// Match the canonical HTML reader's existing stack bound before producing a
// tree it cannot reload. Count element and inline-mark tags, not just indents.
function markupDepth(node, depth = 2) {
  if (node.isText || node.type.name === "hardBreak") return depth + node.marks.length;
  const next = depth + (node.isLeaf ? 0 : 1);
  let maximum = next;
  node.forEach(child => { maximum = Math.max(maximum, markupDepth(child, next)); });
  return maximum;
}
function hasNestedBlock(node) { return ["nestedBlock", "columns"].includes(node.type.name) || node.content.content.some(hasNestedBlock); }


export function canReloadNestedBlocks(doc) {
  const roots = doc.firstChild?.type.name === "questionSection"
    ? doc.content.content.flatMap(section => section.content.content) : doc.content.content;
  return !roots.some(node => hasNestedBlock(node) && markupDepth(node) > 100);
}
