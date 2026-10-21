import { safeImageSource } from "./inline-image-intent.js";

// Viewing media never dispatches a transaction or changes its selection. The
// caller retains the exact instance, document, native node and access owner.
export function captureImageViewer(editor, image) {
  if (!editor || editor.isDestroyed || !editor.isInitialized || editor.view.composing || !image?.isConnected || !editor.view.dom.contains(image)) return null;
  try {
    const position = editor.view.posAtDOM(image, 0);
    const node = editor.state.doc.nodeAt(position);
    const src = safeImageSource(node?.attrs?.src);
    if (node?.type.name !== "image" || !src || editor.view.nodeDOM(position) !== image || safeImageSource(image.getAttribute("src")) !== src) return null;
    return { editor, image, position, node, src, doc: editor.state.doc, selection: editor.state.selection, editable: editor.isEditable };
  } catch { return null; }
}

export function ownsImageViewer(editor, request) {
  if (!request || request.editor !== editor || !editor || editor.isDestroyed || !editor.isInitialized || editor.view.composing || editor.isEditable !== request.editable) return false;
  const { doc, selection } = editor.state;
  if (doc !== request.doc || !selection.eq(request.selection)) return false;
  const current = captureImageViewer(editor, request.image);
  return Boolean(current && current.position === request.position && current.node === request.node && current.src === request.src);
}
