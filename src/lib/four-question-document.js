import { Extension, Node, getSchema, getTextBetween, getTextSerializersFromSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import { Fragment, Slice } from "@tiptap/pm/model";
import { AllSelection, Plugin, Selection } from "@tiptap/pm/state";
import { closeHistory, undo } from "@tiptap/pm/history";
import { MarkdownManager } from "@tiptap/markdown";
import { Marked } from "marked";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";
import { isBlockSelection, prepareBlockComposition } from "./inline-block-selection.js";
import { synchronizeInlineSelection } from "./inline-native-selection.js";

const bodyExtensions = inlineEditorExtensions();
const bodySchema = getSchema(bodyExtensions);
const markdown = new MarkdownManager({ extensions: bodyExtensions, marked: new Marked() });
const empty = () => ({ type: "paragraph" });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sectionName = "questionSection";

export function questionScopes(doc) {
  const scopes = [];
  doc.forEach((node, pos) => scopes.push({ node, pos, from: pos + 1, to: pos + node.nodeSize - 1 }));
  return scopes;
}

export function validQuestionDocument(doc) {
  return doc.childCount === IDENTITY_QUESTION_TITLES.length && doc.content.content.every((node, index) => node.type.name === sectionName && node.attrs.index === index);
}

export function selectedQuestionScopes(state, from, to) {
  const ranges = from == null && isBlockSelection(state.selection) ? state.selection.ranges.map(range => [range.$from.pos, range.$to.pos]) : [[from ?? state.selection.from, to ?? state.selection.to]];
  return questionScopes(state.doc).filter(scope => ranges.some(([start, end]) => end > scope.from && start < scope.to));
}

// Delete inside each answer, never the immutable prompts between answers.
// ProseMirror fits each individual body edit, including lists/tables/toggles.
export function deleteQuestionRange(state, tr = state.tr, from, to) {
  if (from == null && isBlockSelection(state.selection)) { state.selection.replace(tr); return tr; }
  from ??= state.selection.from; to ??= state.selection.to;
  const scopes = selectedQuestionScopes(state, from, to);
  for (const scope of [...scopes].reverse()) {
    const start = Math.max(from, scope.from), end = Math.min(to, scope.to);
    if (end > start) tr.deleteRange(start, end);
  }
  const cursor = tr.mapping.map(Math.max(from, scopes[0]?.from || 0), -1);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(cursor, tr.doc.content.size)), 1));
  return tr;
}

export function copiedQuestionSlice(slice, state) {
  if (!slice.content.content.some(node => node.type.name === sectionName)) return slice;
  const scopes = questionScopes(state.doc);
  const nodes = [];
  slice.content.forEach(node => {
    if (node.type.name !== sectionName) { nodes.push(node); return; }
    if (!isBlockSelection(state.selection) && state.selection.from <= scopes[node.attrs.index].pos) nodes.push(state.schema.nodes.heading.create({ level: 3 }, state.schema.text(IDENTITY_QUESTION_TITLES[node.attrs.index])));
    node.content.forEach(child => nodes.push(child));
  });
  return new Slice(Fragment.fromArray(nodes), Math.max(0, slice.openStart - 1), Math.max(0, slice.openEnd - 1));
}

function crossAnswerPaste(editor, view, event, slice) {
  if (selectedQuestionScopes(view.state).length < 2 || !event.clipboardData) return false;
  const text = event.clipboardData.getData("text/plain"), html = event.clipboardData.getData("text/html");
  let tr = deleteQuestionRange(view.state, closeHistory(view.state.tr));
  const code = view.state.schema.marks.code?.isInSet(tr.selection.$from.marks());
  if (text && (code || tr.selection.$from.parent.type.spec.code)) tr.insertText(text.replace(/\r\n?/g, "\n"));
  else {
    if (!html && /(^|\n)(#{1,6} |[-*+] |\d+\. |> |```)|\[[^\]]+\]\(https?:\/\//.test(text)) {
      const content = markdown.parse(text).content || [];
      slice = new Slice(Fragment.fromArray(content.map(node => view.state.schema.nodeFromJSON(node))), 0, 0);
    }
    tr.replaceSelection(slice).setMeta("uiEvent", "paste");
  }
  event.preventDefault();
  view.dispatch(tr.setMeta("paste", true).scrollIntoView());
  view.dispatch(closeHistory(view.state.tr));
  return true;
}

export function questionClipboardText(slice, state) {
  const options = { textSerializers: getTextSerializersFromSchema(state.schema) };
  // Keep native range/cell semantics within one answer. A rectangular slice
  // contains structural wrappers and cannot express per-cell text boundaries.
  if (selectedQuestionScopes(state).length < 2) return [...state.selection.ranges]
    .sort((a, b) => a.$from.pos - b.$from.pos)
    .map(({ $from, $to }) => getTextBetween(state.doc, { from: $from.pos, to: $to.pos }, options)).join("\n\n");
  // Cross-answer copying flattened the protected sections above. Start/end at
  // the actual open boundaries so list/table ancestors add no leading padding.
  // Do not trim text: literal whitespace inside the selected code is authored.
  return getTextBetween(state.schema.nodes.doc.create(null, slice.content), { from: slice.openStart, to: slice.content.size - slice.openEnd }, options);
}

const ProtectedQuestions = Extension.create({
  name: "protectedQuestions", priority: 1300,
  addProseMirrorPlugins() {
    let composition = null;
    return [new Plugin({
      filterTransaction: tr => !tr.docChanged || validQuestionDocument(tr.doc),
      props: {
        transformCopied: (slice, view) => copiedQuestionSlice(slice, view.state),
        clipboardTextSerializer: (slice, view) => questionClipboardText(slice, view.state),
        handleDOMEvents: {
          beforeinput(view, event) {
            if (!view.editable || event.isComposing || view.composing || !event.cancelable) return false;
            synchronizeInlineSelection(view);
            if (selectedQuestionScopes(view.state).length < 2) return false;
            const typing = ["insertText", "insertReplacementText"].includes(event.inputType) && typeof event.data === "string";
            if (!typing && !event.inputType?.startsWith("delete")) return false;
            const tr = closeHistory(view.state.tr);
            if (typing && event.data && isBlockSelection(view.state.selection)) tr.replaceSelectionWith(view.state.schema.text(event.data));
            else { deleteQuestionRange(view.state, tr); if (typing) tr.insertText(event.data); }
            event.preventDefault();
            view.dispatch(tr.scrollIntoView());
            if (!typing) view.dispatch(closeHistory(view.state.tr));
            return true;
          },
          compositionstart(view) {
            if (view.editable && selectedQuestionScopes(view.state).length > 1) {
              const tr = (isBlockSelection(view.state.selection) ? prepareBlockComposition(closeHistory(view.state.tr)) : deleteQuestionRange(view.state, closeHistory(view.state.tr))).setMeta("preventUpdate", true);
              view.dispatch(tr);
              composition = { after: tr.doc };
            }
            return false;
          },
          compositionend(view, event) {
            if (composition && !event.data && view.state.doc.eq(composition.after)) undo(view.state, tr => view.dispatch(tr.setMeta("preventUpdate", true)));
            composition = null;
            return false;
          },
          cut(view, event) {
            if (!view.editable || selectedQuestionScopes(view.state).length < 2 || !event.clipboardData) return false;
            const copied = view.serializeForClipboard(view.state.selection.content());
            event.clipboardData.clearData();
            event.clipboardData.setData("text/html", copied.dom.innerHTML);
            event.clipboardData.setData("text/plain", copied.text);
            event.preventDefault();
            view.dispatch(deleteQuestionRange(view.state, closeHistory(view.state.tr)).scrollIntoView());
            view.dispatch(closeHistory(view.state.tr));
            return true;
          },
        },
        handleTextInput(view, from, to, text) {
          if (!view.editable || selectedQuestionScopes(view.state, from, to).length < 2) return false;
          view.dispatch(deleteQuestionRange(view.state, closeHistory(view.state.tr), from, to).insertText(text).scrollIntoView());
          return true;
        },
        handleKeyDown(view, event) {
          if (!view.editable || event.isComposing || view.composing) return false;
          if (view.state.selection instanceof AllSelection && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            const selection = ["ArrowLeft", "ArrowUp"].includes(event.key) ? Selection.atStart(view.state.doc) : Selection.atEnd(view.state.doc);
            view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
            return true;
          }
          if (!isBlockSelection(view.state.selection) && selectedQuestionScopes(view.state).length > 1 && ["Backspace", "Delete", "Enter"].includes(event.key)) {
            view.dispatch(deleteQuestionRange(view.state, closeHistory(view.state.tr)).scrollIntoView());
            if (event.key === "Enter") return false;
            view.dispatch(closeHistory(view.state.tr));
            return true;
          }
          return false;
        },
      },
    })];
  },
});

export function createFourQuestionAdapter(prefix = "four-question") {
  let baseline = [];
  const QuestionSection = Node.create({
    name: sectionName, content: "block+", defining: true, isolating: true, selectable: false, draggable: false,
    addAttributes: () => ({ index: { default: 0 } }),
    parseHTML: () => [{ tag: "section[data-question-index]", contentElement: "[data-question-body]", getAttrs: el => ({ index: Number(el.dataset.questionIndex) }) }],
    renderHTML: ({ node }) => ["section", { "data-question-index": node.attrs.index, class: "four-question typeset-document", "aria-labelledby": `${prefix}-${node.attrs.index}` },
      ["h3", { id: `${prefix}-${node.attrs.index}`, contenteditable: "false" }, IDENTITY_QUESTION_TITLES[node.attrs.index]],
      ["div", { "data-question-body": node.attrs.index, "data-typeset-group": "" }, 0]],
    renderMarkdown: (node, helpers) => `### ${IDENTITY_QUESTION_TITLES[node.attrs.index]}\n\n${helpers.renderChildren(node.content)}`,
  });
  return {
    documentExtension: Document.extend({ content: "questionSection{4}" }),
    extensions: [QuestionSection, ProtectedQuestions],
    parse(value) {
      baseline = IDENTITY_QUESTION_TITLES.map((title, index) => {
        const paragraphs = value.questions[index]?.paragraphs || [];
        const parsed = markdown.parse(paragraphs.join("\n\n"));
        if (!parsed.content?.length) parsed.content = [empty()];
        const content = bodySchema.nodeFromJSON(parsed).toJSON().content;
        return { paragraphs, content };
      });
      return { type: "doc", content: baseline.map((entry, index) => ({ type: sectionName, attrs: { index }, content: entry.content })) };
    },
    serialize(doc) {
      if (!validQuestionDocument(doc)) throw new Error("Нарушена структура четырёх ответов");
      return { questions: IDENTITY_QUESTION_TITLES.map((title, index) => {
        const content = doc.child(index).content.toJSON();
        const source = same(content, baseline[index].content) ? null : markdown.serialize({ type: "doc", content });
        const paragraphs = source === null ? baseline[index].paragraphs : source ? source.split(/\n\n/) : [];
        // The API array is a legacy storage shape, not an editor block limit.
        // One Markdown entry preserves all separators, including code/tables.
        return { title, paragraphs: paragraphs.length > 30 && source !== null ? [source] : paragraphs };
      }) };
    },
    handlePaste: crossAnswerPaste,
  };
}
