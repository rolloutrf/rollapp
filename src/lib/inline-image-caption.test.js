import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { closeHistory, history, undo, redo } from "@tiptap/pm/history";
import { commitInlineImage } from "./inline-images.js";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { ImageCaption, validCaptionFigureDOM, captionImageSelectionPlugin, selectionHasImageCaption, commitInlineImageCaption } from "./inline-image-caption.js";
import { applyBlockType } from "./inline-block-types.js";
import { nextSlashSuggestion } from "./inline-slash-commands.js";
import { createFourQuestionAdapter } from "./four-question-document.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";
import { handleBlockKeyDown } from "./inline-block-selection-extension.js";
import { blockUnitPosition } from "./inline-block-selection.js";
import { selectedBlockPosition, moveTextBlock } from "./inline-blocks.js";
import { parseBlockHTML, blockHTML } from "./inline-table-markdown.js";

const extensions = inlineEditorExtensions(), schema = getSchema(extensions), manager = new MarkdownManager({ extensions });
const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const image = () => schema.nodes.image.create({ src: "/api/media/11111111-1111-4111-8111-111111111111", alt: "Accessible description", title: "Metadata title", width: "75%", height: 120, alignment: "right" });
const figure = caption => schema.nodes.captionedImage.create(null, [image(), schema.nodes.imageCaption.create(null, caption)]);
const request = (state, position) => ({ doc: state.doc, selection: state.selection, position, node: state.doc.nodeAt(position) });
const roundtrip = doc => schema.nodeFromJSON(manager.parse(manager.serialize(doc.toJSON())));

test("HTML paste cannot synthesize required image fillers from malformed caption figures", () => {
  const element = (tagName, attrs = {}, children = []) => ({ tagName, children, getAttribute: name => attrs[name] ?? null });
  const img = element("IMG", { src: "/image.png" }), caption = element("FIGCAPTION");
  assert(validCaptionFigureDOM(element("FIGURE", { "data-type": "captionedImage" }, [img, caption])));
  for (const children of [[caption], [caption, img], [img], [img, caption, caption], [element("IMG", { src: "javascript:alert(1)" }), caption]]) assert.equal(validCaptionFigureDOM(element("FIGURE", { "data-type": "captionedImage" }, children)), false);
});

test("editing selected figure image metadata preserves caption and normalized selection with one Undo", () => {
  const doc = schema.nodes.doc.create(null, [figure(schema.text("Keep caption")), p("After")]);
  let state = EditorState.create({ schema, doc, selection: NodeSelection.create(doc, 0), plugins: [captionImageSelectionPlugin(), history()] });
  const editor = { schema, isEditable: true, isDestroyed: false, get state() { return state; }, view: { composing: false, focus() {}, dispatch(tr) { state = state.applyTransaction(tr).state; } }, chain() { let command; return { command(fn) { command = fn; return this; }, run() { const tr = state.tr, result = command({ tr, state }); if (result && !tr.getMeta("preventDispatch")) editor.view.dispatch(tr); return result; } }; } };
  assert(commitInlineImage(editor, { doc, selection: state.selection }, { src: doc.firstChild.firstChild.attrs.src, alt: "Updated" }));
  assert.equal(state.doc.firstChild.firstChild.attrs.alt, "Updated");
  assert.equal(state.doc.firstChild.lastChild, doc.firstChild.lastChild);
  assert.equal(state.selection.node.type.name, "captionedImage");
  assert(undo(state, editor.view.dispatch)); assert(state.doc.eq(doc));
});

test("native child image selection owns the entire caption figure for Cut/Delete and exact Undo", () => {
  for (const tail of [[], [p("After")]]) {
    const doc = schema.nodes.doc.create(null, [figure(schema.text("Caption", [schema.marks.bold.create()])), ...tail]);
    let state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 3), plugins: [captionImageSelectionPlugin(), history()] });
    const dispatch = tr => { state = state.applyTransaction(tr).state; };
    dispatch(state.tr.setSelection(NodeSelection.create(doc, 1)));
    assert.equal(state.doc, doc); assert.equal(state.selection.from, 0); assert.equal(state.selection.node.type.name, "captionedImage");
    assert.equal(undo(state, dispatch), false, "Selection normalization is not a history edit");
    dispatch(closeHistory(state.tr).deleteSelection()); state.doc.check();
    assert.equal(state.doc.firstChild.type.name, "paragraph");
    assert.equal(state.doc.firstChild.textContent, tail.length ? "After" : "");
    assert(undo(state, dispatch)); assert(state.doc.eq(doc)); assert(roundtrip(state.doc).eq(doc));
  }
});

test("caption text refuses structural conversion and typed slash commands without losing image", () => {
  const doc = schema.nodes.doc.create(null, [figure(), p("After")]);
  let state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 3) });
  assert(selectionHasImageCaption(state));
  assert.equal(applyBlockType({ isEditable: true, state }, "heading1"), false);
  const tr = state.tr.insertText("/delete"); state = state.apply(tr);
  assert.equal(nextSlashSuggestion(state, tr, null), null);
  assert.equal(state.doc.firstChild.lastChild.textContent, "/delete");
  assert.equal(state.doc.firstChild.firstChild, doc.firstChild.firstChild);
});

test("caption boundary keys retain image, metadata and existing neighbouring text", () => {
  const doc = schema.nodes.doc.create(null, [figure(schema.text("Caption")), p("After")]);
  let state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 3) });
  const editor = { isEditable: true, get state() { return state; }, view: { composing: false, dispatch(tr) { state = state.apply(tr); } }, commands: { setNodeSelection(pos) { state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, pos))); return true; } } };
  const keys = ImageCaption.config.addKeyboardShortcuts.call({ editor, name: "imageCaption" });
  assert(keys.Backspace()); assert.equal(state.selection.from, 0); assert.equal(state.doc, doc);
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
  assert(keys.Enter()); assert.equal(state.doc.child(1).textContent, ""); assert.equal(state.doc.lastChild.textContent, "After"); assert.equal(state.selection.$from.parent, state.doc.child(1));
  state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 3) });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
  assert(keys.Escape()); assert.equal(state.selection.from, 0); assert.equal(state.doc, doc);
  for (const blocked of ["readOnly", "composing", "destroyed"]) {
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
    editor.isEditable = blocked !== "readOnly"; editor.view.composing = blocked === "composing"; editor.isDestroyed = blocked === "destroyed";
    for (const key of ["Backspace", "Enter", "Escape"]) assert.equal(keys[key](), false, blocked);
    assert.equal(state.doc, doc);
  }
});

test("Backspace at a nested caption start delegates to caption selection instead of lifting the figure", () => {
  const doc = schema.nodes.doc.create(null, schema.nodes.nestedBlock.create(null, [p("Parent"), figure(), p("Child")]));
  let pos; doc.descendants((node, at) => { if (node.type.name === "imageCaption") pos = at + 1; });
  const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, pos) });
  const editor = { isEditable: true, state, view: { composing: false, dispatch() { assert.fail("Caption Backspace must not lift its parent"); } } };
  assert.equal(handleBlockKeyDown(editor, { key: "Backspace" }), false);
  assert.equal(editor.state.doc, doc);
});

test("rich caption roundtrips through the four-answer adapter without touching fixed prompts", () => {
  const adapter = createFourQuestionAdapter("caption-test"), current = { questions: IDENTITY_QUESTION_TITLES.map(title => ({ title, paragraphs: ["Untouched"] })) };
  const questionSchema = getSchema(inlineEditorExtensions("", adapter.documentExtension).concat(adapter.extensions)), parsed = adapter.parse(current);
  parsed.content[1].content = [figure(schema.text(" Caption ", [schema.marks.bold.create()])).toJSON()];
  const doc = questionSchema.nodeFromJSON(parsed); doc.check();
  const saved = adapter.serialize(doc), loaded = questionSchema.nodeFromJSON(adapter.parse(saved));
  assert(loaded.eq(doc));
  for (const index of [0,2,3]) assert.deepEqual(saved.questions[index], current.questions[index]);
  assert.deepEqual(saved.questions.map(q => q.title), IDENTITY_QUESTION_TITLES);
});

test("caption storage preserves every marked edge space, newline, metadata and typed image dimensions", () => {
  const runs = [schema.text("  Bold ", [schema.marks.bold.create()]), schema.text("italic ", [schema.marks.italic.create()]), schema.nodes.hardBreak.create(), schema.text("literal ++ <caption> ", [schema.marks.normalText.create(), schema.marks.inlineStyle.create({ color: "red", background: "blue" })]), schema.text("link ", [schema.marks.link.create({ href: "https://example.com/caption", title: 'Quoted "title"' })])];
  const doc = schema.nodes.doc.create(null, [p("Before"), figure(runs), p("After")]);
  doc.check(); const loaded = roundtrip(doc); loaded.check();
  assert(loaded.eq(doc), JSON.stringify(loaded.toJSON()));
  assert.match(manager.serialize(doc.toJSON()), /<figure data-type="captionedImage">/);
  assert.equal(loaded.child(1).firstChild.attrs.alt, "Accessible description");
  assert.equal(loaded.child(1).lastChild.textContent, "  Bold italic literal ++ <caption> link ");
});

test("empty captions and captions nested in columns, tables, lists and toggles reload canonically", () => {
  const media = figure();
  const wrappers = [media,
    schema.nodes.nestedBlock.create(null, [media, p("Child")]),
    schema.nodes.column.create(null, media),
    schema.nodes.table.create(null, schema.nodes.tableRow.create(null, schema.nodes.tableCell.create(null, [media, p("Cell")]))),
    schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, [p("Item"), media])),
    schema.nodes.details.create(null, [schema.nodes.detailsSummary.create(null, schema.text("Summary")), schema.nodes.detailsContent.create(null, media)]),
  ];
  for (const wrapper of wrappers) {
    const content = wrapper.type.name === "column" ? schema.nodes.columns.create(null, [wrapper, schema.nodes.column.create(null, p("Peer"))]) : wrapper;
    const doc = schema.nodes.doc.create(null, [content, p("After")]);
    doc.check(); const loaded = roundtrip(doc); loaded.check(); assert(loaded.eq(doc), wrapper.type.name);
  }
});

test("malformed caption markup cannot create orphan captions, reordered children or nested blocks", () => {
  for (const body of ['<figcaption>orphan</figcaption>', '<figure data-type="captionedImage"><figcaption>x</figcaption><img src="/a"/></figure>', '<figure data-type="captionedImage"><img src="/a"/><figcaption><p>block</p></figcaption></figure>', '<figure data-type="captionedImage"><img src="/a"/></figure>']) {
    assert.throws(() => parseBlockHTML(`<div data-inline-block="true">${body}</div>`));
  }
  assert.equal(schema.nodes.doc.validContent(figure().lastChild.content), false);
});

test("caption creation, typing and reopening share one document with separate Undo boundaries", () => {
  const doc = schema.nodes.doc.create(null, [image(), p("Neighbour")]);
  let state = EditorState.create({ schema, doc, selection: NodeSelection.create(doc, 0), plugins: [history()] });
  const dispatch = tr => { state = state.apply(tr); };
  const editor = { isEditable: true, isDestroyed: false, get state() { return state; }, view: { composing: false, focus() {}, dispatch } };
  assert(commitInlineImageCaption(editor, request(state, 0)));
  const created = state.doc; created.check(); assert.equal(state.selection.$from.parent.type.name, "imageCaption");
  assert.equal(created.firstChild.firstChild, doc.firstChild);
  dispatch(state.tr.insertText("Caption")); const typed = state.doc;
  assert(undo(state, dispatch)); assert(state.doc.eq(created));
  assert(undo(state, dispatch)); assert(state.doc.eq(doc));
  assert(redo(state, dispatch)); assert(redo(state, dispatch)); assert(state.doc.eq(typed));
  dispatch(state.tr.setSelection(NodeSelection.create(state.doc, 1)));
  const beforeReopen = state.doc;
  assert(commitInlineImageCaption(editor, request(state, 1)));
  assert.equal(state.doc, beforeReopen, "Reopening does not rewrite content");
  assert.equal(state.selection.$from.parent.type.name, "imageCaption");
});

test("caption commands reject changed source/selection/node, composing and read-only owners", () => {
  const doc = schema.nodes.doc.create(null, [image(), p("Keep")]);
  for (const reason of ["source", "selection", "node", "composing", "readonly", "destroyed"]) {
    let state = EditorState.create({ schema, doc, selection: NodeSelection.create(doc, 0) });
    const value = request(state, 0);
    if (reason === "source") state = state.apply(state.tr.insertText("Changed", 3));
    if (reason === "selection") state = state.apply(state.tr.setSelection(TextSelection.create(doc, 3)));
    if (reason === "node") value.node = image();
    const before = state.doc;
    const editor = { get state() { return state; }, isEditable: reason !== "readonly", isDestroyed: reason === "destroyed", view: { composing: reason === "composing", focus() { assert.fail("stale focus"); }, dispatch() { assert.fail("stale mutation"); } } };
    assert.equal(commitInlineImageCaption(editor, value), false, reason); assert.equal(state.doc, before);
  }
});

test("image and caption form one block movement/selection unit and retain exact canonical storage", () => {
  const doc = schema.nodes.doc.create(null, [p("Before"), figure(schema.text("Caption")), p("After")]);
  const pos = doc.firstChild.nodeSize;
  for (const offset of [1, 2]) assert.equal(blockUnitPosition(doc, pos + offset), pos);
  let state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, pos + 3), plugins: [history()] });
  assert.equal(selectedBlockPosition(state.selection), pos);
  const editor = { isEditable: true, get state() { return state; }, view: { dispatch(tr) { state = state.apply(tr); } }, commands: { focus() {} } };
  assert(moveTextBlock(editor, pos, -1));
  assert.equal(state.doc.firstChild.type.name, "captionedImage"); assert(roundtrip(state.doc).eq(state.doc));
  assert(undo(state, editor.view.dispatch)); assert(state.doc.eq(doc));
  assert.deepEqual(parseBlockHTML(blockHTML(figure(schema.text("Caption")).toJSON())).content.map(n => n.type), ["image", "imageCaption"]);
});
