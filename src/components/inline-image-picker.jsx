import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Upload } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useVisualViewportBoundary } from "@/hooks/use-visual-viewport";
import { INLINE_IMAGE_REQUEST, safeImageSource, validateInlineImageFile } from "@/lib/inline-image-intent";
import { commitInlineImage, inlineImagePosition } from "@/lib/inline-images";

export function InlineImagePicker({ editor, onVisibilityChange }) {
  const [request, setRequest] = useState(null), [source, setSource] = useState(""), [alt, setAlt] = useState("");
  const [width, setWidth] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const current = useRef(null), generation = useRef(0), sourceInput = useRef(null), fileInput = useRef(null);
  const uploadButton = useRef(null);
  const popup = useRef(null);
  const [anchorVersion, setAnchorVersion] = useState(0);
  const anchor = useMemo(() => request?.anchor && { ...request.anchor }, [request, anchorVersion]);
  const fieldId = useId();
  const boundary = useVisualViewportBoundary(Boolean(request));
  const restoreFocus = () => { if (!editor.isDestroyed && editor.isEditable) editor.view.focus(); };
  const close = () => { generation.current++; current.current = null; setRequest(null); setBusy(false); restoreFocus(); };
  useLayoutEffect(() => {
    onVisibilityChange?.(Boolean(request));
    return () => onVisibilityChange?.(false);
  }, [request, onVisibilityChange]);
  useEffect(() => {
    let root = null;
    const open = event => {
      if (!editor.isEditable || editor.isDestroyed || editor.view.composing || event.detail.doc !== editor.state.doc || !event.detail.selection.eq(editor.state.selection)) return;
      generation.current++;
      const next = event.detail, position = inlineImagePosition(next);
      const node = editor.state.doc.nodeAt(position), existing = !next.side && !next.suggestion && node?.type.name === "image" ? node : null;
      const element = editor.view.nodeDOM(position), rect = element?.getBoundingClientRect?.();
      next.anchor = rect ? { contextElement: root, getBoundingClientRect: () => element.isConnected ? element.getBoundingClientRect() : rect } : undefined;
      next.existing = existing;
      current.current = next; setRequest(next); setSource(existing?.attrs.src || ""); setAlt(existing?.attrs.alt || "");
      setWidth(existing?.attrs.width == null ? "" : String(existing.attrs.width)); setError(""); setBusy(false);
      setAdvanced(Boolean(existing));
      event.preventDefault();
    };
    const invalidate = () => {
      if (current.current && (!editor.isEditable || editor.isDestroyed || editor.view.composing || editor.state.doc !== current.current.doc || !editor.state.selection.eq(current.current.selection))) {
        generation.current++; current.current = null; setRequest(null); setBusy(false);
      }
    };
    const detach = () => {
      root?.removeEventListener(INLINE_IMAGE_REQUEST, open); root = null;
      generation.current++; current.current = null; setRequest(null); setBusy(false);
    };
    const attach = () => {
      if (editor.isDestroyed) return;
      root?.removeEventListener(INLINE_IMAGE_REQUEST, open);
      root = editor.view.dom; root.addEventListener(INLINE_IMAGE_REQUEST, open);
    };
    editor.on("mount", attach); editor.on("create", attach); editor.on("unmount", detach);
    if (editor.isInitialized) attach();
    editor.on("transaction", invalidate);
    return () => { detach(); editor.off("mount", attach); editor.off("create", attach); editor.off("unmount", detach); editor.off("transaction", invalidate); };
  }, [editor]);
  useEffect(() => {
    if (!request || typeof ResizeObserver === "undefined") return;
    const token = generation.current;
    let frame = 0;
    // Upload/error/disclosure rows resize this popup. Reposition in the next
    // frame, never inside ResizeObserver's delivery (which can resize its own
    // floating element and raise an undelivered-notification error).
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (token === generation.current) setAnchorVersion(value => value + 1); });
    });
    observer.observe(editor.view.dom);
    if (popup.current) observer.observe(popup.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [editor, request]);

  const attributes = src => {
    const previous = request.existing?.attrs;
    const nextWidth = previous && width === String(previous.width ?? "") ? previous.width : width === "" ? null : Number(width);
    return { src, alt, title: previous?.title ?? null, width: nextWidth,
      height: previous && safeImageSource(src) === previous.src && nextWidth === previous.width ? previous.height : null };
  };
  const validWidth = () => request.existing && width === String(request.existing.attrs.width ?? "") || width === "" || Number.isInteger(Number(width)) && Number(width) > 0 && Number(width) <= 100000;
  const apply = event => {
    event.preventDefault();
    if (busy) return;
    if (!safeImageSource(source)) { setError("Укажите адрес изображения, начинающийся с https:// или /."); return; }
    if (!validWidth()) { setError("Укажите ширину от 1 до 100000 пикселей или оставьте поле пустым."); return; }
    if (commitInlineImage(editor, request, attributes(source))) close();
    else { setError("Документ изменился. Выберите место для изображения ещё раз."); }
  };
  const upload = async file => {
    if (!file || busy) return;
    const validation = validateInlineImageFile(file);
    if (validation) { setError(validation); return; }
    if (!validWidth()) { setError("Укажите корректную ширину изображения."); return; }
    const owned = current.current, token = generation.current;
    setError(""); setBusy(true);
    let uploaded, committed = false;
    try {
      uploaded = await api.uploadImage(file);
      if (token !== generation.current || current.current !== owned) return;
      if (!safeImageSource(uploaded.imageUrl)) throw new Error("Сервер не вернул адрес изображения.");
      committed = commitInlineImage(editor, owned, attributes(uploaded.imageUrl));
      if (committed) close();
      else setError("Документ изменился. Выберите место для изображения ещё раз.");
    } catch (uploadError) {
      if (token === generation.current) setError(uploadError.message || "Не удалось загрузить изображение. Повторите попытку.");
    } finally {
      if (token === generation.current) {
        setBusy(false);
        if (fileInput.current) fileInput.current.value = "";
      }
      // A committed asset belongs to document history: Undo must never break
      // its URL. Only this just-uploaded, never-inserted asset can be released.
      if (!committed && /^[0-9a-f-]{36}$/i.test(uploaded?.id || "")) await api.delete(`/uploads/images/${encodeURIComponent(uploaded.id)}`).catch(() => {});
    }
  };
  if (!request) return null;
  return <Popover open onOpenChange={open => { if (!open) close(); }}>
    <PopoverContent ref={popup} sticky disableAnchorTracking anchor={anchor} collisionBoundary={boundary} collisionPadding={16} collisionAvoidance={{ side: "shift", align: "shift" }} positionMethod="fixed" className="inline-editor__image-menu rollapp-body" aria-label={request.existing ? "Изменить изображение" : "Добавить изображение"} initialFocus={() => {
      // A user may already choose another field before opening focus settles.
      // Let the primitive guard its queued focus instead of an unconditional RAF.
      if (popup.current?.contains(popup.current.ownerDocument.activeElement)) return false;
      return request.existing ? sourceInput.current : uploadButton.current;
    }} finalFocus={() => { restoreFocus(); return false; }}>
      <form className="inline-editor__image-form" onSubmit={apply} onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); close(); } }}>
        <Button ref={uploadButton} type="button" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}><Upload data-icon="inline-start" className="size-5" aria-hidden="true" />{busy ? "Загружаем…" : "Загрузить изображение"}</Button>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Файл изображения" tabIndex={-1} className="sr-only" onChange={event => upload(event.target.files?.[0])} />
        <Field><FieldLabel htmlFor={`${fieldId}-source`}>Адрес изображения</FieldLabel><Input id={`${fieldId}-source`} ref={sourceInput} value={source} disabled={busy} placeholder="https://…" onChange={event => setSource(event.target.value)} /></Field>
        <Button type="button" variant="ghost" className="justify-start" aria-expanded={advanced} disabled={busy} onClick={() => setAdvanced(value => !value)}><ChevronDown data-icon="inline-start" className={advanced ? "size-5 rotate-180" : "size-5"} aria-hidden="true" />Описание и размер</Button>
        {advanced && <>
        <Field><FieldLabel htmlFor={`${fieldId}-alt`}>Описание изображения</FieldLabel><Input id={`${fieldId}-alt`} value={alt} disabled={busy} onChange={event => setAlt(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor={`${fieldId}-width`}>Ширина в пикселях</FieldLabel><Input id={`${fieldId}-width`} inputMode="numeric" value={width} disabled={busy} placeholder="По размеру изображения" onChange={event => setWidth(event.target.value)} /></Field>
        </>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {busy && <span role="status">Загружаем изображение…</span>}
        <div className="inline-editor__image-actions"><Button type="submit" disabled={busy}>{request.existing ? "Применить" : "Добавить"}</Button><Button type="button" variant="ghost" onClick={close}>Отмена</Button></div>
      </form>
    </PopoverContent>
  </Popover>;
}
