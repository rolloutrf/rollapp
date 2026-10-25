import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { inlinePlaceholderDecorations } from "./inline-placeholder.js";

const schema = getSchema(inlineEditorExtensions());
const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const options = { placeholder: ({ node }) => node.type.name === "imageCaption" ? "Caption" : "Hint", emptyNodeClass: "is-empty", emptyEditorClass: "is-editor-empty" };
const editor = { isEditable: true, isEmpty: false };

test("placeholder retires every previous empty block on selection-only changes", () => {
  const doc = schema.nodes.doc.create(null, [p(), p(), p("Text")]);
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
  for (const [position, expected] of [[1, [0]], [3, [2]], [6, []], [1, [0]]]) {
    state = state.apply(state.tr.setSelection(TextSelection.create(doc, position)));
    assert.deepEqual(inlinePlaceholderDecorations(state, editor, options).find().map(d => d.from), expected);
    assert.equal(state.doc, doc);
  }
});

test("nested cell/list/column/caption hints decorate only their own empty textblock", () => {
  const wrap = child => schema.nodes.doc.create(null, child);
  const documents = [
    wrap(schema.nodes.blockquote.create(null, p())),
    wrap(schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, p()))),
    wrap(schema.nodes.table.create(null, schema.nodes.tableRow.create(null, schema.nodes.tableCell.create(null, p())))),
    wrap(schema.nodes.columns.create(null, [schema.nodes.column.create(null, p()), schema.nodes.column.create(null, p("Other"))])),
    wrap(schema.nodes.captionedImage.create(null, [schema.nodes.image.create({ src: "/image.png", alt: "Original" }), schema.nodes.imageCaption.create()])),
  ];
  for (const doc of documents) {
    let position, node;
    doc.descendants((current, pos) => { if (position == null && current.isTextblock) { position = pos; node = current; } });
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, position + 1) });
    const decorations = inlinePlaceholderDecorations(state, editor, options).find();
    assert.equal(decorations.length, 1);
    assert.equal(decorations[0].from, position);
    assert.equal(decorations[0].to, position + node.nodeSize);
    assert.equal(decorations[0].type.attrs["data-placeholder"], node.type.name === "imageCaption" ? "Caption" : "Hint");
    assert.equal(state.doc, doc);
  }
});

test("read-only, node/range selections and nonempty blocks never show hints", () => {
  const doc = schema.nodes.doc.create(null, [p(), p("Text")]);
  for (const selection of [NodeSelection.create(doc, 0), TextSelection.create(doc, 1, 4), TextSelection.create(doc, 4)]) {
    assert.equal(inlinePlaceholderDecorations(EditorState.create({ doc, selection }), editor, options).find().length, 0);
  }
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
  assert.equal(inlinePlaceholderDecorations(state, { ...editor, isEditable: false }, options).find().length, 0);
  assert.equal(inlinePlaceholderDecorations(state, { ...editor, isEmpty: true }, options).find()[0].type.attrs.class, "is-empty is-editor-empty");
});
