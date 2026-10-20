import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Selection } from "@tiptap/pm/state";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useVisualViewportBoundary } from "@/hooks/use-visual-viewport";
import { synchronizeInlineSelection } from "@/lib/inline-native-selection";
import { uploadImageTransfer } from "@/lib/inline-image-transfer";

const nativeRange = doc => {
  const selection = doc.getSelection();
  return selection && { anchorNode: selection.anchorNode, anchorOffset: selection.anchorOffset, focusNode: selection.focusNode, focusOffset: selection.focusOffset };
};
const sameRange = (doc, previous) => {
  const selection = doc.getSelection();
  return previous && selection && Object.keys(previous).every(key => previous[key] === selection[key]);
};

export function InlineImageTransfer({ editor, onVisibilityChange }) {
  const [status, setStatus] = useState(null), current = useRef(null), popup = useRef(null), begin = useRef(null);
  const viewport = useVisualViewportBoundary(Boolean(status));
  useLayoutEffect(() => { onVisibilityChange(Boolean(status)); return () => onVisibilityChange(false); }, [status, onVisibilityChange]);
  useEffect(() => {
    let root = null;
    const cancel = () => { current.current = null; setStatus(null); };
    const start = async (files, options = {}) => {
      if (!root?.isConnected || editor.isDestroyed || !editor.isEditable || editor.view.composing) return;
      const request = { ...options, doc: editor.state.doc, selection: editor.state.selection, reveal: true }, range = nativeRange(root.ownerDocument);
      const initial = editor.view.coordsAtPos(request.selection.from);
      let lastRect = new DOMRect(initial.left, initial.top, initial.right - initial.left, initial.bottom - initial.top);
      const operation = { files, request, range, anchor: { contextElement: root, getBoundingClientRect: () => {
        const doc = root?.ownerDocument;
        if (current.current !== operation || editor.isDestroyed || editor.state.doc !== request.doc || !doc || !sameRange(doc, range)) return lastRect;
        const limit = range?.focusNode?.nodeType === 3 ? range.focusNode.length : range?.focusNode?.childNodes.length;
        if (range?.focusNode?.isConnected && range.focusOffset <= limit) {
          const measured = doc.createRange(); measured.setStart(range.focusNode, range.focusOffset); measured.collapse(true);
          const rect = measured.getBoundingClientRect(); if (rect.height) lastRect = rect;
        }
        return lastRect;
      } } };
      current.current = operation; setStatus({ operation, pending: true });
      const result = await uploadImageTransfer(editor, request, files, {
        upload: file => api.uploadImage(file), release: id => api.delete(`/uploads/images/${encodeURIComponent(id)}`),
        isCurrent: () => current.current === operation && root?.isConnected && root.ownerDocument.activeElement === root && sameRange(root.ownerDocument, range),
      });
      if (current.current !== operation) return;
      if (result.status === "error") setStatus({ operation, pending: false, error: result.error }); else cancel();
    };
    begin.current = (files, options) => { if (!editor.isDestroyed && editor.isEditable && !editor.view.composing) { editor.view.focus(); void start(files, options); } };
    const paste = event => {
      const files = Array.from(event.clipboardData?.files || []);
      if (!files.length || !editor.isEditable) return;
      event.preventDefault(); event.stopImmediatePropagation(); if (editor.view.composing || event.isComposing) return;
      synchronizeInlineSelection(editor.view); void start(files);
    };
    const drop = event => {
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.length || !editor.isEditable) return;
      event.preventDefault(); event.stopImmediatePropagation(); if (editor.view.composing || event.isComposing) return;
      const point = editor.view.posAtCoords({ left: event.clientX, top: event.clientY }); if (!point) return;
      const selection = Selection.near(editor.state.doc.resolve(point.pos));
      let insertAt;
      if (selection.node?.isBlock) {
        const rect = editor.view.nodeDOM(selection.from)?.getBoundingClientRect();
        insertAt = rect && event.clientY >= rect.top + rect.height / 2 ? selection.to : selection.from;
      }
      editor.view.focus(); editor.view.dispatch(editor.state.tr.setSelection(selection)); void start(files, { insertAt });
    };
    const over = event => {
      if (editor.isEditable && Array.from(event.dataTransfer?.types || []).includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = editor.view.composing ? "none" : "copy"; }
    };
    const changed = () => {
      const operation = current.current;
      if (operation && (editor.isDestroyed || !editor.isEditable || editor.view.composing || editor.state.doc !== operation.request.doc || !editor.state.selection.eq(operation.request.selection))) cancel();
    };
    const outside = event => { if (current.current && !root?.contains(event.target) && !popup.current?.contains(event.target)) cancel(); };
    const scrolled = () => { if (current.current) current.current.request.reveal = false; };
    const key = event => { if (event.key === "Escape" && !event.isComposing && current.current) { const restore = popup.current?.contains(root.ownerDocument.activeElement); event.preventDefault(); cancel(); if (restore && !editor.isDestroyed && editor.isEditable) editor.view.focus(); } };
    const detach = () => {
      if (root) {
        root.removeEventListener("paste", paste, true); root.removeEventListener("drop", drop, true); root.removeEventListener("dragover", over, true); root.removeEventListener("compositionstart", cancel);
        root.ownerDocument.removeEventListener("pointerdown", outside, true); root.ownerDocument.removeEventListener("focusin", outside, true);
        root.ownerDocument.removeEventListener("wheel", scrolled, true); root.ownerDocument.removeEventListener("touchmove", scrolled, true); root.ownerDocument.removeEventListener("keydown", key, true); root.ownerDocument.defaultView.removeEventListener("blur", cancel);
      }
      root = null; cancel();
    };
    const attach = () => {
      detach(); if (editor.isDestroyed) return; root = editor.view.dom;
      root.addEventListener("paste", paste, true); root.addEventListener("drop", drop, true); root.addEventListener("dragover", over, true); root.addEventListener("compositionstart", cancel);
      root.ownerDocument.addEventListener("pointerdown", outside, true); root.ownerDocument.addEventListener("focusin", outside, true);
      root.ownerDocument.addEventListener("wheel", scrolled, { capture: true, passive: true }); root.ownerDocument.addEventListener("touchmove", scrolled, { capture: true, passive: true }); root.ownerDocument.addEventListener("keydown", key, true); root.ownerDocument.defaultView.addEventListener("blur", cancel);
    };
    editor.on("mount", attach); editor.on("create", attach); editor.on("unmount", detach); editor.on("transaction", changed); if (editor.isInitialized) attach();
    return () => { detach(); begin.current = null; editor.off("mount", attach); editor.off("create", attach); editor.off("unmount", detach); editor.off("transaction", changed); };
  }, [editor]);
  if (!status) return null;
  const header = document.querySelector(".global-app-chrome")?.getBoundingClientRect(), nav = document.querySelector(".mobile-app-navigation")?.getBoundingClientRect();
  const top = Math.max(viewport.y, header?.bottom || viewport.y), bottom = Math.min(viewport.y + viewport.height, nav?.top || viewport.y + viewport.height);
  const boundary = { ...viewport, y: top, height: Math.max(0, bottom - top) };
  return <Popover open onOpenChange={open => { if (!open) { current.current = null; setStatus(null); } }}>
    <PopoverContent ref={popup} anchor={status.operation.anchor} collisionBoundary={boundary} collisionPadding={8} positionMethod="fixed" side="top" sideOffset={8} initialFocus={false} finalFocus={false} className="inline-editor__transfer-menu rollapp-body" aria-label="Загрузка изображений">
      <p className="m-0" role={status.error ? "alert" : "status"}>{status.error || `Загружаем изображения: ${status.operation.files.length}…`}</p>
      <div className="flex flex-wrap gap-2">
        {status.error && <Button type="button" onClick={() => begin.current?.(status.operation.files, { insertAt: status.operation.request.insertAt })}>Повторить</Button>}
        <Button type="button" variant="ghost" onClick={() => { current.current = null; setStatus(null); if (!editor.isDestroyed && editor.isEditable) editor.view.focus(); }}>Отмена</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
