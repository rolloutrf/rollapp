export const INLINE_CARET_REVEAL = "rollapp:reveal-caret";

// Call after an explicit authoring command, never from selectionchange or
// scroll. First reveal a new table cell through its own horizontal scroller;
// the editor observer then clears app chrome after native focus settles.
export function requestInlineCaretReveal(view, { cell = false } = {}) {
  const root = view.dom;
  if (!root?.isConnected || root.ownerDocument.activeElement !== root || !view.editable || view.composing) return false;
  const selection = view.state.selection;
  if (!selection.empty || !selection.$from.parent.isTextblock) return false;
  if (cell) {
    for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
      if (!["cell", "header_cell"].includes(selection.$from.node(depth).type.spec.tableRole)) continue;
      view.nodeDOM(selection.$from.before(depth))?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
      break;
    }
  }
  const EventClass = root.ownerDocument.defaultView?.Event;
  if (!EventClass) return false;
  root.dispatchEvent(new EventClass(INLINE_CARET_REVEAL));
  return true;
}
