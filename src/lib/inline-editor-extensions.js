import { InlineItalic, InlineNormalText } from "./inline-italic.js";
import { InlineNativeFocus, InlineNativeSelection } from "./inline-native-selection.js";
import { InlinePasteHistory } from "./inline-paste-history.js";
import { DocumentColumns, DocumentColumn } from "./inline-columns.js";
import { NestedBlock } from "./inline-block-tree.js";
import { InputRule, Node, createBlockMarkdownSpec, parseAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import TaskList from "@tiptap/extension-task-list";
import { convertParagraphToToggle, SymbolBlockquote, SymbolOrderedList, SymbolCodeBlock, SymbolStrike, SymbolTaskItem } from "./inline-symbol-shortcuts.js";
import Placeholder from "@tiptap/extension-placeholder";
import { InlineImage as Image } from "./inline-image-node.js";
import { TableKit } from "@tiptap/extension-table";
import { Details, DetailsSummary, DetailsContent } from "@tiptap/extension-details";
import { InlineBlockSelection } from "./inline-block-selection-extension.js";
import Code from "@tiptap/extension-code";
import { InlineTextStyle } from "./inline-text-style.js";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import { InlineHTMLBreak, RichInlineMarkdown, withRichCode } from "./inline-rich-code.js";
import { closeHistory } from "@tiptap/pm/history";
import { columnResizing, columnResizingPluginKey } from "@tiptap/pm/tables";
import { needsRichTable, tableHTML, RichTableMarkdown, RichBlockMarkdown } from "./inline-table-markdown.js";
import { InlineBlockColor, withBlockColorMarkdown } from "./inline-block-color.js";

// Preserve Rollapp's semantic Markdown directives when editing old documents.
const TypographyBlock = Node.create({
  name: "typographyBlock",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes: () => ({ role: { default: "label" } }),
  parseHTML: () => [{ tag: "p[data-typography]", getAttrs: node => ({ role: node.dataset.typography }) }],
  renderHTML: ({ node }) => ["p", { "data-typography": node.attrs.role }, 0],
  markdownTokenName: "typographyBlock",
  markdownTokenizer: {
    name: "typographyBlock", level: "block",
    start: source => source.search(/^:::(label|statement) /m),
    tokenize(source, tokens, lexer) {
      const match = /^:::(label|statement) ([^\n]+)(?:\n|$)/.exec(source);
      if (!match) return undefined;
      return { type: "typographyBlock", raw: match[0], role: match[1], tokens: lexer.inlineTokens(match[2]) };
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode("typographyBlock", { role: token.role }, helpers.parseInline(token.tokens)),
  renderMarkdown: (node, helpers) => `:::${node.attrs.role} ${helpers.renderChildren(node.content)}`,
});

// Container delimiters must ignore one-line Rollapp directives and code fences.
// The upstream generic scanner counts :::label as an unclosed nested container.
function detailsMarkdown(nodeName, content = "block") {
  const spec = createBlockMarkdownSpec({ nodeName, content });
  return { ...spec, markdownTokenizer: { ...spec.markdownTokenizer,
    tokenize(source, tokens, lexer) {
      const opening = new RegExp(`^:::${nodeName}(?:[ \\t]+\\{([^}]*)\\})?[ \\t]*\\n`).exec(source);
      if (!opening) return undefined;
      let depth = 1, fence = null;
      const rest = source.slice(opening[0].length);
      for (const line of rest.matchAll(/[^\n]*(?:\n|$)/g)) {
        if (!line[0]) break;
        const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line[0]);
        if (fence) {
          if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
          continue;
        }
        if (marker) { fence = marker[1]; continue; }
        if (/^:::details(?:Summary|Content)?(?:[ \t]+\{[^}]*\})?[ \t]*\r?\n?$/.test(line[0])) depth += 1;
        else if (/^:::[ \t]*\r?\n?$/.test(line[0])) depth -= 1;
        if (depth !== 0) continue;
        const body = rest.slice(0, line.index);
        const children = content === "inline" ? lexer.inlineTokens(body.trim()) : lexer.blockTokens(body);
        if (content === "block") for (const child of children) if (child.text && !child.tokens?.length) child.tokens = lexer.inlineTokens(child.text);
        return { type: nodeName, raw: source.slice(0, opening[0].length + line.index + line[0].length), attributes: parseAttributes(opening[1] || ""), tokens: children };
      }
      return undefined;
    },
  } };
}

const EditableDetails = Details.extend({
  ...detailsMarkdown("details"),
  addKeyboardShortcuts() {
    const shortcuts = this.parent?.() || {};
    return { ...shortcuts,
      Backspace: props => this.editor.commands.undoInputRule() || shortcuts.Backspace?.(props) || false,
      Enter: props => {
        const { $from, empty } = this.editor.state.selection;
        if (empty && $from.parent.type.name === "detailsSummary" && $from.node(-1).attrs.open) {
          const first = this.editor.state.doc.nodeAt($from.after())?.firstChild;
          if (first?.type.name === "paragraph" && !first.content.size) return this.editor.commands.setTextSelection($from.after() + 2);
        }
        return shortcuts.Enter?.(props) || false;
      },
    };
  },
  addInputRules() {
    return [new InputRule({ find: /^>[\s\u00a0]$/, handler: ({ state, range }) => convertParagraphToToggle(state.tr, range) ? undefined : null })];
  },
});
const EditableDetailsSummary = withRichCode(DetailsSummary.extend({ ...detailsMarkdown("detailsSummary", "inline"), content: "inline*" }));
const EditableTableKit = TableKit.extend({
  addExtensions() { return this.parent().map(extension => extension.name === "table" ? withRichCode(extension).extend({
    addAttributes() {
      return { ...this.parent?.(), ...Object.fromEntries(["headerRow", "headerColumn"].map(name => {
        const attribute = name === "headerRow" ? "data-header-row" : "data-header-column";
        return [name, { default: null, parseHTML: element => ["true", "false"].includes(element.getAttribute(attribute)) ? element.getAttribute(attribute) === "true" : null, renderHTML: attrs => attrs[name] == null ? {} : { [attribute]: String(attrs[name]) } }];
      })) };
    },
    renderMarkdown(node, helpers) { return needsRichTable(node) ? tableHTML(node) : this.parent(node, helpers); },
    addProseMirrorPlugins() {
      const plugins = this.parent?.() || [];
      // Install once even when initially read-only. The upstream event handlers
      // check view.editable, so a later permission grant can enable resizing.
      if (this.options.resizable && !plugins.some(plugin => plugin.key === columnResizingPluginKey.key)) plugins.unshift(columnResizing({ handleWidth: this.options.handleWidth, cellMinWidth: this.options.cellMinWidth, defaultCellMinWidth: this.options.cellMinWidth, View: this.options.View, lastColumnResizable: this.options.lastColumnResizable }));
      return plugins;
    },
    addKeyboardShortcuts() {
      return { ...this.parent?.(), Tab: () => {
        if (this.editor.commands.goToNextCell()) return true;
        if (!this.editor.can().addRowAfter()) return false;
        this.editor.view.dispatch(closeHistory(this.editor.state.tr));
        const result = this.editor.chain().addRowAfter().goToNextCell().run();
        this.editor.view.dispatch(closeHistory(this.editor.state.tr));
        return result;
      } };
    },
  }) : extension); },
});
// Empty content must still contain a valid paragraph after Markdown reload.
const EditableDetailsContent = DetailsContent.extend({
  ...detailsMarkdown("detailsContent"),
  parseMarkdown(token, helpers) {
    const children = helpers.parseChildren(token.tokens || []);
    return helpers.createNode("detailsContent", {}, children.length ? children : [{ type: "paragraph" }]);
  },
});

const InlineStarterKit = StarterKit.extend({
  addExtensions() { return this.parent().map(extension => extension.name === "italic" ? InlineItalic : extension); },
});

export function inlineEditorExtensions(placeholder = "Начните писать или введите / для выбора блока…", documentExtension) {
  return [
    InlineBlockSelection, InlinePasteHistory, InlineNativeSelection, InlineNativeFocus,
    InlineStarterKit.configure({ ...(documentExtension ? { document: false } : {}), link: { openOnClick: false, autolink: true, markdownLinks: true }, code: false, paragraph: false, heading: false, trailingNode: false, codeBlock: false, strike: false, blockquote: false, orderedList: false }),
    ...(documentExtension ? [documentExtension] : []),
    withRichCode(Paragraph), withRichCode(Heading), NestedBlock, DocumentColumns, DocumentColumn, RichInlineMarkdown, InlineHTMLBreak,
    Code.extend({ excludes: "", priority: 50 }), InlineTextStyle, InlineNormalText,
    SymbolCodeBlock, SymbolStrike, SymbolBlockquote, SymbolOrderedList,
    Markdown, TaskList, SymbolTaskItem.configure({ nested: true, HTMLAttributes: { "data-type": "taskItem" }, a11y: { checkboxLabel: node => `Выполнено: ${node.textContent || "задача"}` } }),
    Placeholder.configure({ placeholder, ...(documentExtension ? { includeChildren: true } : {}) }), Image, RichTableMarkdown, EditableTableKit.configure({ table: { resizable: true, renderWrapper: true, cellMinWidth: 96 } }), withRichCode(TypographyBlock),
    EditableDetails.configure({ persist: true, renderToggleButton: ({ element, isOpen }) => {
      element.setAttribute("aria-label", isOpen ? "Свернуть блок" : "Раскрыть блок");
      element.setAttribute("aria-expanded", String(isOpen));
    } }), EditableDetailsSummary, EditableDetailsContent,
  ].map(withBlockColorMarkdown).concat(InlineBlockColor,RichBlockMarkdown);
}
