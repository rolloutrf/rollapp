import { Fragment, Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { canReloadNestedBlocks } from "./inline-block-depth.js";
import { safeImageSource, validateInlineImageFile } from "./inline-image-intent.js";
import { requestInlineCaretReveal } from "./inline-caret-intent.js";
import { deleteQuestionRange, selectedQuestionScopes, validQuestionDocument } from "./four-question-document.js";

export function imageTransferTransaction(state, request, attributes) {
  if (state.doc !== request.doc || !state.selection.eq(request.selection) || !Array.isArray(attributes) || !attributes.length) return null;
  if (attributes.some(attrs => !safeImageSource(attrs?.src))) return null;
  const images = attributes.map(attrs => state.schema.nodes.image.create({ alt: "", title: null, width: null, height: null, ...attrs, src: safeImageSource(attrs.src) }));
  const paragraph = () => state.schema.nodes.paragraph.create();
  // A closed slice retains its owned paragraph; the native fitter splits the
  // surrounding prose and keeps its rich prefix/suffix in their own blocks.
  const content = Fragment.fromArray([...images, paragraph()]);
  const protectedQuestions = state.doc.firstChild?.type.name === "questionSection";
  const tr = closeHistory(state.tr);
  if (request.insertAt != null) {
    if (!Number.isInteger(request.insertAt) || request.insertAt < 0 || request.insertAt > state.doc.content.size) return null;
    tr.insert(request.insertAt, content);
  } else {
    if (protectedQuestions && selectedQuestionScopes(state).length > 1) deleteQuestionRange(state, tr);
    tr.replaceSelection(new Slice(content, 0, 0));
  }
  if (protectedQuestions && !validQuestionDocument(tr.doc)) return null;
  if (!canReloadNestedBlocks(tr.doc)) return null;
  const positions = [];
  tr.doc.descendants((node, position) => { if (images.includes(node)) positions.push(position); });
  // Reject a fit that drops or duplicates media instead of committing a partial
  // batch. No IDs or temporary upload decorations enter the authored document.
  if (positions.length !== images.length) return null;
  const caret = positions.at(-1) + images.at(-1).nodeSize;
  const tail = tr.doc.nodeAt(caret);
  if (tail?.type.name !== "paragraph" || tail.content.size) return null;
  tr.doc.check();
  return tr.setSelection(TextSelection.create(tr.doc, caret + 1)).setMeta("paste", true);
}

export function commitImageTransfer(editor, request, attributes, { isCurrent = () => true } = {}) {
  if (!isCurrent() || editor.isDestroyed || !editor.isEditable || editor.view.composing) return false;
  const tr = imageTransferTransaction(editor.state, request, attributes);
  if (!tr) return false;
  editor.view.focus();
  if (!isCurrent() || editor.isDestroyed || !editor.isEditable || editor.view.composing || editor.state.doc !== request.doc || !editor.state.selection.eq(request.selection)) return false;
  editor.view.dispatch(request.reveal === false ? tr : tr.scrollIntoView());
  if (editor.state.doc === request.doc) return false;
  editor.view.dispatch(closeHistory(editor.state.tr));
  if (request.reveal !== false) requestInlineCaretReveal(editor.view, { cell: true });
  return true;
}

// Uploads are not authored content. Commit the complete batch only while its
// original owner still exists, and release only newly uploaded, never-used IDs.
export async function uploadImageTransfer(editor, request, files, { upload, release, isCurrent = () => true }) {
  const validation = !files?.length ? "Выберите изображения." : files.map(validateInlineImageFile).find(Boolean);
  if (validation) return { status: "error", error: validation };
  const owned = () => isCurrent() && !editor.isDestroyed && editor.isEditable && !editor.view.composing && editor.state.doc === request.doc && editor.state.selection.eq(request.selection);
  if (!owned()) return { status: "cancelled" };
  if (!imageTransferTransaction(editor.state, request, files.map(() => ({ src: "/__pending_image_transfer__" })))) return { status: "error", error: "В этом месте нельзя вставить изображения. Выберите место в тексте." };
  const assets = [];
  let committed = false;
  try {
    for (const file of files) {
      if (!owned()) return { status: "cancelled" };
      const asset = await upload(file);
      assets.push(asset);
      if (!owned()) return { status: "cancelled" };
      if (!safeImageSource(asset?.imageUrl)) throw new Error("Сервер не вернул адрес изображения.");
    }
    committed = owned() && commitImageTransfer(editor, request, assets.map((asset, index) => ({ src: asset.imageUrl, alt: files[index].name || "" })), { isCurrent: owned });
    return committed ? { status: "committed" } : { status: "cancelled" };
  } catch (error) {
    return owned() ? { status: "error", error: error.message || "Не удалось загрузить изображения." } : { status: "cancelled" };
  } finally {
    if (!committed) for (const asset of assets) {
      if (/^[0-9a-f-]{36}$/i.test(asset?.id || "")) await Promise.resolve().then(() => release(asset.id)).catch(() => {});
    }
  }
}
