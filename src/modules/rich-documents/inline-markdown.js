import { MarkdownManager } from "@tiptap/markdown";
import { Marked } from "marked";
import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import Bold from "@tiptap/extension-bold";
import { InlineItalic, InlineNormalText } from "./inline-italic.js";
import Strike from "@tiptap/extension-strike";
import Underline from "@tiptap/extension-underline";
import Code from "@tiptap/extension-code";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { InlineTextStyle } from "./inline-text-style.js";
import { InlineHTMLBreak, RichInlineMarkdown } from "./inline-rich-code.js";

// Public prose uses the same inline Markdown marks without loading the React
// editor, drag handles, tables or the block editing plugins.
const InlineParagraph = Paragraph.extend({
  markdownTokenName: "publicInlineParagraph",
  markdownTokenizer: {
    name: "publicInlineParagraph", level: "block", start: () => 0,
    tokenize: (source, _tokens, lexer) => ({ type: "publicInlineParagraph", raw: source, tokens: lexer.inlineTokens(source) }),
  },
  parseMarkdown: (token, helpers) => helpers.createNode("paragraph", {}, helpers.parseInline(token.tokens)),
});
// Its block lexer only supplies the existing paragraph's inline content. Keep
// that tokenizer on an isolated Marked instance so it cannot affect editors.
const extensions = [Document, InlineParagraph, Text, HardBreak, Bold, InlineItalic, Strike, Underline, Code.extend({ excludes: "", priority: 50 }), Link, Image.configure({ inline: true }), InlineTextStyle, InlineNormalText, RichInlineMarkdown, InlineHTMLBreak];
const manager = new MarkdownManager({ marked: new Marked(), extensions });
const schema = getSchema(extensions);
// Match the editor's mark ordering, including color outside bold/code so its
// foreground and highlight paint the same way in both reading and editing.
export const parseInlineMarkdown = source => schema.nodeFromJSON(manager.parse(source)).toJSON().content || [];
export const isSafeInlineLink = value => /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(value || "");
