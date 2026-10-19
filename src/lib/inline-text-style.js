import { Mark } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { inlineColors, safeInlineColor } from "./inline-color-values.js";
import { rememberColor } from "./inline-color-memory.js";
export { inlineColors, safeInlineColor } from "./inline-color-values.js";

const colorIds = new Set(inlineColors.map(([id]) => id));

export function setInlineStyle(editor, attributes, remember = true) {
  if (!editor.isEditable) return false;
  const clean = Object.fromEntries(Object.entries(attributes).filter(([key]) => ["color", "background"].includes(key)).map(([key, value]) => [key, safeInlineColor(value)]));
  if (!Object.keys(clean).length) return false;
  const result = editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).setMark("inlineStyle", clean).command(({ tr }) => {
    const type = editor.schema.marks.inlineStyle;
    for (const { $from, $to } of tr.selection.ranges) {
      tr.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
        const mark = node.marks.find(mark => mark.type === type);
        if (mark && !mark.attrs.color && !mark.attrs.background) tr.removeMark(Math.max(pos, $from.pos), Math.min(pos + node.nodeSize, $to.pos), type);
      });
    }
    if (tr.selection.empty && tr.storedMarks?.some(mark => mark.type === type && !mark.attrs.color && !mark.attrs.background)) tr.removeStoredMark(type);
    return true;
  }).run();
  if (result) editor.view.dispatch(closeHistory(editor.state.tr));
  if (result && remember) {editor.storage.inlineStyle.lastStyle = clean;rememberColor({scope:"inline",attributes:clean});}
  return result;
}

export const InlineTextStyle = Mark.create({
  name: "inlineStyle",
  priority: 950,
  addStorage: () => ({ lastStyle: null }),
  addAttributes: () => ({ color: { default: null }, background: { default: null } }),
  parseHTML: () => [{ tag: "span[data-inline-color], span[data-inline-background]", getAttrs: element => ({ color: safeInlineColor(element.getAttribute("data-inline-color")), background: safeInlineColor(element.getAttribute("data-inline-background")) }) }],
  renderHTML({ mark }) {
    const attrs = {};
    if (safeInlineColor(mark.attrs.color)) attrs["data-inline-color"] = mark.attrs.color;
    if (safeInlineColor(mark.attrs.background)) attrs["data-inline-background"] = mark.attrs.background;
    return ["span", attrs, 0];
  },
  parseMarkdown: (token, helpers) => helpers.applyMark("inlineStyle", helpers.parseInline(token.tokens), token.attributes),
  renderMarkdown(node, helpers) {
    const attrs = ["color", "background"].filter(key => safeInlineColor(node.attrs?.[key])).map(key => `data-inline-${key}="${node.attrs[key]}"`).join(" ");
    const content = helpers.renderChildren(node);
    return attrs ? `<span ${attrs}>${content}</span>` : content;
  },
  markdownTokenizer: {
    name: "inlineStyle", level: "inline",
    start: source => source.indexOf("<span data-inline-"),
    tokenize(source, _tokens, lexer) {
      const opening = /^<span ((?:data-inline-(?:color|background)="[a-z]+"\s*)+)>/.exec(source);
      if (!opening) return undefined;
      const attributes = { color: null, background: null };
      for (const match of opening[1].matchAll(/data-inline-(color|background)="([a-z]+)"/g)) {
        if (!colorIds.has(match[2])) return undefined;
        attributes[match[1]] = match[2];
      }
      // Tokenize first, so a literal </span> inside inline code cannot close
      // the colour. Nested canonical spans are already balanced lexer tokens.
      const tokens = lexer.inlineTokens(source.slice(opening[0].length));
      let offset = opening[0].length, depth = 1;
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.type === "html") {
          if (/^<span(?:\s|>)/i.test(token.raw)) depth += 1;
          if (/^<\/span\s*>$/i.test(token.raw)) depth -= 1;
          if (!depth) return { type: "inlineStyle", raw: source.slice(0, offset + token.raw.length), tokens: tokens.slice(0, index), attributes };
        }
        offset += token.raw.length;
      }
      return undefined;
    },
  },
  addKeyboardShortcuts() {
    return { "Mod-Shift-h": () => setInlineStyle(this.editor, this.storage.lastStyle || { background: "yellow" }, false) };
  },
});
