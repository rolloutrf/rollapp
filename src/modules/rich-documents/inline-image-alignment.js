import { closeHistory } from "@tiptap/pm/history";
export const safeImageAlignment = value => ["left", "center", "right"].includes(value) ? value : null;

// Alignment changes only the addressed media; it must not move a prose caret,
// rewrite dimensions or claim an image from a newer source/selection.
export function imageAlignmentTransaction(state, request, alignment) {
  if (!safeImageAlignment(alignment) || state.doc !== request.doc || !state.selection.eq(request.selection)) return null;
  const node=state.doc.nodeAt(request.position);
  if (node?.type.name !== "image" || node !== request.node || (node.attrs.alignment || "left") === alignment) return null;
  return closeHistory(state.tr).setNodeMarkup(request.position, undefined, {...node.attrs, alignment});
}
export function commitInlineImageAlignment(editor, request, alignment) {
  if (editor.isDestroyed || !editor.isEditable || editor.view.composing) return false;
  const tr=imageAlignmentTransaction(editor.state, request, alignment);
  if (!tr) return false;
  editor.view.dispatch(tr);
  editor.view.dispatch(closeHistory(editor.state.tr));
  return true;
}
