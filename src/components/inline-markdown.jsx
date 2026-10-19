import { Fragment, useMemo } from "react";
import { isSafeInlineLink, parseInlineMarkdown } from "@/lib/inline-markdown";
import { safeInlineColor } from "@/lib/inline-text-style";

function renderNodes(nodes, prefix) {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;
    if (!["text", "hardBreak"].includes(node.type)) return <Fragment key={key}>{node.attrs?.alt || renderNodes(node.content || [], key)}</Fragment>;
    const content = (node.marks || []).reduceRight((value, mark) => {
      const Tag = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code" }[mark.type];
      if (Tag) return <Tag>{value}</Tag>;
      if (mark.type === "inlineStyle") return <span data-inline-color={safeInlineColor(mark.attrs?.color) || undefined} data-inline-background={safeInlineColor(mark.attrs?.background) || undefined}>{value}</span>;
      if (mark.type === "link" && isSafeInlineLink(mark.attrs?.href)) {
        const external = /^https?:\/\//i.test(mark.attrs.href);
        return <a href={mark.attrs.href} title={mark.attrs.title || undefined} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>{value}</a>;
      }
      return value;
    }, node.type === "hardBreak" ? <br /> : node.text);
    return <Fragment key={key}>{content}</Fragment>;
  });
}

export function InlineMarkdown({ text }) {
  const nodes = useMemo(() => parseInlineMarkdown(text), [text]);
  const content = renderNodes(nodes, "inline");
  // The canonical span preserves literal characters in storage; preserve their
  // visible spaces and line breaks in the lightweight public renderer too.
  return typeof text === "string" && text.includes("<span data-inline-rich>") ? <span style={{ whiteSpace: "pre-wrap" }}>{content}</span> : content;
}
