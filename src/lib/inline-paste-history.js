import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";

// Run after clipboard rules so appended transforms stay in the clipboard
// action's history event. Subsequent native typing starts a fresh event.
export function pasteHistoryBoundary() {
  let pendingPaste = null;
  return new Plugin({
    props: {
      handleDOMEvents: {
        paste(view) {
          if (!view.editable) return false;
          // Table cell paste is handled upstream without a uiEvent marker.
          // Observe the native event before any clipboard handler runs, keeping
          // its synchronous document transaction between history boundaries.
          const intent = {};
          pendingPaste = intent;
          queueMicrotask(() => { if (pendingPaste === intent) pendingPaste = null; });
          view.dispatch(closeHistory(view.state.tr));
          return false;
        },
      },
    },
    appendTransaction(transactions, _old, state) {
      if (!transactions.some(tr => tr.docChanged)) return null;
      const clipboard = pendingPaste || transactions.some(tr => tr.docChanged && ["paste", "cut"].includes(tr.getMeta("uiEvent")));
      pendingPaste = null;
      return clipboard ? closeHistory(state.tr) : null;
    },
  });
}
export const InlinePasteHistory = Extension.create({
  name: "inlinePasteHistory", priority: -100,
  addProseMirrorPlugins: () => [pasteHistoryBoundary()],
});
