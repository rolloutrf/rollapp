import { INLINE_CARET_REVEAL, requestInlineCaretReveal } from "@/lib/inline-caret-intent";
import { useEffect } from "react";
import { TextSelection } from "@tiptap/pm/state";
import { measureVisualViewport } from "@/hooks/use-visual-viewport";

function nativeCaretRect(root, selection, fallback) {
  const range = root.ownerDocument.createRange();
  range.setStart(selection.focusNode, selection.focusOffset); range.collapse(true);
  const rect = range.getBoundingClientRect();
  if (rect.height) return rect;
  if (fallback) return fallback(selection);
  // Chromium returns no collapsed rectangle on a plaintext blank line. A
  // one-character range still reports that line without changing selection.
  const node = selection.focusNode, offset = selection.focusOffset;
  if (node.nodeType === Node.TEXT_NODE) {
    const forward = offset < node.length;
    if (!forward && !offset) return null;
    range.setStart(node, forward ? offset : offset - 1);
    range.setEnd(node, forward ? offset + 1 : offset);
    const rects = [...range.getClientRects()].filter(value => value.height);
    const measured = forward ? rects[0] : rects.at(-1);
    if (!measured) return null;
    const shift = !forward && node.textContent[offset - 1] === "\n" ? parseFloat(getComputedStyle(root).lineHeight) : 0;
    return { top: measured.top + shift, bottom: measured.bottom + shift, height: measured.height };
  }
  const child = node.childNodes[offset];
  if (child) {
    range.setEndAfter(child);
    const measured = [...range.getClientRects()].find(value => value.height);
    if (measured) return measured;
  }
  const box = node.getBoundingClientRect?.();
  if (!box) return null;
  const height = parseFloat(getComputedStyle(root).lineHeight);
  return { top: box.top, bottom: box.top + height, height };
}

// Observe editing intent and confirmed authoring commands, never document
// scrolling or unrelated programmatic selection.
// The browser retains native selection, grapheme, bidi, IME and undo behavior.
function observeCaret(root, ready, fallback, { onHistory, canPageScroll = ready } = {}) {
  const doc = root.ownerDocument;
  let frame = 0, composing = false, generation = 0;
  let pendingCleanups = [];
  const cancel = () => {
    generation++;
    cancelAnimationFrame(frame); frame = 0;
    for (const cleanup of pendingCleanups) cleanup();
    pendingCleanups = [];
    doc.removeEventListener("wheel", cancel);
    doc.removeEventListener("touchmove", cancel);
  };
  const reveal = (final = true) => {
    if (final) cancel();
    else frame = 0;
    if (composing || !root.isConnected || !root.isContentEditable || doc.activeElement !== root || !ready()) return;
    if (Math.abs((window.visualViewport?.scale ?? 1) - 1) > 0.01) return;
    const selection = doc.getSelection();
    if (!selection?.focusNode || !root.contains(selection.focusNode)) return;
    const rect = nativeCaretRect(root, selection, fallback);
    if (!rect || !(rect.bottom > rect.top)) return;
    const viewport = measureVisualViewport(window);
    const header = doc.querySelector(".global-app-chrome")?.getBoundingClientRect();
    const navigation = doc.querySelector(".mobile-app-navigation")?.getBoundingClientRect();
    const top = Math.max(viewport.offsetTop, header?.height ? header.bottom : 0) + 8;
    const bottom = Math.min(viewport.offsetTop + viewport.height, navigation?.height ? navigation.top : Infinity) - 8;
    if (bottom - top < rect.bottom - rect.top) return;
    const delta = rect.top < top ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
    // Document scrolling can round a fractional CSS pixel towards zero. Round
    // outwards so the caret keeps the complete clearance from fixed chrome.
    if (delta) window.scrollBy({ top: delta < 0 ? Math.floor(delta) : Math.ceil(delta), behavior: "instant" });
  };
  const schedule = () => {
    cancel();
    const requested = generation;
    doc.addEventListener("wheel", cancel, { passive: true });
    doc.addEventListener("touchmove", cancel, { passive: true });
    frame = requestAnimationFrame(() => {
      if (requested !== generation) return;
      const selection = doc.getSelection();
      const anchor = selection?.anchorNode, anchorOffset = selection?.anchorOffset;
      const focus = selection?.focusNode, focusOffset = selection?.focusOffset;
      const fonts = doc.fonts;
      let fontsPending = fonts?.status === "loading";
      const imagesPending = new Set();
      const stillOwned = () => {
        if (requested !== generation) return false;
        const current = doc.getSelection();
        if (current?.anchorNode !== anchor || current?.anchorOffset !== anchorOffset || current?.focusNode !== focus || current?.focusOffset !== focusOffset) { cancel(); return false; }
        return true;
      };
      const reconcile = () => {
        if (!stillOwned()) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (!stillOwned()) return;
          frame = requestAnimationFrame(() => { if (stillOwned()) reveal(!fontsPending && !imagesPending.size); });
        });
      };
      // Images before this caret can change its position after the first
      // layout. Observe only the assets pending during this authoring intent;
      // loading a document or manually scrolling never starts reconciliation.
      if (focus && root.contains(focus)) {
        const caret = doc.createRange();
        caret.setStart(focus, focusOffset); caret.collapse(true);
        for (const image of root.querySelectorAll("img")) {
          if (image.complete || caret.comparePoint(image, 0) >= 0) continue;
          imagesPending.add(image);
          const cleanup = () => { image.removeEventListener("load", settled); image.removeEventListener("error", settled); };
          const settled = () => { cleanup(); imagesPending.delete(image); reconcile(); };
          image.addEventListener("load", settled); image.addEventListener("error", settled);
          pendingCleanups.push(cleanup);
          if (image.complete) settled();
        }
      }
      // Reveal now, then recheck final metrics while the same native range
      // still owns the intent. Every asset/font can settle independently.
      frame = requestAnimationFrame(() => { if (stillOwned()) reveal(!fontsPending && !imagesPending.size); });
      if (fontsPending) void fonts.ready.then(() => { fontsPending = false; reconcile(); });
    });
  };
  const key = event => {
    if (event.isComposing || event.altKey && !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    // On macOS bare Home/End scroll the document without moving its caret.
    // Use the same endpoints instantly: a native keyboard scroll animation
    // otherwise continues over the next editing key and overrides its reveal.
    if (!composing && event.cancelable && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && /Mac/.test(doc.defaultView.navigator.platform) && doc.activeElement === root && canPageScroll() && ["Home", "End"].includes(event.key)) {
      cancel();event.preventDefault();
      const page = doc.scrollingElement;
      window.scrollTo({ top: event.key === "Home" ? 0 : page.scrollHeight - page.clientHeight, left: window.scrollX, behavior: "instant" });
      return;
    }
    const history = (event.metaKey || event.ctrlKey) && !event.altKey && (["z", "y"].includes(event.key.toLowerCase()) || ["KeyZ", "KeyY"].includes(event.code));
    if (history && ready() && onHistory?.()) return;
    if (history || ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Enter", "Backspace", "Delete", "Tab"].includes(event.key) || event.key.length === 1 && !event.metaKey && !event.ctrlKey) schedule();
  };
  const before = event => {
    if (["historyUndo", "historyRedo"].includes(event.inputType) && ready() && onHistory?.()) return;
    schedule();
  };
  const start = () => { composing = true; cancel(); };
  const end = () => { composing = false; schedule(); };
  root.addEventListener(INLINE_CARET_REVEAL, schedule);
  root.addEventListener("keydown", key); root.addEventListener("beforeinput", before); root.addEventListener("input", schedule);
  root.addEventListener("compositionstart", start); root.addEventListener("compositionend", end);
  return () => { cancel(); root.removeEventListener(INLINE_CARET_REVEAL, schedule); root.removeEventListener("keydown", key); root.removeEventListener("beforeinput", before); root.removeEventListener("input", schedule); root.removeEventListener("compositionstart", start); root.removeEventListener("compositionend", end); };
}

export function useInlineCaretVisibility(editor) {
  useEffect(() => {
    if (!editor) return;
    let detach = () => {};
    const unbind = () => { detach(); detach = () => {}; };
    const attach = () => {
      unbind();
      if (editor.isDestroyed) return;
      detach = observeCaret(editor.view.dom, () => !editor.isDestroyed && editor.isEditable && !editor.view.composing && editor.state.selection instanceof TextSelection,
        selection => editor.view.coordsAtPos(editor.view.posAtDOM(selection.focusNode, selection.focusOffset)),
        { onHistory: () => requestInlineCaretReveal(editor.view, { cell: true }), canPageScroll: () => !editor.isDestroyed && editor.isEditable && !editor.view.composing });
    };
    editor.on("mount", attach); editor.on("unmount", unbind); attach();
    return () => { unbind(); editor.off("mount", attach); editor.off("unmount", unbind); };
  }, [editor]);
}

export function useInlineFieldCaretVisibility(ref, disabled) {
  useEffect(() => {
    if (!ref.current || disabled) return;
    return observeCaret(ref.current, () => !disabled);
  }, [ref, disabled]);
}
