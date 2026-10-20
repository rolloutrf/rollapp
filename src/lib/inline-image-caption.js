import { Node } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { blockHTML } from "./inline-table-markdown.js";
import { canReloadNestedBlocks } from "./inline-block-depth.js";
import { requestInlineCaretReveal } from "./inline-caret-intent.js";

// A caption is authored inline content, never an alt/title string or a second
// editor. Keep the existing leaf image intact inside one movable document unit.
export const CaptionedImage = Node.create({
  name: "captionedImage", group: "block", content: "image imageCaption", defining: true,
  parseHTML: () => [{ tag: 'figure[data-type="captionedImage"]' }],
  renderHTML: () => ["figure", { "data-type": "captionedImage" }, 0],
  renderMarkdown: node => blockHTML(node),
});

export const ImageCaption = Node.create({
  name: "imageCaption", content: "inline*", defining: true, selectable: false,
  parseHTML: () => [{ tag: 'figure[data-type="captionedImage"] > figcaption' }],
  renderHTML: () => ["figcaption", { "data-image-caption": "true" }, 0],
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state;
        if (!selection.empty || selection.$from.parent.type.name !== this.name || selection.$from.parentOffset) return false;
        return this.editor.commands.setNodeSelection(selection.$from.before(selection.$from.depth - 1));
      },
      Escape: () => {
        const { $from } = this.editor.state.selection;
        if ($from.parent.type.name !== this.name) return false;
        return this.editor.commands.setNodeSelection($from.before($from.depth - 1));
      },
      Enter: () => {
        const { state, view } = this.editor, { selection } = state;
        if (!selection.empty || selection.$from.parent.type.name !== this.name) return false;
        const after = selection.$from.after(selection.$from.depth - 1), next = state.doc.nodeAt(after);
        let tr = closeHistory(state.tr);
        if (next?.type.name !== "paragraph") tr = tr.insert(after, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        view.dispatch(tr.scrollIntoView());
        view.dispatch(closeHistory(this.editor.state.tr));
        return true;
      },
    };
  },
});

export function imageCaptionTransaction(state, request) {
  if (state.doc !== request.doc || !state.selection.eq(request.selection)) return null;
  const image = state.doc.nodeAt(request.position), wrapper = state.schema.nodes.captionedImage, caption = state.schema.nodes.imageCaption;
  if (!wrapper || !caption || image?.type.name !== "image" || image !== request.node) return null;
  const $pos = state.doc.resolve(request.position);
  // Reopening an existing caption moves only the selection, not the document.
  if ($pos.parent.type.name === "captionedImage") {
    return state.tr.setSelection(TextSelection.create(state.doc, request.position + image.nodeSize + 1));
  }
  const content = Fragment.from(wrapper.create(null, [image, caption.create()]));
  if (!$pos.parent.canReplace($pos.index(), $pos.index() + 1, content)) return null;
  const tr = closeHistory(state.tr).replaceWith(request.position, request.position + image.nodeSize, content);
  if (!canReloadNestedBlocks(tr.doc)) return null;
  return tr.setSelection(TextSelection.create(tr.doc, request.position + 1 + image.nodeSize + 1));
}

export function commitInlineImageCaption(editor, request) {
  if (editor.isDestroyed || !editor.isEditable || editor.view.composing) return false;
  const tr = imageCaptionTransaction(editor.state, request);
  if (!tr) return false;
  editor.view.focus();
  editor.view.dispatch(tr);
  if (tr.docChanged) editor.view.dispatch(closeHistory(editor.state.tr));
  requestInlineCaretReveal(editor.view, { cell: true });
  return true;
}
