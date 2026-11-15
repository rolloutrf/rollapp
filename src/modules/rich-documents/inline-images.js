import { createChainableState } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { insertTextBlock, selectedBlockPosition } from "./inline-blocks.js";
import { requestInlineCaretReveal } from "./inline-caret-intent.js";
import { safeImageSource } from "./inline-image-intent.js";

function caretImageRequest(request) {
  const selection = request.selection;
  return request.position == null && selection instanceof TextSelection && selection.empty && selection.$from.depth > 0 && selection.$from.parent.isTextblock && selection.$from.parent.type.name !== "detailsSummary";
}

export function inlineImagePosition(request) {
  const selected = request.selection;
  const explicit = request.doc?.nodeAt(request.position ?? selectedBlockPosition(selected));
  if (!request.side && !request.suggestion && explicit?.type.name === "captionedImage" && selected instanceof NodeSelection) return (request.position ?? selectedBlockPosition(selected)) + 1;
  if (!request.side && !request.suggestion && selected instanceof NodeSelection && selected.node.type.name === "image") {
    // Generic block actions address a nested parent and its children. Media
    // metadata still belongs to its actually selected head image, not a new
    // sibling outside that parent; a hovered unrelated target stays explicit.
    if (request.position == null || request.position === selected.from || request.position === selectedBlockPosition(selected)) return selected.from;
  }
  return caretImageRequest(request) ? request.selection.$from.before() : request.position ?? selectedBlockPosition(request.selection);
}

export function commitInlineImage(editor, request, attributes) {
  const src = safeImageSource(attributes.src);
  if (!src || !editor.isEditable || editor.isDestroyed || editor.view.composing || editor.state.doc !== request.doc || !editor.state.selection.eq(request.selection)) return false;
  const position = inlineImagePosition(request);
  const node = editor.state.doc.nodeAt(position);
  const previous = !request.side && !request.suggestion && node?.type.name === "image" ? node.attrs : {};
  const attrs = { alt: "", title: null, width: null, height: null, ...previous, ...attributes, src };
  const result = editor.chain().command(({ tr, state }) => {
    closeHistory(tr);
    tr.setSelection(request.selection);
    const existing = tr.doc.nodeAt(position);
    if (!request.side && !request.suggestion && existing?.type.name === "image") {
      tr.setNodeMarkup(position, undefined, { ...existing.attrs, ...attrs });
      tr.setSelection(NodeSelection.create(tr.doc, position));
    } else {
      if (request.suggestion) tr.delete(request.suggestion.from, request.suggestion.to);
      const target = tr.mapping.map(position, -1), node = tr.doc.nodeAt(target);
      const side = request.side ?? (node?.type.name === "paragraph" && !node.content.size ? "replace" : "after");
      const scoped = {
        schema: editor.schema,
        state: createChainableState({ state, transaction: tr }),
        view: { focus() {}, dispatch() {} },
        commands: { focus() {} },
      };
      if (!insertTextBlock(scoped, target, side, "image", { separateHistory: false, attrs, scopeToTextBlock: caretImageRequest(request) })) {
        tr.setMeta("preventDispatch", true);
        return false;
      }
    }
    editor.view.focus();
    return true;
  }).run();
  if (result) {
    editor.view.dispatch(closeHistory(editor.state.tr));
    requestInlineCaretReveal(editor.view, { cell: true });
  }
  return result;
}
