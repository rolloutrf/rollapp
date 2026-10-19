import { closeHistory } from "@tiptap/pm/history";
import { isBlockSelection } from "./inline-block-selection.js";
import { selectedBlockPosition } from "./inline-blocks.js";

// Mod+Enter acts on the current to-do or toggle, without replacing its text.
export function currentBlockAction(editor) {
  if (!editor.isEditable || editor.view.composing) return false;
  const { selection, doc } = editor.state;
  if (isBlockSelection(selection) ? selection.positions.length !== 1 : !selection.$from.sameParent(selection.$to)) return false;
  const position = selectedBlockPosition(selection), node = doc.nodeAt(position);
  const attribute = node?.type.name === "taskItem" ? "checked" : node?.type.name === "details" ? "open" : null;
  if (!attribute) return false;
  const tr = closeHistory(editor.state.tr).setNodeMarkup(position, undefined, { ...node.attrs, [attribute]: !node.attrs[attribute] });
  // Attribute-only changes keep positions stable; replacement mapping would
  // collapse a NodeSelection on the changed opening token.
  tr.setSelection(selection.getBookmark().resolve(tr.doc));
  if (editor.state.storedMarks) tr.setStoredMarks(editor.state.storedMarks);
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.dispatch(closeHistory(editor.state.tr));
  return true;
}
