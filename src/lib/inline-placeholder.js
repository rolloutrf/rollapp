import Placeholder from "@tiptap/extension-placeholder";
import { isNodeEmpty } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Resolve the active textblock directly. The upstream incremental descendant
// cache can retain a node decoration after the caret leaves an empty paragraph.
// Selection-only changes must retire it without touching the authored document.
export function inlinePlaceholderDecorations(state, editor, options) {
  const { selection, doc } = state;
  if (!editor.isEditable || !(selection instanceof TextSelection) || !selection.empty) return DecorationSet.empty;
  const { $anchor } = selection;
  const node = $anchor.parent;
  if (!$anchor.depth || !node.isTextblock || !isNodeEmpty(node)) return DecorationSet.empty;
  const pos = $anchor.before();
  const props = { editor, node, pos, hasAnchor: true };
  const placeholder = typeof options.placeholder === "function" ? options.placeholder(props) : options.placeholder;
  const emptyClass = typeof options.emptyNodeClass === "function" ? options.emptyNodeClass(props) : options.emptyNodeClass;
  return DecorationSet.create(doc, [Decoration.node(pos, $anchor.after(), {
    class: [emptyClass, editor.isEmpty ? options.emptyEditorClass : ""].filter(Boolean).join(" "),
    "data-placeholder": placeholder,
  })]);
}

export const InlinePlaceholder = Placeholder.extend({
  addProseMirrorPlugins() {
    return [new Plugin({ props: { decorations: state => inlinePlaceholderDecorations(state, this.editor, this.options) } })];
  },
});
