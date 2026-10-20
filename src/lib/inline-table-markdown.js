import { safeImageAlignment } from "./inline-image-alignment.js";
import { Extension, decodeHtmlEntities, encodeHtmlEntities } from "@tiptap/core";
import { inlineLinkHTMLAttributes, parseInlineLinkHTMLAttributes } from "./inline-link-attributes.js";
import { safeInlineColor } from "./inline-text-style.js";
import { blockColorTypes, safeBlockColor } from "./inline-block-color-values.js";
import { appendInlineEmphasisMark } from "./inline-italic.js";

const marker = '<table data-inline-table="true"';
const esc = value => encodeHtmlEntities(String(value)).replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\r/g, "&#13;").replace(/\n/g, "&#10;").replace(/\t/g, "&#9;");
const safeURL = value => /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(value || "");
const markTags = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code", link: "a", inlineStyle: "span", normalText: "span" };
const tagMarks = { ...Object.fromEntries(Object.entries(markTags).map(([type, tag]) => [tag, type])), span: "inlineStyle" };
const nodeTags = { columns: "div", column: "div", nestedBlock: "div", paragraph: "p", blockquote: "blockquote", bulletList: "ul", orderedList: "ol", listItem: "li", taskList: "ul", taskItem: "li", details: "details", detailsSummary: "summary", detailsContent: "div", typographyBlock: "p", table: "table", tableRow: "tr", tableCell: "td", tableHeader: "th", image: "img", hardBreak: "br", horizontalRule: "hr", codeBlock: "pre" };
const voidTags = new Set(["br", "hr", "img"]);
const allowedAttributes = new Set(["data-image-align", "data-inline-link", "data-inline-normal", "data-column-width", "data-header-row", "data-header-column", "data-width-number", "data-height-number", "data-inline-block", "data-block-color", "data-inline-table", "colspan", "rowspan", "colwidth", "align", "start", "type", "data-type", "data-checked", "open", "data-language", "data-typography", "src", "alt", "title", "width", "height", "href", "target", "rel", "class", "data-inline-color", "data-inline-background"]);
const attrs = values => Object.entries(values || {}).filter(([, value]) => value != null).map(([key, value]) => ` ${key}="${esc(value)}"`).join("");
const wrap = (tag, values, content = "") => `<${tag}${attrs(values)}${voidTags.has(tag) ? "/>" : `>${content}</${tag}>`}`;

// GFM cannot express spans, header columns, widths or block content in a cell.
// Emit ordinary, readable HTML only when GFM would discard that information.
export function needsRichTable(node) {
  if (node.attrs?.headerRow != null || node.attrs?.headerColumn != null) return true;
  if (safeBlockColor(node.attrs?.blockColor) || (node.content || []).some(row => (row.content || []).some(cell => hasBlockColors(cell)))) return true;
  return (node.content || []).some((row, index) => (row.content || []).some((cell, column) => {
    const a = cell.attrs || {};
    const spacing = (cell.content?.[0]?.content || []).some(node => node.type === "text" && /[\r\n\t]| {2,}|^\s|\s$/.test(node.text || ""));
    return cell.type !== (index === 0 ? "tableHeader" : "tableCell") || (a.colspan || 1) !== 1 || (a.rowspan || 1) !== 1 || a.colwidth?.some(Boolean) || cell.content?.length !== 1 || cell.content?.[0]?.type !== "paragraph" || spacing || (a.align || null) !== (node.content[0].content[column]?.attrs?.align || null);
  }));
}

function hasBlockColors(node) { return Boolean(safeBlockColor(node.attrs?.blockColor) || node.content?.some(hasBlockColors)); }

export function tableHTML(node) {
  function render(node) {
    if (node.type === "text" || node.type === "hardBreak") return (node.marks || []).reduceRight((text, mark) => {
      const tag = markTags[mark.type], a = mark.attrs || {};
      if (!tag) throw new Error(`Неподдерживаемый стиль таблицы: ${mark.type}`);
      if (mark.type === "link" && !safeURL(a.href)) return text;
      const attributes = mark.type === "link" ? inlineLinkHTMLAttributes(a)
        : mark.type === "inlineStyle" ? { "data-inline-color": safeInlineColor(a.color), "data-inline-background": safeInlineColor(a.background) } : mark.type === "normalText" ? { "data-inline-normal": "true" } : {};
      return wrap(tag, attributes, text);
    }, node.type === "text" ? esc(node.text) : "<br/>");
    const a = node.attrs || {}, tag = node.type === "heading" ? `h${a.level}` : nodeTags[node.type];
    if (!tag) throw new Error(`Неподдерживаемый блок таблицы: ${node.type}`);
    let attributes = {};
    if (node.type === "columns") attributes = { "data-type": "columns" };
    if (node.type === "column") attributes = { "data-type": "column", "data-column-width": a.width || 1 };
    if (node.type === "nestedBlock") attributes = { "data-type": "nestedBlock" };
    if (node.type === "table") attributes = { "data-inline-table": "true", "data-header-row": a.headerRow, "data-header-column": a.headerColumn };
    if (["tableCell", "tableHeader"].includes(node.type)) attributes = { colspan: a.colspan > 1 ? a.colspan : null, rowspan: a.rowspan > 1 ? a.rowspan : null, colwidth: a.colwidth?.join(","), align: a.align };
    if (node.type === "orderedList") attributes = { start: a.start, type: a.type };
    if (node.type === "taskList") attributes = { "data-type": "taskList" };
    if (node.type === "taskItem") attributes = { "data-type": "taskItem", "data-checked": Boolean(a.checked) };
    if (node.type === "details") attributes = { open: a.open ? "" : null };
    if (node.type === "detailsContent") attributes = { "data-type": "detailsContent" };
    if (node.type === "typographyBlock") attributes = { "data-typography": a.role };
    if (node.type === "codeBlock") attributes = { "data-language": a.language };
    if (node.type === "image") attributes = { src: safeURL(a.src) ? a.src : "", alt: a.alt, title: a.title, width: a.width, height: a.height, "data-width-number": typeof a.width === "number" ? "true" : null, "data-height-number": typeof a.height === "number" ? "true" : null };
    if (node.type === "image" && safeImageAlignment(a.alignment)) attributes["data-image-align"] = a.alignment;
    if (safeBlockColor(a.blockColor)) attributes["data-block-color"] = a.blockColor;
    return wrap(tag, attributes, (node.content || []).map(render).join(""));
  }
  return render(node);
}

function htmlTree(source) {
  const root = { children: [] }, stack = [root];
  let offset = 0;
  for (const match of source.matchAll(/<[^<>]*>|[^<]+/g)) {
    if (match.index !== offset || stack.length > 100) throw new Error("Invalid table markup");
    offset += match[0].length;
    if (!match[0].startsWith("<")) { stack.at(-1).children.push({ text: decodeHtmlEntities(match[0]) }); continue; }
    const closing = /^<\/([a-z][a-z0-9]*)>$/.exec(match[0]);
    if (closing) {
      if (stack.length < 2 || stack.at(-1).tag !== closing[1]) throw new Error("Unbalanced table markup");
      stack.pop(); continue;
    }
    const opening = /^<([a-z][a-z0-9]*)([^<>]*?)(\/?)>$/.exec(match[0]);
    if (!opening) throw new Error("Invalid table tag");
    const attributes = {}, raw = opening[2];
    let end = 0;
    for (const a of raw.matchAll(/\s+([a-z][a-z0-9-]*)="([^"<>]*)"/g)) {
      if (a.index !== end || !allowedAttributes.has(a[1]) || a[1] in attributes) throw new Error("Invalid table attribute");
      end = a.index + a[0].length; attributes[a[1]] = decodeHtmlEntities(a[2]);
    }
    if (raw.slice(end).trim()) throw new Error("Invalid table attributes");
    const node = { tag: opening[1], attrs: attributes, children: [] };
    stack.at(-1).children.push(node);
    if (!voidTags.has(node.tag)) { if (opening[3]) throw new Error("Invalid self-closing table node"); stack.push(node); }
  }
  if (offset !== source.length || stack.length !== 1 || root.children.length !== 1) throw new Error("Invalid table document");
  return root.children[0];
}

function parseCanonicalHTML(source, kind) {
  const positive = (value, max = 1000) => { const n = Number(value || 1); if (!Number.isInteger(n) || n < 1 || n > max) throw new Error("Invalid cell span"); return n; };
  const convert = (node, marks = []) => {
    if (node.text != null) return node.text ? [{ type: "text", text: node.text, ...(marks.length ? { marks } : {}) }] : [];
    const { tag, attrs: a, children } = node;
    if (tagMarks[tag]) {
      if (a["data-inline-normal"] != null && (tag !== "span" || a["data-inline-normal"] !== "true")) throw new Error("Invalid normal-text mark");
      const type = tag === "span" && a["data-inline-normal"] === "true" ? "normalText" : tagMarks[tag];
      if (a["data-inline-link"] != null && (tag !== "a" || a["data-inline-link"] !== "true")) throw new Error("Invalid canonical link marker");
      const attributes = type === "link" ? parseInlineLinkHTMLAttributes(a)
        : type === "inlineStyle" ? { color: safeInlineColor(a["data-inline-color"]), background: safeInlineColor(a["data-inline-background"]) } : null;
      if (type === "link" && !safeURL(a.href)) return children.flatMap(child => convert(child, marks));
      return children.flatMap(child => convert(child, appendInlineEmphasisMark(marks, { type, ...(attributes ? { attrs: attributes } : {}) })));
    }
    let type = { table: "table", tr: "tableRow", td: "tableCell", th: "tableHeader", p: "paragraph", blockquote: "blockquote", ul: "bulletList", ol: "orderedList", li: "listItem", details: "details", summary: "detailsSummary", div: "detailsContent", pre: "codeBlock", img: "image", br: "hardBreak", hr: "horizontalRule" }[tag];
    if (/^h[1-6]$/.test(tag)) type = "heading";
    if (!type) throw new Error(`Unknown table tag: ${tag}`);
    if (tag === "div" && ["columns", "column"].includes(a["data-type"])) type = a["data-type"];
    if (tag === "div" && a["data-type"] === "nestedBlock") type = "nestedBlock";
    if (tag === "ul" && a["data-type"] === "taskList") type = "taskList";
    if (tag === "li" && a["data-type"] === "taskItem") type = "taskItem";
    if (tag === "p" && ["label", "statement"].includes(a["data-typography"])) type = "typographyBlock";
    let attributes;
    if (type === "column") {
      const width = Number(a["data-column-width"] ?? 1);
      if (!Number.isFinite(width) || width <= 0 || width > 1000000) throw new Error("Invalid document column width");
      attributes = { width };
    }
    if (type === "table") for (const [attribute, name] of [["data-header-row", "headerRow"], ["data-header-column", "headerColumn"]]) {
      if (a[attribute] == null) continue;
      if (!["true", "false"].includes(a[attribute])) throw new Error("Invalid table header state");
      attributes = { ...attributes, [name]: a[attribute] === "true" };
    }
    if (["tableCell", "tableHeader"].includes(type)) {
      const colwidth = a.colwidth ? a.colwidth.split(",").map(value => { const n = Number(value); if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Error("Invalid column width"); return n; }) : null;
      attributes = { colspan: positive(a.colspan), rowspan: positive(a.rowspan), colwidth, align: ["left", "center", "right"].includes(a.align) ? a.align : null };
      if (colwidth && colwidth.length !== attributes.colspan) throw new Error("Invalid column widths");
    }
    if (type === "heading") attributes = { level: Number(tag[1]) };
    if (type === "orderedList") attributes = { start: positive(a.start, Number.MAX_SAFE_INTEGER), type: ["a", "A", "i", "I", "1"].includes(a.type) ? a.type : null };
    if (type === "taskItem") attributes = { checked: a["data-checked"] === "true" };
    if (type === "details") attributes = { open: "open" in a };
    if (type === "typographyBlock") attributes = { role: a["data-typography"] };
    if (type === "codeBlock") attributes = { language: a["data-language"] || null };
    if (type === "image") attributes = { src: safeURL(a.src) ? a.src : "", alt: a.alt ?? null, title: a.title ?? null, width: a.width ?? null, height: a.height ?? null };
    if (type === "image" && a["data-image-align"] != null) { if (!safeImageAlignment(a["data-image-align"])) throw new Error("Invalid image alignment"); attributes.alignment = a["data-image-align"]; }
    if(type==="image")for(const name of ["width","height"])if(a[`data-${name}-number`]!=null){if(a[`data-${name}-number`]!=="true"||a[name]==null||!Number.isFinite(Number(a[name])))throw new Error("Invalid image size");attributes[name]=Number(a[name]);}
    if (a["data-block-color"] != null) {
      if (!blockColorTypes.includes(type) || !safeBlockColor(a["data-block-color"])) throw new Error("Invalid block color");
      attributes = { ...attributes, blockColor: a["data-block-color"] };
    }
    const content = children.flatMap(child => convert(child, marks));
    return [{ type, ...(attributes ? { attrs: attributes } : {}), ...(content.length ? { content } : {}), ...(marks.length && type === "hardBreak" ? { marks } : {}) }];
  };
  const root = htmlTree(source);
  if (kind === "table" && (root.tag !== "table" || root.attrs["data-inline-table"] !== "true")) throw new Error("Not a rich table");
  if (kind === "block" && (root.tag !== "div" || root.attrs["data-inline-block"] !== "true" || Object.keys(root.attrs).length!==1 || root.children.length !== 1)) throw new Error("Not a styled block");
  const result = convert(kind === "block" ? root.children[0] : root)[0];
  const blocks = new Set([...Object.keys(nodeTags), "heading"].filter(type => !["column", "tableRow", "tableCell", "tableHeader", "detailsSummary", "detailsContent", "listItem", "taskItem", "hardBreak"].includes(type)));
  const validate = node => {
    const children = node.content || [];
    const allowed = node.type === "columns" ? ["column"] : node.type === "table" ? ["tableRow"] : node.type === "tableRow" ? ["tableCell", "tableHeader"]
      : ["column", "nestedBlock", "tableCell", "tableHeader", "blockquote", "detailsContent", "listItem", "taskItem"].includes(node.type) ? [...blocks]
      : node.type === "details" ? ["detailsSummary", "detailsContent"] : node.type === "taskList" ? ["taskItem"]
      : ["bulletList", "orderedList"].includes(node.type) ? ["listItem"] : node.type === "codeBlock" ? ["text"]
      : ["paragraph", "heading", "detailsSummary", "typographyBlock"].includes(node.type) ? ["text", "hardBreak"] : [];
    if (children.some(child => !allowed.includes(child.type))) throw new Error("Invalid table content");
    if (["column", "nestedBlock", "table", "tableCell", "tableHeader", "blockquote", "detailsContent", "taskList", "bulletList", "orderedList"].includes(node.type) && !children.length) throw new Error("Empty table structure");
    if (node.type === "columns" && children.length < 2) throw new Error("Invalid document columns");
    if (["listItem", "taskItem"].includes(node.type) && children[0]?.type !== "paragraph") throw new Error("Invalid list item");
    if (node.type === "details" && (children.length !== 2 || children[0].type !== "detailsSummary" || children[1].type !== "detailsContent")) throw new Error("Invalid details");
    children.forEach(validate);
    if (node.type === "table") {
      const width = (children[0].content || []).reduce((sum, cell) => sum + cell.attrs.colspan, 0);
      if (!width || width * children.length > 1000000) throw new Error("Invalid table dimensions");
      const grid = new Uint8Array(width * children.length);
      children.forEach((row, y) => {
        let x = 0;
        for (const cell of row.content || []) {
          while (x < width && grid[y * width + x]) x += 1;
          if (x + cell.attrs.colspan > width || y + cell.attrs.rowspan > children.length) throw new Error("Invalid spanning cell");
          for (let dy = 0; dy < cell.attrs.rowspan; dy += 1) for (let dx = 0; dx < cell.attrs.colspan; dx += 1) {
            const index = (y + dy) * width + x + dx;
            if (grid[index]) throw new Error("Overlapping table cells");
            grid[index] = 1;
          }
          x += cell.attrs.colspan;
        }
      });
      if (grid.some(value => !value)) throw new Error("Incomplete table grid");
    }
  };
  if (kind === "block" && !blocks.has(result.type)) throw new Error("Invalid styled block");
  validate(result);
  return result;
}

export const parseTableHTML = source => parseCanonicalHTML(source, "table");
export const blockHTML = node => `<div data-inline-block="true">${tableHTML(node)}</div>`;
export const parseBlockHTML = source => parseCanonicalHTML(source,"block");

export const RichBlockMarkdown = Extension.create({
  name: "richBlockMarkdown",
  parseMarkdown: token => token.block || { type:"paragraph",content:[{type:"text",text:token.raw}] },
  markdownTokenizer: { name:"richBlockMarkdown",level:"block",start:source=>source.indexOf('<div data-inline-block="true">'),
    tokenize(source) {
      if (!source.startsWith('<div data-inline-block="true">')) return undefined;
      let depth=0;
      for(const tag of source.matchAll(/<\/?div(?:\s[^<>]*)?>/g)) {
        depth+=tag[0].startsWith("</")?-1:1;if(depth)continue;
        const raw=source.slice(0,tag.index+tag[0].length);
        try{return{type:"richBlockMarkdown",raw,block:parseBlockHTML(raw)};}catch{return{type:"richBlockMarkdown",raw};}
      }
      return {type:"richBlockMarkdown",raw:source};
    },
  },
});

export const RichTableMarkdown = Extension.create({
  name: "richTableMarkdown",
  parseMarkdown: token => token.table || { type: "paragraph", content: [{ type: "text", text: token.raw }] },
  markdownTokenizer: {
    name: "richTableMarkdown", level: "block", start: source => source.indexOf(marker),
    tokenize(source) {
      if (!source.startsWith(marker)) return undefined;
      let depth = 0;
      for (const tag of source.matchAll(/<\/?table(?:\s[^<>]*)?>/g)) {
        depth += tag[0].startsWith("</") ? -1 : 1;
        if (depth) continue;
        const raw = source.slice(0, tag.index + tag[0].length);
        try { return { type: "richTableMarkdown", raw, table: parseTableHTML(raw) }; }
        catch { return { type: "richTableMarkdown", raw }; }
      }
      return { type: "richTableMarkdown", raw: source };
    },
  },
});
