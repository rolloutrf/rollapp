import { getMarkRange } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";

export const safeInlineLink = value => /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(value);

// The form owns the selected text, rather than whichever range is active when
// its portalled submit button is eventually pressed.
export function captureInlineLinkIntent(state) {
  const selection = state.selection;
  if (!(selection instanceof TextSelection) && !state.doc.textBetween(selection.from, selection.to).length) return null;
  if (selection.empty && !selection.$from.parent.type.allowsMarkType(state.schema.marks.link)) return null;
  let target = selection;
  if (selection instanceof TextSelection) {
    const range = getMarkRange(selection.$from, state.schema.marks.link);
    if (range && range.from <= selection.from && range.to >= selection.to) target = TextSelection.create(state.doc, range.from, range.to);
  }
  return { doc: state.doc, selection, target };
}

export function mapInlineLinkIntent(intent, transaction) {
  if (!intent || transaction.before !== intent.doc) return null;
  const selection = intent.selection.map(transaction.doc, transaction.mapping);
  if (transaction.selectionSet && !transaction.selection.eq(selection)) return null;
  if (!transaction.docChanged) return { ...intent, selection };
  const original = intent.target;
  let target;
  if (original instanceof TextSelection) {
    if (original.empty) {
      let position = original.from, touched = false;
      for (const map of transaction.mapping.maps) {
        map.forEach((from, to) => { if (from <= position && position <= to) touched = true; });
        position = map.map(position, 1);
      }
      if (touched) return null;
      target = TextSelection.create(transaction.doc, position);
      if (!original.$from.parent.sameMarkup(target.$from.parent)) return null;
    } else {
      const from = transaction.mapping.mapResult(original.from, 1), to = transaction.mapping.mapResult(original.to, -1);
      if (from.deletedAcross || to.deletedAcross || from.pos >= to.pos) return null;
      target = TextSelection.create(transaction.doc, original.anchor <= original.head ? from.pos : to.pos, original.anchor <= original.head ? to.pos : from.pos);
    }
  } else target = original.map(transaction.doc, transaction.mapping);
  if (target.constructor !== original.constructor || target.ranges.length !== original.ranges.length) return null;
  for (let i = 0; i < original.ranges.length; i++) {
    const before = original.ranges[i], after = target.ranges[i];
    if (!intent.doc.slice(before.$from.pos, before.$to.pos).eq(transaction.doc.slice(after.$from.pos, after.$to.pos))) return null;
  }
  return { doc: transaction.doc, selection, target };
}

export function inlineLinkTransaction(state, intent, href) {
  if (!intent || state.doc !== intent.doc || !state.selection.eq(intent.selection) || href && !safeInlineLink(href)) return null;
  const type = state.schema.marks.link, target = intent.target;
  const tr = closeHistory(state.tr).setSelection(target).setMeta("preventAutolink", true);
  if (target.empty) {
    if (!href || !(target instanceof TextSelection) || !target.$from.parent.type.allowsMarkType(type)) return null;
    const marks = (state.storedMarks || target.$from.marks()).filter(mark => mark.type !== type);
    tr.replaceSelectionWith(state.schema.text(href, type.create({ href }).addToSet(marks)), false);
    // The inserted URL is a complete link; following typing keeps the user's
    // other styles without inheriting an invisible pending link mark.
    tr.setStoredMarks(marks);
  } else {
    for (const { $from, $to } of target.ranges) {
      if (!href) tr.removeMark($from.pos, $to.pos, type);
      else state.doc.nodesBetween($from.pos, $to.pos, (node, pos, parent) => {
        if (!node.isInline || parent && !parent.type.allowsMarkType(type)) return;
        const previous = type.isInSet(node.marks);
        tr.addMark(Math.max(pos, $from.pos), Math.min(pos + node.nodeSize, $to.pos), type.create({ ...previous?.attrs, href }));
      });
    }
    tr.removeStoredMark(type);
  }
  return tr;
}

export function commitInlineLink(editor, intent, href) {
  if (editor.isDestroyed || !editor.isEditable || editor.view.composing) return false;
  const transaction = inlineLinkTransaction(editor.state, intent, href);
  if (!transaction) return false;
  editor.view.focus();
  if (editor.isDestroyed || !editor.isEditable || editor.view.composing || editor.state.doc !== intent.doc || !editor.state.selection.eq(intent.selection)) return false;
  editor.view.dispatch(transaction);
  editor.view.dispatch(closeHistory(editor.state.tr));
  return true;
}
