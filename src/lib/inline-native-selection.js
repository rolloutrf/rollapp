import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";

// selectionchange can arrive after a quick keypress or an accessibility text
// selection. Flush the native text range before commands consume editor state.
// Custom block, cell and whole-document selections retain their own semantics.
export function synchronizeInlineSelection(view) {
  if (view.composing || !(view.state.selection instanceof TextSelection)) return;
  const native = view.dom.ownerDocument.getSelection();
  if (!native?.anchorNode || !native.focusNode || !view.dom.contains(native.anchorNode) || !view.dom.contains(native.focusNode)) return;
  const anchor = view.posAtDOM(native.anchorNode, native.anchorOffset);
  const head = view.posAtDOM(native.focusNode, native.focusOffset);
  if (anchor < 0 || head < 0 || (anchor === view.state.selection.anchor && head === view.state.selection.head)) return;
  const selection = TextSelection.between(view.state.doc.resolve(anchor), view.state.doc.resolve(head));
  view.dispatch(view.state.tr.setSelection(selection));
}

// A fast arrow after returning from a portalled control can race the browser's
// delayed focus normalization. Collapse through the browser's own visual caret
// movement, then commit that caret immediately so normalization cannot restore
// the previous text range. Native movement also handles RTL and graphemes.
export function collapseInlineTextSelection(view, event) {
  if (!view.editable || view.composing || event.isComposing || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return false;
  if (!(view.state.selection instanceof TextSelection) || view.state.selection.empty) return false;
  const native = view.dom.ownerDocument.getSelection();
  if (!native || native.isCollapsed || typeof native.modify !== "function" || !view.dom.contains(native.anchorNode) || !view.dom.contains(native.focusNode)) return false;
  native.modify("move", event.key === "ArrowRight" ? "right" : "left", "character");
  synchronizeInlineSelection(view);
  return native.isCollapsed && view.state.selection.empty;
}


// Read an explicit native range before the document's bubble listeners can
// mistake it for the browser's focus reset and restore the preceding range.
export function observeInlineNativeSelection(view) {
  const doc = view.dom.ownerDocument;
  const update = () => {
    if (!view.editable || view.composing || doc.activeElement !== view.dom) return;
    // ProseMirror must parse native DOM input before a range can be mapped.
    // This read preserves its mutation queue; do not force a flush here, which
    // would run the recent-focus reset before the explicit range is committed.
    // Fail closed if this pinned prosemirror-view adapter is unavailable.
    const observer = view.domObserver;
    if (typeof observer?.pendingRecords !== "function" || observer.flushingSoon !== -1 || observer.suppressingSelectionUpdates) return;
    const pending = observer.pendingRecords().some(mutation => mutation.type !== "attributes" ||
      mutation.target !== view.dom && mutation.attributeName !== "contenteditable" &&
      !(mutation.attributeName === "style" && !mutation.oldValue && !mutation.target.getAttribute("style")));
    if (!pending) synchronizeInlineSelection(view);
  };
  doc.addEventListener("selectionchange", update, true);
  return () => doc.removeEventListener("selectionchange", update, true);
}

export const InlineNativeSelection = Extension.create({
  name: "inlineNativeSelection",
  addProseMirrorPlugins: () => [new Plugin({
    view(view) { return { destroy: observeInlineNativeSelection(view) }; },
  })],
});

// Core FocusEvents must run first, retaining Tiptap's public focus/blur events.
// ProseMirror then normally restores the old model selection after 20ms. A
// browser may deliver an explicit native range's selectionchange later than
// that timeout, so the restoration discards a real selection before we can
// import it. Keep the pinned focus/observer lifecycle without rewriting that
// range; explicit EditorView.focus() still restores model-owned selections.
export const InlineNativeFocus = Extension.create({
  name: "inlineNativeFocus",
  priority: 1,
  addProseMirrorPlugins: () => [new Plugin({
    props: { handleDOMEvents: {
      focus(view) {
        const observer=view.domObserver,input=view.input;
        if(view.isDestroyed || typeof observer?.stop!=="function" || typeof observer?.start!=="function" || typeof input?.lastFocus!=="number" || typeof view.focused!=="boolean") return false;
        input.lastFocus=0;
        if(!view.focused){
          observer.stop();view.dom.classList.add("ProseMirror-focused");observer.start();view.focused=true;
        }
        // An image, cell or custom block selection belongs to the model. A
        // native focus return must restore it synchronously, before a caller
        // can place a new explicit text range; never schedule a later reset.
        if (!(view.state.selection instanceof TextSelection)) view.focus();
        return true;
      },
    } },
  })],
});
