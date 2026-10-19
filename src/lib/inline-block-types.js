import { insertTextBlock, selectedBlockPosition } from "./inline-blocks.js";
import { requestInlineImage } from "./inline-image-intent.js";
export { createBlockNode } from "./inline-block-nodes.js";
import { convertParagraphToToggle } from "./inline-symbol-shortcuts.js";
import { captureBlockColors, inheritedBlockColor, restoreBlockColors } from "./inline-block-color.js";
import { TextSelection } from "@tiptap/pm/state";
import { BlockSelection, isBlockSelection } from "./inline-block-selection.js";
import { CellSelection } from "@tiptap/pm/tables";
import { Fragment } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";

export function convertSelectedBlocksToToggles(tr) {
  const targets = new Set(), toggles = new Set();
  const sparse = tr.selection.disjoint;
  const backwards = tr.selection.anchor > tr.selection.head;
  const $from = tr.selection.$from;
  const cursor = $from.parent.isTextblock ? { position: $from.before(), offset: $from.parentOffset } : null;
  const cells = tr.selection instanceof CellSelection;
  const bookmark = tr.selection.getBookmark(), mapFrom = tr.mapping.maps.length;
  for (const { $from, $to } of tr.selection.ranges) tr.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
    if (node.type.name === "details") {
      const whole = $from.pos <= pos && $to.pos >= pos + node.nodeSize;
      const summary = $from.pos < pos + 1 + node.firstChild.nodeSize && $to.pos > pos + 1;
      if (whole || summary) { toggles.add(node); return false; }
    }
    if (node.isTextblock && node.type.name !== "detailsSummary") targets.add(pos);
  });
  // Work backwards so preceding positions stay stable. The existing single
  // paragraph conversion retains list children inside their new toggle.
  for (const pos of [...targets].sort((a, b) => b - a)) {
    const node = tr.doc.nodeAt(pos), color = inheritedBlockColor(tr.doc.resolve(pos + 1));
    if (node.type.name !== "paragraph") {
      const $pos = tr.doc.resolve(pos);
      if (!$pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, tr.doc.type.schema.nodes.paragraph)) return false;
      tr.setNodeMarkup(pos, tr.doc.type.schema.nodes.paragraph, { blockColor: node.attrs.blockColor });
    }
    const offset = cursor?.position === pos ? Math.min(cursor.offset, tr.doc.nodeAt(pos).content.size) : 0;
    const caret = pos + 1 + offset;
    tr.setSelection(TextSelection.create(tr.doc, caret));
    if (!convertParagraphToToggle(tr, { from: caret, to: caret })) return false;
    const position = selectedBlockPosition(tr.selection), toggle = tr.doc.nodeAt(position);
    if (color) tr.setNodeMarkup(position, undefined, { ...toggle.attrs, blockColor: color });
    toggles.add(tr.doc.nodeAt(position));
  }
  const positions = [];
  tr.doc.descendants((node, pos) => { if (toggles.has(node)) { positions.push(pos); return false; } });
  if (cells) tr.setSelection(bookmark.map(tr.mapping.slice(mapFrom)).resolve(tr.doc));
  else if (sparse && positions.length) tr.setSelection(BlockSelection.fromPositions(tr.doc, positions, backwards ? positions.at(-1) : positions[0], backwards ? positions[0] : positions.at(-1)));
  else if (positions.length > 1 && tr.doc.resolve(positions[0]).sameParent(tr.doc.resolve(positions.at(-1)))) {
    tr.setSelection(BlockSelection.create(tr.doc, backwards ? positions.at(-1) : positions[0], backwards ? positions[0] : positions.at(-1)));
  }
  return targets.size > 0 || toggles.size > 0;
}

// One catalogue for slash commands, the block toolbar and insertion controls.
export const blockTypes = [
  { id: "paragraph", label: "Текст", aliases: "text paragraph абзац", description: "Просто начните писать обычный текст.", shortcut: "" },
  ...[1, 2, 3, 4].map(level => ({ id: `heading${level}`, label: `Заголовок ${level}`, aliases: `heading h${level}`, description: `Заголовок ${level}-го уровня для структуры документа.`, shortcut: "#".repeat(level) })),
  { id: "bulletList", label: "Список", aliases: "bulleted list маркированный", description: "Соберите связанные мысли в маркированный список.", shortcut: "-" },
  { id: "orderedList", label: "Нумерованный список", aliases: "numbered list", description: "Запишите шаги по порядку.", shortcut: "1." },
  { id: "taskList", label: "Чек-лист", aliases: "todo to-do task задачи", description: "Отмечайте выполненные пункты.", shortcut: "[]" },
  { id: "details", label: "Раскрывающийся список", aliases: "toggle сворачиваемый", description: "Скройте подробности под раскрывающимся заголовком.", shortcut: ">" },
  { id: "blockquote", label: "Цитата", aliases: "quote", description: "Выделите цитату или важную мысль.", shortcut: '"' },
  { id: "codeBlock", label: "Код", aliases: "code codeblock блок кода", description: "Пишите код без автоматического форматирования символов.", shortcut: "```" },
  { id: "horizontalRule", label: "Разделитель", aliases: "divider horizontal rule линия", description: "Разделите части документа горизонтальной линией.", shortcut: "---" },
  { id: "columns", label: "Две колонки", aliases: "columns 2 columns two колонки столбцы", description: "Разместите текстовые блоки рядом.", shortcut: "" },
  { id: "table", label: "Таблица", aliases: "table таблицы", description: "Организуйте текст в строках и столбцах.", shortcut: "" },
  { id: "image", kind: "media", label: "Изображение", aliases: "image photo picture картинка фото фотография", description: "Загрузите изображение или добавьте его по ссылке.", shortcut: "" },
];

export const filterBlockTypes = query => {
  const words = query.trim().toLocaleLowerCase().split(/\s+/);
  return blockTypes.filter(item => words.every(word => `${item.label} ${item.aliases}`.toLocaleLowerCase().includes(word)));
};

export function applyBlockType(editor, id, { separateHistory = true } = {}) {
  if(editor.isEditable===false || editor.isDestroyed)return false;
  if (id === "image") return requestInlineImage(editor);
  if (isBlockSelection(editor.state.selection) && (editor.state.selection.disjoint && id !== "details" || editor.state.selection.positions.some(pos => editor.state.doc.nodeAt(pos).type.name === "nestedBlock")) && !["horizontalRule", "table", "columns"].includes(id)) return applySeparateBlockTypes(editor, id, separateHistory);
  let colors;
  const remember=({tr})=>{colors=captureBlockColors(tr);return true;};
  const finish=chain=>chain.command(({tr})=>restoreBlockColors(tr,colors)).run();
  if (["bulletList", "orderedList", "taskList"].includes(id) && editor.isActive(id)) return editor.commands.focus();
  if (id === "details") {
    if (editor.state.selection.empty && editor.state.selection.$from.parent.type.name === "detailsSummary") return editor.commands.focus();
    return editor.chain().focus().command(({tr})=>{const applied=convertSelectedBlocksToToggles(tr);if(!applied)tr.setMeta("preventDispatch",true);return applied;}).run();
  }
  // Insert structural blocks after the selected prose; never replace its text.
  if (id === "horizontalRule" || id === "table" || id === "columns") {
    const position = selectedBlockPosition({ $from: editor.state.selection.$to });
    const node = editor.state.doc.nodeAt(position);
    return insertTextBlock(editor, position, node?.type.name === "paragraph" && !node.content.size ? "replace" : "after", id, { separateHistory });
  }
  let chain = editor.chain().focus().command(remember);
  if (editor.state.selection.$from.parent.type.name === "detailsSummary") chain = chain.unsetDetails();
  chain = chain.clearNodes();
  if (id.startsWith("heading")) return finish(chain.setHeading({ level: Number(id.slice(-1)) }));
  if (id === "bulletList") return finish(chain.toggleBulletList());
  if (id === "orderedList") return finish(chain.toggleOrderedList());
  if (id === "taskList") return finish(chain.toggleTaskList());
  if (id === "codeBlock") return finish(chain.setCodeBlock());
  if (id === "blockquote") return finish(chain.setBlockquote());
  return finish(chain.setParagraph());
}

// Keep unselected list items in mapped gaps. Replacing an entire source list
// would mark even its untouched items as deleted and lose later sparse targets.
function isolateListItem(tr, position) {
  let $pos = tr.doc.resolve(position), parent = $pos.parent;
  const index = $pos.index();
  if (index > 0) {
    const attrs = { ...parent.attrs, ...(parent.type.name === "orderedList" ? { start: parent.attrs.start + index } : {}) };
    tr.split(position, 1, [{ type: parent.type, attrs }]);
    position += 2; $pos = tr.doc.resolve(position); parent = $pos.parent;
  }
  const end = position + $pos.nodeAfter.nodeSize;
  if (parent.childCount > 1) {
    const attrs = { ...parent.attrs, ...(parent.type.name === "orderedList" ? { start: parent.attrs.start + 1 } : {}) };
    tr.split(end, 1, [{ type: parent.type, attrs }]);
  }
  return tr.doc.resolve(position).before();
}

function convertedUnit(schema, node, id, inherited) {
  const color = node.attrs.blockColor || inherited;
  if (node.type.name === "nestedBlock") {
    const own = node.firstChild, children = node.content.content.slice(1);
    if (own.isTextblock && ["bulletList", "orderedList", "taskList", "details", "blockquote"].includes(id)) {
      const attrs = { blockColor: own.attrs.blockColor }, paragraph = schema.nodes.paragraph.create(attrs, own.content);
      if (id === "details") return [schema.nodes.details.create(node.attrs, [schema.nodes.detailsSummary.create(attrs, own.content), schema.nodes.detailsContent.create(null, children.length ? children : schema.nodes.paragraph.create())])];
      if (id === "blockquote") return [schema.nodes.blockquote.create(node.attrs, [paragraph, ...children])];
      const item = schema.nodes[id === "taskList" ? "taskItem" : "listItem"].create(node.attrs, [paragraph, ...children]);
      return [schema.nodes[id].create(null, item)];
    }
    const converted = convertedUnit(schema, own, id, color);
    if (!converted) return null;
    return [schema.nodes.nestedBlock.create(node.attrs, [...converted, ...children])];
  }
  if (["bulletList", "orderedList", "taskList"].includes(node.type.name)) {
    const blocks = node.content.content.map(item => convertedUnit(schema, item, id, color));
    return blocks.every(Boolean) ? blocks.flat() : null;
  }
  let first = node, children = [];
  if (["listItem", "taskItem", "blockquote"].includes(node.type.name)) { first = node.firstChild; children = node.content.content.slice(1); }
  if (node.type.name === "details") { first = node.firstChild; children = node.child(1).content.content; }
  if (!first?.isTextblock) return null;
  const ink = first.attrs.blockColor || color, attrs = { blockColor: ink };
  if (id === "details") return [schema.nodes.details.create({ blockColor: color }, [schema.nodes.detailsSummary.create(attrs, first.content), schema.nodes.detailsContent.create(null, children.length ? children : schema.nodes.paragraph.create())])];
  const paragraph = schema.nodes.paragraph.create(attrs, first.content);
  const containerAttrs = children.length ? { blockColor: color } : attrs;
  if (["bulletList", "orderedList", "taskList"].includes(id)) {
    const item = schema.nodes[id === "taskList" ? "taskItem" : "listItem"].create({ ...containerAttrs, ...(id === "taskList" ? { checked: node.attrs.checked || false } : {}) }, [children.length ? paragraph : schema.nodes.paragraph.create(null, first.content), ...children]);
    return [schema.nodes[id].create(null, item)];
  }
  if (id === "blockquote") return [schema.nodes.blockquote.create(containerAttrs, [schema.nodes.paragraph.create(ink === containerAttrs.blockColor ? null : attrs, first.content), ...children])];
  const type = id.startsWith("heading") ? schema.nodes.heading : schema.nodes[id];
  if (!type?.isTextblock) return null;
  const content = id === "codeBlock" ? (first.content.size ? schema.text(first.textBetween(0, first.content.size, "\n", "\n")) : null) : first.content;
  const detached = children.map(child => color && "blockColor" in child.attrs && !child.attrs.blockColor ? child.type.create({ ...child.attrs, blockColor: color }, child.content, child.marks) : child);
  return [type.create({ ...attrs, ...(id.startsWith("heading") ? { level: Number(id.slice(-1)) } : {}), ...(id === "codeBlock" ? { language: first.attrs.language || null } : {}) }, content), ...detached];
}

export function convertSeparateBlockTypes(tr, id) {
  const original = tr.selection, mapStart = tr.mapping.maps.length, converted = [];
  for (const source of [...original.positions].reverse()) {
    let position = tr.mapping.slice(mapStart).map(source, 1);
    const node = tr.doc.nodeAt(position), $inside = tr.doc.resolve(position + 1);
    const nodes = convertedUnit(tr.doc.type.schema, node, id, inheritedBlockColor($inside));
    if (!nodes) return false;
    if (["listItem", "taskItem"].includes(node.type.name)) position = isolateListItem(tr, position);
    const $pos = tr.doc.resolve(position), fragment = Fragment.fromArray(nodes);
    if (!$pos.parent.canReplace($pos.index(), $pos.index() + 1, fragment)) return false;
    tr.replaceWith(position, position + $pos.nodeAfter.nodeSize, fragment);
    let offset = 0; const positions = [];
    for (const node of nodes) { positions.push(position + offset); offset += node.nodeSize; }
    converted.push({ source, positions, mapFrom: tr.mapping.maps.length });
  }
  const mapped = converted.map(item => ({ source: item.source, positions: item.positions.map(pos => tr.mapping.slice(item.mapFrom).map(pos, 1)) }));
  const anchor = mapped.find(item => item.source === original.anchorBlock)?.positions[0], head = mapped.find(item => item.source === original.headBlock)?.positions.at(-1);
  tr.setSelection(BlockSelection.fromPositions(tr.doc, mapped.flatMap(item => item.positions), anchor, head));
  return true;
}

function applySeparateBlockTypes(editor, id, separateHistory) {
  const result = editor.chain().command(({ tr }) => {
    if (separateHistory) closeHistory(tr);
    const applied = convertSeparateBlockTypes(tr, id);
    if (!applied) tr.setMeta("preventDispatch", true);
    return applied;
  }).run();
  if (result) { if (separateHistory) editor.view.dispatch(closeHistory(editor.state.tr)); editor.commands.focus(); }
  return result;
}
