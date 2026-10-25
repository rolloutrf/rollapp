import { Node } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { blockHTML } from "./inline-table-markdown.js";
import { canReloadNestedBlocks } from "./inline-block-depth.js";
import { requestInlineCaretReveal } from "./inline-caret-intent.js";
import { safeImageSource } from "./inline-image-intent.js";

export function validCaptionFigureDOM(element) {
  const children = [...(element?.children || [])];
  return element?.tagName === "FIGURE" && element.getAttribute("data-type") === "captionedImage" && children.length === 2 && children[0].tagName === "IMG" && children[1].tagName === "FIGCAPTION" && Boolean(safeImageSource(children[0].getAttribute("src")));
}

export function captionImageSelectionPlugin() {
  return new Plugin({ appendTransaction(transactions, _before, state) {
    if (!transactions.some(tr => tr.selectionSet)) return null;
    const selection = state.selection;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image" || selection.$from.parent.type.name !== "captionedImage") return null;
    // A required image child cannot be deleted on its own: the fitter would
    // synthesize an empty-src image. Select the complete media/caption unit.
    return state.tr.setSelection(NodeSelection.create(state.doc, selection.$from.before())).setMeta("addToHistory", false);
  } });
}

// A caption is authored inline content, never an alt/title string or a second
// editor. Keep the existing leaf image intact inside one movable document unit.
export const CaptionedImage = Node.create({
  name: "captionedImage", group: "block", content: "image imageCaption", defining: true,
  parseHTML: () => [{ tag: 'figure[data-type="captionedImage"]', getAttrs: element => validCaptionFigureDOM(element) ? null : false }],
  renderHTML: () => ["figure", { "data-type": "captionedImage" }, 0],
  renderMarkdown: node => blockHTML(node),
  addProseMirrorPlugins: () => [captionImageSelectionPlugin()],
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("figure");
      dom.dataset.type = "captionedImage";
      let current = node, image = null, frame = 0, destroyed = false;
      const measure = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (destroyed || !dom.isConnected || !image) return;
          const width = image.getBoundingClientRect().width;
          const value = `${width}px`;
          if (width > 0 && dom.style.getPropertyValue("--inline-image-caption-width") !== value) dom.style.setProperty("--inline-image-caption-width", value);
        });
      };
      const resize = new ResizeObserver(measure);
      const bind = () => {
        const next = [...dom.children].find(child => child.tagName === "IMG");
        if (next !== image) {
          if (image) { resize.unobserve(image); image.removeEventListener("load", measure); }
          image = next;
          if (image) { resize.observe(image); image.addEventListener("load", measure); }
        }
        dom.dataset.imageAlign = current.firstChild.attrs.alignment || "left";
        measure();
      };
      const mutation = new MutationObserver(bind);
      mutation.observe(dom, { childList: true });
      return {
        dom, contentDOM: dom,
        update(next) { if (next.type !== current.type) return false; current = next; bind(); return true; },
        ignoreMutation(record) { return record.type === "attributes" && record.target === dom && ["style", "data-image-align"].includes(record.attributeName); },
        destroy() { destroyed = true; cancelAnimationFrame(frame); mutation.disconnect(); resize.disconnect(); image?.removeEventListener("load", measure); },
      };
    };
  },
});

export const ImageCaption = Node.create({
  name: "imageCaption", content: "inline*", defining: true, selectable: false,
  parseHTML: () => [{ tag: 'figure[data-type="captionedImage"] > figcaption', getAttrs: element => validCaptionFigureDOM(element.parentElement) ? null : false }],
  renderHTML: () => ["figcaption", { "data-image-caption": "true", "aria-label": "Подпись изображения" }, 0],
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        if (!this.editor.isEditable || this.editor.isDestroyed || this.editor.view.composing) return false;
        const { selection } = this.editor.state;
        if (!selection.empty || selection.$from.parent.type.name !== this.name || selection.$from.parentOffset) return false;
        return this.editor.commands.setNodeSelection(selection.$from.before(selection.$from.depth - 1));
      },
      Escape: () => {
        if (!this.editor.isEditable || this.editor.isDestroyed || this.editor.view.composing) return false;
        const { $from } = this.editor.state.selection;
        if ($from.parent.type.name !== this.name) return false;
        return this.editor.commands.setNodeSelection($from.before($from.depth - 1));
      },
      Enter: () => {
        if (!this.editor.isEditable || this.editor.isDestroyed || this.editor.view.composing) return false;
        const { state, view } = this.editor, { selection } = state;
        if (!selection.empty || selection.$from.parent.type.name !== this.name) return false;
        const after = selection.$from.after(selection.$from.depth - 1), next = state.doc.nodeAt(after);
        let tr = closeHistory(state.tr);
        if (next?.type.name !== "paragraph" || next.content.size) tr = tr.insert(after, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        view.dispatch(tr.scrollIntoView());
        view.dispatch(closeHistory(this.editor.state.tr));
        return true;
      },
    };
  },
});

export function imageCaptionTransaction(state, request) {
  if (state.doc !== request.doc || !state.selection.eq(request.selection)) return null;
  const image = state.doc.nodeAt(request.position), wrapper = state.schema.nodes.captionedImage, caption = state.schema.nodes.imageCaption;
  if (!wrapper || !caption || image?.type.name !== "image" || image !== request.node) return null;
  const $pos = state.doc.resolve(request.position);
  // Reopening an existing caption moves only the selection, not the document.
  if ($pos.parent.type.name === "captionedImage") {
    return state.tr.setSelection(TextSelection.create(state.doc, request.position + image.nodeSize + 1));
  }
  const content = Fragment.from(wrapper.create(null, [image, caption.create()]));
  if (!$pos.parent.canReplace($pos.index(), $pos.index() + 1, content)) return null;
  const tr = closeHistory(state.tr).replaceWith(request.position, request.position + image.nodeSize, content);
  if (!canReloadNestedBlocks(tr.doc)) return null;
  return tr.setSelection(TextSelection.create(tr.doc, request.position + 1 + image.nodeSize + 1));
}

// Text formatting is valid in a caption; converting its structural type would
// detach it from the media. Refuse that before a fitting transaction can lift it.
export function selectionHasImageCaption(state) {
  let found = false;
  for (let depth = state.selection.$from.depth; depth > 0; depth--) if (state.selection.$from.node(depth).type.name === "captionedImage") return true;
  for (const { $from, $to } of state.selection.ranges) state.doc.nodesBetween($from.pos, $to.pos, node => {
    if (node.type.name === "captionedImage") { found = true; return false; }
  });
  return found;
}

export function commitInlineImageCaption(editor, request) {
  if (editor.isDestroyed || !editor.isEditable || editor.view.composing) return false;
  const tr = imageCaptionTransaction(editor.state, request);
  if (!tr) return false;
  editor.view.focus();
  editor.view.dispatch(tr);
  if (tr.docChanged) editor.view.dispatch(closeHistory(editor.state.tr));
  requestInlineCaretReveal(editor.view, { cell: true });
  return true;
}
