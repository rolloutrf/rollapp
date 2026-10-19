import Image from "@tiptap/extension-image";
import { blockHTML } from "./inline-table-markdown.js";

// Ordinary image Markdown discards dimensions and cannot quote every caption.
// Reuse the canonical block reader shared by editing and public documents.
export const InlineImage = Image.extend({
  addAttributes() {
    const attributes = this.parent();
    return { ...attributes, ...Object.fromEntries(["width", "height"].map(name => [name, {
      ...attributes[name],
      parseHTML: element => {
        const value = element.getAttribute(name);
        return element.getAttribute(`data-${name}-number`) === "true" && value != null && Number.isFinite(Number(value)) ? Number(value) : value;
      },
      renderHTML: attrs => ({ [name]: attrs[name], [`data-${name}-number`]: typeof attrs[name] === "number" ? "true" : null }),
    }])) };
  },
  renderMarkdown(node, helpers) {
    const { src = "", alt = "", title, width, height } = node.attrs || {};
    return width != null || height != null || title != null || src.startsWith("/") || /[\s()]/.test(src) || /[\[\]\r\n\t]/.test(alt)
      ? blockHTML(node) : this.parent(node, helpers);
  },
});
