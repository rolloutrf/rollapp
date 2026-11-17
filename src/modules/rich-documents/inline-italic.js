import { Mark } from "@tiptap/core";
import Italic from "@tiptap/extension-italic";
import { closeHistory } from "@tiptap/pm/history";

function quoteAt(doc, position) {
  const point = doc.resolve(position);
  for (let depth = point.depth; depth > 0; depth--) if (point.node(depth).type.name === "blockquote") return true;
  return false;
}
const effective = (marks, inherited) => marks.some(mark => mark.type.name === "normalText") ? false : inherited || marks.some(mark => mark.type.name === "italic");

// Canonical HTML can nest an authored exception inside emphasis, or vice
// versa. Its innermost style wins; never construct mutually excluding marks.
export function appendInlineEmphasisMark(marks, mark) {
  const previous = ["italic", "normalText"].includes(mark.type)
    ? marks.filter(current => !["italic", "normalText"].includes(current.type)) : marks;
  return [...previous, mark];
}

function parts(state, inheritQuoteItalic) {
  const result = [], italic = state.schema.marks.italic;
  for (const { $from, $to } of state.selection.ranges) state.doc.nodesBetween($from.pos, $to.pos, (node, pos, parent) => {
    if (!(node.isText || node.type.name === "hardBreak") || !parent?.type.allowsMarkType(italic)) return;
    result.push({ from: Math.max(pos, $from.pos), to: Math.min(pos + node.nodeSize, $to.pos), marks: node.marks, inherited: inheritQuoteItalic && quoteAt(state.doc, pos) });
  });
  return result;
}

export function hasEffectiveItalic(state, inheritQuoteItalic = true) {
  if (state.selection.empty) return state.selection.$from.parent.type.allowsMarkType(state.schema.marks.italic)
    && effective(state.storedMarks || state.selection.$from.marks(), inheritQuoteItalic && quoteAt(state.doc, state.selection.from));
  const selected = parts(state, inheritQuoteItalic);
  return selected.length > 0 && selected.every(part => effective(part.marks, part.inherited));
}

function inheritsQuoteItalic(editor) {
  return !editor.view.dom?.closest(".theses-source");
}

export function hasEditorItalic(editor) {
  return hasEffectiveItalic(editor.state, inheritsQuoteItalic(editor));
}

export function italicStyleTransaction(state, inheritQuoteItalic = true) {
  const { italic, normalText } = state.schema.marks, turnOn = !hasEffectiveItalic(state, inheritQuoteItalic);
  if (!italic || !normalText) return null;
  const tr = closeHistory(state.tr);
  if (state.selection.empty) {
    if (!state.selection.$from.parent.type.allowsMarkType(italic)) return null;
    const inherited = inheritQuoteItalic && quoteAt(state.doc, state.selection.from);
    tr.removeStoredMark(italic).removeStoredMark(normalText);
    if (turnOn && !inherited) tr.addStoredMark(italic.create());
    if (!turnOn && inherited) tr.addStoredMark(normalText.create());
  } else {
    const selected = parts(state, inheritQuoteItalic);
    if (!selected.length) return null;
    for (const part of selected) {
      tr.removeMark(part.from, part.to, italic).removeMark(part.from, part.to, normalText);
      if (turnOn && !part.inherited) tr.addMark(part.from, part.to, italic.create());
      if (!turnOn && part.inherited) tr.addMark(part.from, part.to, normalText.create());
    }
  }
  return tr;
}

export function toggleEffectiveItalic(editor) {
  if (editor.isDestroyed || !editor.isEditable || editor.view.composing) return false;
  const { doc, selection } = editor.state, tr = italicStyleTransaction(editor.state, inheritsQuoteItalic(editor));
  if (!tr) return false;
  editor.view.focus();
  if (editor.isDestroyed || !editor.isEditable || editor.view.composing || editor.state.doc !== doc || !editor.state.selection.eq(selection)) return false;
  editor.view.dispatch(tr);
  editor.view.dispatch(closeHistory(editor.state.tr));
  return true;
}

// The mark preserves an authored exception to inherited italic in Markdown.
export const InlineNormalText = Mark.create({
  name: "normalText", priority: 90, excludes: "italic",
  parseHTML: () => [{ tag: 'span[data-inline-normal="true"]' }],
  renderHTML: () => ["span", { "data-inline-normal": "true" }, 0],
  renderMarkdown: (node, helpers) => `<span data-inline-rich><span data-inline-normal="true">${helpers.renderChildren(node)}</span></span>`,
});

export const InlineItalic = Italic.extend({
  excludes: "normalText",
  addKeyboardShortcuts() { return { ...this.parent?.(), "Mod-i": () => toggleEffectiveItalic(this.editor) }; },
});
