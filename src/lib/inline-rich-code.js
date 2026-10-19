import { Extension, decodeHtmlEntities, encodeHtmlEntities } from "@tiptap/core";
import { safeInlineColor } from "./inline-text-style.js";

const tags = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code", link: "a", inlineStyle: "span" };
const markNames = Object.fromEntries(Object.entries(tags).map(([name, tag]) => [tag, name]));
const escape = value => encodeHtmlEntities(String(value)).replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\|/g, "&#124;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;").replace(/\t/g, "&#9;").replace(/ {2,}/g, spaces => "&#32;".repeat(spaces.length));
const attr = (name, value) => value == null ? "" : ` ${name}="${escape(value)}"`;

function needsRichInline(nodes, container) {
  if (nodes.some(node => !["text", "hardBreak"].includes(node.type) || node.marks?.some(mark => !tags[mark.type]))) return false;
  // Markdown trims a block's edge spaces and normalizes literal line endings,
  // even without a code mark. Keep the characters the user actually typed.
  if (/^\s/.test(nodes[0]?.text || "") || /\s$/.test(nodes.at(-1)?.text || "") || nodes.some((node,index) => /[\r\n\t]| {2,}/.test(node.text || "") || node.type === "hardBreak" && (node.marks?.length || container !== "paragraph" || index === 0 || index === nodes.length - 1 || nodes[index + 1]?.type === "hardBreak"))) return true;
  // Markdown moves a marked run's edge whitespace outside its delimiters,
  // even in the middle of a paragraph. That changes the user's selection
  // formatting after reload, so retain the exact marks on those characters.
  if (nodes.some(node => node.marks?.length && /^\s|\s$/.test(node.text || ""))) return true;
  // GFM autolinks bare URLs/emails on reload, including a link the author has
  // explicitly removed. Canonical inline HTML keeps that text unlinked while
  // ordinary Markdown imports retain their normal autolinking behavior.
  const unlinked = nodes.filter(node => !node.marks?.some(mark => ["link", "code"].includes(mark.type))).map(node => node.text || "").join("");
  if (/:\/\/|www\.|@/i.test(unlinked)) return true;
  // Underline's ++ syntax is an extension to Markdown. Its literal spelling
  // is not escaped by the upstream text writer, so preserve it explicitly.
  if (nodes.some(node => node.text?.includes("++") && !node.marks?.some(mark => mark.type === "code"))) return true;
  let previous = null;
  for (const node of nodes) {
    if (!node.marks?.length) { previous = null; continue; }
    // Adjacent, differently marked runs can produce ambiguous closing/opening
    // delimiters (escaped literal stars followed by italic text, for example).
    // Keep their exact boundary instead of relying on Markdown's delimiter rules.
    if (node.type === "hardBreak" || /[\r\n\t]| {2,}|^\s|\s$/.test(node.text || "")) return true;
    const signature = JSON.stringify(node.marks);
    if (previous && previous !== signature) return true;
    previous = signature;
  }
  return false;
}

function richHTML(nodes) {
  return `<span data-inline-rich>${nodes.map(node => (node.marks || []).reduceRight((content, mark) => {
    let attrs = "";
    if (mark.type === "link") attrs = attr("href", mark.attrs.href) + attr("title", mark.attrs.title);
    if (mark.type === "inlineStyle") attrs = attr("data-inline-color", safeInlineColor(mark.attrs.color)) + attr("data-inline-background", safeInlineColor(mark.attrs.background));
    return `<${tags[mark.type]}${attrs}>${content}</${tags[mark.type]}>`;
  }, node.type === "hardBreak" ? "<br>" : escape(node.text))).join("")}</span>`;
}

// CommonMark cannot express partial emphasis or literal edge whitespace. Use
// valid inline HTML for those cases, retaining readable text rather than data.
export function withRichCode(extension) {
  return extension.extend({
    renderMarkdown(node, helpers, context) {
      return this.parent(node, { ...helpers, renderChildren: (children, separator) => {
        const content = Array.isArray(children) ? children : children?.content || [];
        return needsRichInline(content, node.type) ? richHTML(content) : helpers.renderChildren(children, separator);
      } }, context);
    },
  });
}

// Parse only the small canonical HTML vocabulary emitted above. No DOM and no
// HTML execution are involved, so browser/editor/public/server agree on marks.
export const RichInlineMarkdown = Extension.create({
  name: "richInlineMarkdown",
  parseMarkdown: token => token.content,
  markdownTokenizer: {
    name: "richInlineMarkdown", level: "inline",
    start: source => source.indexOf("<span data-inline-rich>"),
    tokenize(source) {
      const opening = "<span data-inline-rich>";
      if (!source.startsWith(opening)) return undefined;
      const stack = [{ tag: "span", mark: null }], content = [];
      let offset = opening.length;
      const marks = () => stack.flatMap(entry => entry.mark ? [entry.mark] : []);
      while (offset < source.length) {
        const rest = source.slice(offset);
        if (rest[0] !== "<") {
          const end = rest.indexOf("<"), raw = end < 0 ? rest : rest.slice(0, end);
          content.push({ type: "text", text: decodeHtmlEntities(raw), marks: marks() });
          offset += raw.length;
          continue;
        }
        const tag = /^<(\/?)(strong|em|u|s|code|a|span|br)(\s[^<>]*?)?>/.exec(rest);
        if (!tag) return undefined;
        offset += tag[0].length;
        if (tag[1]) {
          if (stack.at(-1)?.tag !== tag[2] || tag[3]) return undefined;
          stack.pop();
          if (!stack.length) return { type: "richInlineMarkdown", raw: source.slice(0, offset), content };
          continue;
        }
        if (tag[2] === "br") {
          if (tag[3]) return undefined;
          content.push({ type: "hardBreak", marks: marks() });
          continue;
        }
        const attributes = {};
        let remaining = tag[3] || "";
        for (const match of remaining.matchAll(/\s([\w-]+)="([^"<>]*)"/g)) {
          if (!["href", "title", "data-inline-color", "data-inline-background"].includes(match[1])) return undefined;
          attributes[match[1]] = decodeHtmlEntities(match[2]);
        }
        remaining = remaining.replace(/\s[\w-]+="[^"<>]*"/g, "");
        if (remaining.trim()) return undefined;
        const attrs = tag[2] === "span" ? { color: safeInlineColor(attributes["data-inline-color"]), background: safeInlineColor(attributes["data-inline-background"]) }
          : tag[2] === "a" ? { href: attributes.href, title: attributes.title || null } : undefined;
        stack.push({ tag: tag[2], mark: { type: markNames[tag[2]], ...(attrs ? { attrs } : {}) } });
      }
      return undefined;
    },
  },
});

export const InlineHTMLBreak = Extension.create({
  name: "inlineHTMLBreak",
  parseMarkdown: () => ({ type: "hardBreak" }),
  markdownTokenizer: {
    name: "inlineHTMLBreak", level: "inline",
    start: source => source.search(/<br\s*\/?\s*>/i),
    tokenize(source) {
      const match = /^<br\s*\/?\s*>/i.exec(source);
      return match ? { type: "inlineHTMLBreak", raw: match[0] } : undefined;
    },
  },
});
