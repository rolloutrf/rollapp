import { InputRule, markInputRule, wrappingInputRule } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import Strike from "@tiptap/extension-strike";
import TaskItem from "@tiptap/extension-task-item";
import Blockquote from "@tiptap/extension-blockquote";
import { OrderedList } from "@tiptap/extension-list";
import { closeHistory } from "@tiptap/pm/history";
import { Selection, TextSelection } from "@tiptap/pm/state";

// Input rules remove only their typed prefix. Existing text becomes the title;
// nested content stays inside the toggle, and list neighbours retain numbering.
export function convertParagraphToToggle(tr, range) {
  const $from = tr.doc.resolve(range.from);
  if ($from.parent.type.name !== "paragraph") return false;
  const schema = tr.doc.type.schema;
  const paragraphPosition = $from.before();
  const itemDepth = $from.depth - 1;
  const listDepth = itemDepth - 1;
  const inList = listDepth >= 1 && ["listItem", "taskItem"].includes($from.node(itemDepth).type.name) && $from.index(itemDepth) === 0;
  if (!inList && !$from.node(itemDepth).canReplaceWith($from.index(itemDepth), $from.index(itemDepth) + 1, schema.nodes.details)) return false;
  tr.delete(range.from, range.to);
  const paragraph = tr.doc.nodeAt(paragraphPosition);
  let position = paragraphPosition;
  let body = [schema.nodes.paragraph.create()];
  if (inList) {
    const listPosition = $from.before(listDepth);
    const list = tr.doc.nodeAt(listPosition);
    const index = $from.index(listDepth);
    const item = list.child(index);
    if (item.childCount > 1) body = Array.from({ length: item.childCount - 1 }, (_, at) => item.child(at + 1));
    const toggle = schema.nodes.details.create({ open: true }, [schema.nodes.detailsSummary.create(null, paragraph.content), schema.nodes.detailsContent.create(null, body)]);
    let beforeSize = 0;
    for (let at = 0; at < index; at += 1) beforeSize += list.child(at).nodeSize;
    const before = list.content.cut(0, beforeSize), after = list.content.cut(beforeSize + item.nodeSize);
    const replacements = [];
    if (before.size) replacements.push(list.type.create(list.attrs, before));
    position = listPosition + (replacements[0]?.nodeSize || 0);
    replacements.push(toggle);
    if (after.size) replacements.push(list.type.create(list.type.name === "orderedList" ? { ...list.attrs, start: list.attrs.start + index + 1 } : list.attrs, after));
    tr.replaceWith(listPosition, listPosition + list.nodeSize, replacements);
  } else {
    tr.replaceWith(position, position + paragraph.nodeSize, schema.nodes.details.create({ open: true }, [schema.nodes.detailsSummary.create(null, paragraph.content), schema.nodes.detailsContent.create(null, body)]));
  }
  tr.setSelection(TextSelection.create(tr.doc, position + 2 + Math.min($from.parentOffset, paragraph.content.size)));
  return true;
}

export const SymbolBlockquote = Blockquote.extend({
  addInputRules() {
    return [wrappingInputRule({ find: /^(?:"|“)[\s\u00a0]$/, type: this.type })];
  },
});

export const SymbolOrderedList = OrderedList.extend({
  renderHTML(props) {
    const output = this.parent(props);
    if (props.node.attrs.type) output[1] = { ...output[1], "data-list-marker": props.node.attrs.type };
    return output;
  },
  addInputRules() {
    return [...(this.parent?.() || []), wrappingInputRule({
      find: /^([ai])\.[\s\u00a0]$/, type: this.type,
      getAttributes: match => ({ start: 1, type: match[1] }),
      joinPredicate: () => false,
    })];
  },
});

export function convertListItemToTask(tr, range, checked) {
  const $from = tr.doc.resolve(range.from);
  const itemDepth = $from.depth - 1;
  const listDepth = itemDepth - 1;
  if (listDepth < 1 || $from.node(itemDepth).type.name !== "listItem" || $from.index(itemDepth) !== 0) return false;
  if (!["bulletList", "orderedList"].includes($from.node(listDepth).type.name)) return false;
  const listPosition = $from.before(listDepth);
  const itemIndex = $from.index(listDepth);
  tr.delete(range.from, range.to);
  const list = tr.doc.nodeAt(listPosition);
  const item = list.child(itemIndex);
  let beforeSize = 0;
  for (let index = 0; index < itemIndex; index += 1) beforeSize += list.child(index).nodeSize;
  const before = list.content.cut(0, beforeSize);
  const after = list.content.cut(beforeSize + item.nodeSize);
  const schema = tr.doc.type.schema;
  const replacements = [];
  if (before.size) replacements.push(list.type.create(list.attrs, before));
  const taskPosition = listPosition + (replacements[0]?.nodeSize || 0);
  replacements.push(schema.nodes.taskList.create(null, schema.nodes.taskItem.create({ checked }, item.content)));
  if (after.size) replacements.push(list.type.create(list.type.name === "orderedList" ? { ...list.attrs, start: list.attrs.start + itemIndex + 1 } : list.attrs, after));
  tr.replaceWith(listPosition, listPosition + list.nodeSize, replacements);
  tr.setSelection(Selection.near(tr.doc.resolve(taskPosition + 3)));
  return true;
}

// Keep standard Markdown rules and add Notion's single-tilde spelling.
export const SymbolStrike = Strike.extend({
  addInputRules() {
    return [...(this.parent?.() || []), markInputRule({
      find: /(?:^|\s)(~(?!~)([^\s~](?:[^~\n]*[^\s~])?)~)$/,
      type: this.type,
    })];
  },
});

export const SymbolTaskItem = TaskItem.extend({
  addInputRules() {
    const find = /^\s*\[([ xX\u00a0]?)\]\s$/;
    const fallback = wrappingInputRule({
      find,
      type: this.type,
      getAttributes: match => ({ checked: match[1].toLowerCase() === "x" }),
    });
    return [new InputRule({ find, handler: props => {
      if (convertListItemToTask(props.state.tr, props.range, props.match[1].toLowerCase() === "x")) return;
      return fallback.handler(props);
    } })];
  },
});

export const SymbolCodeBlock = CodeBlock.extend({
  addKeyboardShortcuts() {
    const shortcuts = this.parent?.() || {};
    return { ...shortcuts, Enter: props => {
      const { editor } = props;
      if (editor.view.composing) return false;
      const { $from, empty } = editor.state.selection;
      const fence = empty && $from.parent.type.name === "paragraph" && $from.parentOffset === $from.parent.content.size
        && /^(?:```|~~~)([\w#+.-]*)$/.exec($from.parent.textContent);
      if (!fence) return shortcuts.Enter?.(props) || false;
      // Enter is a structural command, separate from typing the fence in Undo.
      const result = editor.chain().command(({ tr }) => { closeHistory(tr); return true; })
        .deleteRange({ from: $from.start(), to: $from.end() })
        .setCodeBlock({ language: fence[1] || null }).run();
      editor.view.dispatch(closeHistory(editor.state.tr));
      return result;
    } };
  },
});
