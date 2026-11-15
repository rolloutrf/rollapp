export const INLINE_IMAGE_REQUEST = "rollapp:insert-image";

// Opening an attachment picker is not a document edit. Keep the exact document
// and selection until the user supplies an image, so Escape leaves no debris.
export function requestInlineImage(editor, options = {}) {
  const root = editor.view?.dom;
  if (!editor.isEditable || editor.isDestroyed || editor.view.composing || !root?.isConnected) return false;
  const EventClass = root.ownerDocument.defaultView?.CustomEvent;
  if (!EventClass) return false;
  return !root.dispatchEvent(new EventClass(INLINE_IMAGE_REQUEST, {
    cancelable: true,
    detail: { ...options, doc: editor.state.doc, selection: editor.state.selection },
  }));
}

export function safeImageSource(value) {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source || /[\u0000-\u001f\u007f\\]/.test(source)) return null;
  if (/^\/(?!\/)/.test(source)) return source;
  try {
    const url = new URL(source);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? source : null;
  } catch { return null; }
}

export function validateInlineImageFile(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Выберите изображение JPG, PNG или WEBP.";
  if (!file.size || file.size > 8 * 1024 * 1024) return "Размер изображения должен быть не больше 8 МБ.";
  return "";
}
