import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { FullscreenDialog } from "@/components/fullscreen-dialog";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ControlBar } from "@/components/control-bar";
import { captureImageViewer, ownsImageViewer } from "@/lib/inline-image-viewer";

// A read-only surface owned by one exact editor snapshot. Opening, zooming and
// dismissal do not dispatch selection/history transactions or serialize media.
export function InlineImageViewer({ editor, disabled = false, suspended = false, accessKey, onVisibilityChange }) {
  const [request, setRequest] = useState(null);
  const [zoom, setZoom] = useState(false);
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  const active = useRef(null), restore = useRef(null), popup = useRef(null), callbacks = useRef(null);
  callbacks.current = { disabled, suspended, onVisibilityChange };
  const close = (restoreFocus = false) => { restore.current = restoreFocus === true ? active.current : null; active.current = null; setRequest(null); callbacks.current.onVisibilityChange?.(false); };
  useLayoutEffect(() => { if (disabled || suspended) close(); }, [disabled, suspended]);
  useLayoutEffect(() => { close(); }, [editor, accessKey]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const root = editor.view.dom, doc = root.ownerDocument;
    const open = image => {
      if (callbacks.current.disabled || callbacks.current.suspended || active.current) return false;
      const intent = captureImageViewer(editor, image);
      if (!intent) return false;
      active.current = intent; restore.current = null; setRequest(intent); setZoom(false); setStatus("loading"); setRetry(0);
      callbacks.current.onVisibilityChange?.(true);
      return true;
    };
    const pointer = event => {
      const image = event.target.closest?.("img");
      if (!image || (editor.isEditable && event.type !== "dblclick") || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (open(image)) { event.preventDefault(); event.stopPropagation(); }
    };
    const key = event => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.shiftKey) return;
      let image = event.target.tagName === "IMG" ? event.target : null;
      if (!image && event.altKey && event.key === "Enter") {
        const selected = editor.state.selection;
        const dom = editor.view.nodeDOM(selected.from);
        if (selected.node?.type.name === "image") image = dom;
        if (selected.node?.type.name === "captionedImage") image = dom?.querySelector("img");
      }
      if (image && (event.key === "Enter" || event.key === " ") && open(image)) { event.preventDefault(); event.stopPropagation(); }
    };
    const validate = () => { if (active.current && !ownsImageViewer(editor, active.current)) close(); };
    const compose = () => { if (active.current) close(); };
    const focus = event => {
      const other = event.target.closest?.(".inline-editor__content");
      if (active.current && other && other !== root && !popup.current?.contains(event.target)) close();
    };
    // Public readers expose image activation to keyboard users without adding
    // attributes to canonical Markdown or replacing the original image DOM.
    const attributes = new Map();
    const decorate = () => {
      if (accessKey === false && !callbacks.current.disabled) for (const image of root.querySelectorAll("img")) {
        if (attributes.has(image)) continue;
        attributes.set(image, ["tabindex", "role", "aria-label"].map(name => image.getAttribute(name)));
        image.setAttribute("tabindex", "0"); image.setAttribute("role", "button");
        image.setAttribute("aria-label", `Открыть изображение${image.alt ? `: ${image.alt}` : ""}`);
      }
    };
    decorate();
    const observer = new MutationObserver(() => { validate(); decorate(); });
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("click", pointer); root.addEventListener("dblclick", pointer, true);
    root.addEventListener("keydown", key, true); root.addEventListener("compositionstart", compose, true);
    doc.addEventListener("focusin", focus, true);
    editor.on("transaction", validate); editor.on("destroy", compose);
    return () => {
      observer.disconnect(); root.removeEventListener("click", pointer); root.removeEventListener("dblclick", pointer, true);
      root.removeEventListener("keydown", key, true); root.removeEventListener("compositionstart", compose, true);
      doc.removeEventListener("focusin", focus, true); editor.off("transaction", validate); editor.off("destroy", compose);
      for (const [image, values] of attributes) ["tabindex", "role", "aria-label"].forEach((name, i) => { if (values[i] == null) image.removeAttribute(name); else image.setAttribute(name, values[i]); });
      active.current = null;
    };
  }, [editor, disabled, accessKey]);
  if (!request || disabled || suspended) return null;
  return <FullscreenDialog onClose={() => close(true)} ref={popup} className="inline-image-viewer not-typeset rollapp-body"
    aria-label="Просмотр изображения" finalFocus={() => {
      if (restore.current === request && !disabled && !suspended && ownsImageViewer(editor, request)) {
        restore.current = null;
        if (request.editable) editor.view.focus(); else request.image.focus({ preventScroll: true });
      }
      return false;
    }}>
    <div className="inline-image-viewer__layout">
      <header className="inline-image-viewer__header">
        <DialogTitle className="sr-only">Просмотр изображения</DialogTitle>
        <DialogDescription className="sr-only">Масштабируйте изображение. Escape закрывает просмотр без изменения документа.</DialogDescription>
        <ControlBar className="flex gap-2" aria-label="Просмотр изображения">
          <Button type="button" variant="secondary" size="icon" data-control-icon aria-label={zoom ? "Уместить изображение" : "Увеличить изображение"} aria-pressed={zoom} onClick={() => setZoom(value => !value)}>{zoom ? <ZoomOut /> : <ZoomIn />}</Button>
          <Button type="button" variant="secondary" size="icon" data-control-icon aria-label="Закрыть просмотр изображения" onClick={() => close(true)}><X /></Button>
        </ControlBar>
      </header>
      <div className="inline-image-viewer__body" data-image-zoom={zoom ? "expanded" : "fit"}>
        {status === "loading" && <p role="status">Загружаем изображение…</p>}
        {status === "error" && <div className="flex flex-col items-center gap-4" role="alert"><p>Не удалось загрузить изображение.</p><Button type="button" variant="secondary" onClick={() => { setStatus("loading"); setRetry(value => value + 1); }}>Повторить</Button></div>}
        <img key={retry} src={request.src} alt={request.node.attrs.alt || ""} title={request.node.attrs.title || undefined} hidden={status === "error"} onLoad={() => setStatus("ready")} onError={() => setStatus("error")} draggable={false} />
      </div>
    </div>
  </FullscreenDialog>;
}
