import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { imageCaptionTransaction, commitInlineImageCaption } from "./inline-image-caption.js";
import { blockUnitPosition } from "./inline-block-selection.js";
import { selectedBlockPosition, moveTextBlock } from "./inline-blocks.js";
import { parseBlockHTML, blockHTML } from "./inline-table-markdown.js";

const extensions = inlineEditorExtensions(), schema = getSchema(extensions), manager = new MarkdownManager({ extensions });
const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const image = () => schema.nodes.image.create({ src: "/api/media/11111111-1111-4111-8111-111111111111", alt: "Accessible description", title: "Metadata title", width: "75%", height: 120, alignment: "right" });
const figure = caption => schema.nodes.captionedImage.create(null, [image(), schema.nodes.imageCaption.create(null, caption)]);
const request = (state, position) => ({ doc: state.doc, selection: state.selection, position, node: state.doc.nodeAt(position) });
const roundtrip = doc => schema.nodeFromJSON(manager.parse(manager.serialize(doc.toJSON())));

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
