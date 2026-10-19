import { Node } from "@tiptap/core";
import { blockHTML } from "./inline-table-markdown.js";

export const columnWidth = value => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1000000 ? Number(value) : 1;

export const DocumentColumns = Node.create({
  name: "columns", group: "block", content: "column{2,}", defining: true, draggable: true,
  parseHTML: () => [{ tag: 'div[data-type="columns"]' }],
  renderHTML: () => ["div", { "data-type": "columns" }, 0],
  renderMarkdown: node => blockHTML(node),
});

export const DocumentColumn = Node.create({
  name: "column", content: "block+", defining: true, selectable: false,
  addAttributes: () => ({ width: {
    default: 1,
    parseHTML: element => columnWidth(element.getAttribute("data-column-width")),
    renderHTML: attrs => ({ "data-column-width": columnWidth(attrs.width), style: `flex-grow: ${columnWidth(attrs.width)}` }),
  } }),
  parseHTML: () => [{ tag: 'div[data-type="column"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", { ...HTMLAttributes, "data-type": "column", "data-typeset-group": "" }, 0],
});
