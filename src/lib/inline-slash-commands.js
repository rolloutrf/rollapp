import { containsSelectedBlock, isBlockSelection } from "./inline-block-selection.js";
import { requestInlineImage } from "./inline-image-intent.js";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { createChainableState, isActive } from "@tiptap/core";
import { closeHistory, isHistoryTransaction } from "@tiptap/pm/history";
import { blockTypes, filterBlockTypes, applyBlockType } from "./inline-block-types.js";
import { changeTextBlock, selectedBlockPosition } from "./inline-blocks.js";
import { blockColorCommands } from "./inline-block-color-values.js";
import { colorBlocks } from "./inline-block-color.js";
import { rememberColor } from "./inline-color-memory.js";
import { requestInlineCaretReveal } from "./inline-caret-intent.js";

const actions = [
  { id: "duplicate", kind: "action", label: "Дублировать блок", aliases: "duplicate copy копия дубликат", description: "Создать копию текущего блока вместе с его содержимым.", shortcut: "" },
  { id: "delete", kind: "action", label: "Удалить блок", aliases: "delete remove удалить", description: "Удалить текущий блок. Отмена вернёт его содержимое.", shortcut: "" },
];
export const slashCommands = [...blockTypes, ...blockColorCommands, ...actions];
export const filterSlashCommands = query => {
  const words=query.trim().toLocaleLowerCase().split(/\s+/),matches=item=>words.every(word=>`${item.label} ${item.aliases}`.toLocaleLowerCase().includes(word));
  const blocks=filterBlockTypes(query),colors=blockColorCommands.filter(matches),commands=actions.filter(matches);
  // "red" also occurs inside "numbered". A literal colour name must win.
  const colorQuery=Boolean(words[0])&&(colors.some(item=>item.aliases.split(" ")[0]===words[0]||item.label.toLocaleLowerCase().split(" ")[0]===words[0])||["color","default","фон","цвет"].includes(words[0]));
  return colorQuery?[...colors,...blocks,...commands]:[...blocks,...colors,...commands];
};

function rangeAt(state, from, to) {
  const selection = state.selection;
  if (selection.$from.parent.type.name === "imageCaption") return null;
  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$from.parent.isTextblock || selection.$from.parent.type.spec.code) return null;
  const start = selection.$from.start(), end = selection.$from.end();
  if (from < start || to > end || selection.from <= from || selection.from > to) return null;
  const text = state.doc.textBetween(from, to, "\n", "\ufffc");
  if (!/^\/[^/\r\n\ufffc]*$/.test(text)) return null;
  for (const name of ["code", "link"]) if (state.schema.marks[name] && state.doc.rangeHasMark(from, to, state.schema.marks[name])) return null;
  return { from, to, query: text.slice(1), doc: state.doc };
}

// A menu has a lifetime tied to an inserted slash, not just a matching regex.
// Selection, Undo, pasted/loaded text and a dismissed query cannot resurrect it.
export function nextSlashSuggestion(state, transaction, previous, { editable = true, composing = false } = {}) {
  if (!editable || composing || transaction.getMeta("preventUpdate") !== undefined || transaction.getMeta("paste") || ["paste", "drop"].includes(transaction.getMeta("uiEvent")) || isHistoryTransaction(transaction)) return null;
  let next;
  if (previous) {
    const from = transaction.mapping.mapResult(previous.from, 1);
    if (!from.deleted) next = rangeAt(state, from.pos, transaction.mapping.map(previous.to, 1));
  }
  if (!next && transaction.docChanged && state.selection instanceof TextSelection && state.selection.empty && state.selection.$from.parent.isTextblock) {
    const { $from } = state.selection;
    const prefix = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
    const match = /(?:^|\s)\/([^/\r\n]*)$/.exec(prefix);
    if (match) {
      const from = $from.start() + match.index + (match[0][0] === "/" ? 0 : 1);
      const old = transaction.mapping.invert().mapResult(from, 1);
      const inserted = old.deleted || transaction.before.textBetween(old.pos, Math.min(old.pos + 1, transaction.before.content.size)) !== "/";
      if (inserted) next = rangeAt(state, from, state.selection.from);
    }
  }
  if (!next) return null;
  if (previous && next.from === previous.from && next.to === previous.to && next.query === previous.query && next.doc === previous.doc) return previous;
  return { ...next, items: filterSlashCommands(next.query), index: previous?.query === next.query ? previous.index : 0 };
}

export function applySlashCommand(editor, suggestion, item) {
  if (!editor.isEditable || !suggestion || !item || !slashCommands.some(command => command.id === item.id) || editor.state.doc !== suggestion.doc || !rangeAt(editor.state, suggestion.from, suggestion.to)) return false;
  return executeBlockCommand(editor, item, { suggestion });
}

// The action menu shares slash semantics without inserting/deleting any query
// in the document. A snapshot prevents stale menus from changing another block.
export function applyBlockCommand(editor, item, { doc, position } = {}) {
  if (!editor.isEditable || editor.isDestroyed || editor.state.doc !== doc || !slashCommands.some(command => command.id === item?.id)) return false;
  return executeBlockCommand(editor, item, { position });
}

function executeBlockCommand(editor, item, { suggestion, position }) {
  if (item.id === "image") return requestInlineImage(editor, { suggestion, position });
  // Removing the query and applying even a non-adjacent structural operation
  // share one transaction. Otherwise history splits e.g. /duplicate in two.
  const result = editor.chain().command(({ tr, state, chain, commands }) => {
    closeHistory(tr);
    if (suggestion) tr.delete(suggestion.from, suggestion.to);
    else if (Number.isInteger(position) && selectedBlockPosition(tr.selection) !== position && !(isBlockSelection(tr.selection) ? containsSelectedBlock(tr.selection, position) : tr.selection.from <= position && tr.selection.to > position)) {
      const node = tr.doc.nodeAt(position);
      if (!node?.isBlock || node.type.spec.selectable === false) return false;
      tr.setSelection(NodeSelection.create(tr.doc, position));
    }
    const staged = createChainableState({ state, transaction: tr });
    const scoped = {
      schema: editor.schema, state: staged, view: { focus() {}, dispatch() {} },
      commands: { ...commands, focus: () => true },
      isActive: (...args) => isActive(staged, ...args),
      chain: () => { const next = chain(); next.focus = () => next; return next; },
    };
    // Scoped commands only stage changes. Their owner restores native focus
    // before committing a successful plan; chained focus would map a selection
    // from the original document against the staged one.
    let applied;
    if (item.kind === "color") applied = colorBlocks(tr,item.color, suggestion ? undefined : { position });
    else if (item.kind === "action") {
      let target = position ?? selectedBlockPosition(staged.selection);
      // A cell's command addresses its text block, not the surrounding table.
      if (suggestion && staged.doc.nodeAt(target)?.type.name === "table") target = staged.selection.$from.before();
      applied = changeTextBlock(scoped, target, item.id, { separateHistory: false });
    } else applied = applyBlockType(scoped, item.id, { separateHistory: false });
    if (!applied) tr.setMeta("preventDispatch", true);
    else editor.view.focus();
    return applied;
  }).run();
  if (result) { editor.view.dispatch(closeHistory(editor.state.tr));if(item.kind==="color")rememberColor({scope:"block",color:item.color}); editor.commands.focus(); requestInlineCaretReveal(editor.view, { cell: true }); }
  return result;
}
