import assert from "node:assert/strict";
import test from "node:test";
import { captureImageViewer, ownsImageViewer } from "./inline-image-viewer.js";

function fixture(editable = true) {
  const node = { type: { name: "image" }, attrs: { src: "/image.png", alt: "Description", title: "Metadata", width: 120, height: 60 } };
  const image = { isConnected: true, getAttribute: () => node.attrs.src };
  const doc = { nodeAt: () => node }, selection = { eq: other => other === selection };
  const editor = { isInitialized: true, isDestroyed: false, isEditable: editable, state: { doc, selection }, view: { composing: false, dom: { contains: element => element === image }, posAtDOM: () => 3, nodeDOM: () => image } };
  return { editor, image, node };
}

test("image viewing captures editable and public reader owners without state/history writes", () => {
  for (const editable of [true, false]) {
    const { editor, image, node } = fixture(editable), state = editor.state;
    const attributes = JSON.stringify(node.attrs);
    const request = captureImageViewer(editor, image);
    assert(request); assert.equal(request.editable, editable);
    assert(ownsImageViewer(editor, request));
    assert.equal(editor.state, state); assert.equal(JSON.stringify(node.attrs), attributes);
  }
});

test("viewer fails closed on editor, source, selection, access, IME and lifecycle changes", () => {
  const mutations = [
    f => { f.editor.isDestroyed = true; },
    f => { f.editor.isInitialized = false; },
    f => { f.editor.isEditable = false; },
    f => { f.editor.view.composing = true; },
    f => { f.image.isConnected = false; },
    f => { f.editor.state = { ...f.editor.state, doc: { nodeAt: () => f.node } }; },
    f => { f.editor.state = { ...f.editor.state, selection: { eq: () => false } }; },
    f => { f.editor.view.nodeDOM = () => ({}); },
    f => { f.image.getAttribute = () => "/different.png"; },
    f => { f.editor.view.posAtDOM = () => { throw Error("Detached"); }; },
  ];
  for (const mutate of mutations) {
    const f = fixture(), request = captureImageViewer(f.editor, f.image);
    mutate(f); assert.equal(ownsImageViewer(f.editor, request), false);
  }
  const f = fixture(), request = captureImageViewer(f.editor, f.image);
  assert.equal(ownsImageViewer({ ...f.editor }, request), false, "Another editor cannot own this viewer");
});

test("viewer refuses unsafe/non-model images and permits authenticated relative sources", () => {
  for (const src of ["javascript:alert(1)", "data:image/svg+xml,x", "//foreign/image.png", "https://user:pass@example.com/image.png", ""]) {
    const f = fixture(); f.node.attrs.src = src;
    assert.equal(captureImageViewer(f.editor, f.image), null);
  }
  const f = fixture(); f.node.type.name = "paragraph";
  assert.equal(captureImageViewer(f.editor, f.image), null);
  f.node.type.name = "image"; f.node.attrs.src = "/api/media/owner-image";
  assert(captureImageViewer(f.editor, f.image));
});
