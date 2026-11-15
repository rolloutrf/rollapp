import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { filterSlashCommands, nextSlashSuggestion } from "./inline-slash-commands.js";

const schema = getSchema(inlineEditorExtensions());
function setup(text = "Мысль ", type = "paragraph", marks) {
  const node = schema.nodes[type].create(null, text ? schema.text(text, marks) : null);
  let state = EditorState.create({ schema, plugins: [history()], doc: schema.nodes.doc.create(null, node) });
  state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
  let suggestion = null;
  return { get state() { return state; }, get suggestion() { return suggestion; }, dismiss() { suggestion = null; }, dispatch(tr, options) { state = state.apply(tr); suggestion = nextSlashSuggestion(state, tr, suggestion, options); }, type(text, meta) { const tr = state.tr.insertText(text); if (meta) for (const [key,value] of Object.entries(meta)) tr.setMeta(key,value); this.dispatch(tr); } };
}

test("slash suggestions track an actual new trigger in existing text and map across edits", () => {
  const f = setup(); f.type("/");
  assert.equal(f.suggestion.from, 7); assert.equal(f.suggestion.query, "");
  f.type("h2"); assert.equal(f.suggestion.query, "h2"); assert.deepEqual(f.suggestion.items.map(x => x.id), ["heading2"]);
  const before = f.suggestion;
  f.dispatch(f.state.tr.setMeta("menu", "show")); assert.equal(f.suggestion, before, "Metadata must not trigger a React render loop");
  f.dispatch(f.state.tr.insertText("До ", 1)); assert.equal(f.suggestion.from, 10); assert.equal(f.suggestion.query, "h2");
  f.dispatch(f.state.tr.setSelection(TextSelection.create(f.state.doc, f.suggestion.from + 2)));
  assert.equal(f.suggestion.query, "h2", "Moving inside a query preserves its full replacement range");
  f.dispatch(f.state.tr.setSelection(TextSelection.create(f.state.doc, 1))); assert.equal(f.suggestion, null);
});

test("dismissed, loaded, pasted and history-restored slash text cannot reopen a menu", () => {
  const f = setup(); f.type("/du"); assert(f.suggestion); f.dismiss(); f.type("plicate"); assert.equal(f.suggestion, null);
  f.type(" /delete"); assert.equal(f.suggestion.query, "delete");
  for (const meta of [{uiEvent:"paste"},{paste:true},{uiEvent:"drop"},{preventUpdate:false}]) { const g=setup(); g.type("/delete",meta); assert.equal(g.suggestion,null); }
  const loaded=setup("/delete"); loaded.type("x"); assert.equal(loaded.suggestion,null);
  const g=setup(); g.type("/h2"); assert(g.suggestion);
  assert(undo(g.state,tr=>g.dispatch(tr))); assert.equal(g.suggestion,null);
  assert(redo(g.state,tr=>g.dispatch(tr))); assert.equal(g.suggestion,null);
  g.type("x"); assert.equal(g.suggestion,null);
});

test("paths, URLs, inline code, code blocks, links, read-only and IME stay literal", () => {
  for (const prefix of ["https:", "file", "a/", "", "行 "]) {
    const f=setup(prefix);f.type("/h2"); assert.equal(Boolean(f.suggestion), prefix === "" || prefix === "行 ",prefix);
  }
  for (const [type,marks] of [["codeBlock",undefined],["paragraph",[schema.marks.code.create()]],["paragraph",[schema.marks.link.create({href:"https://example.com"})]]]) { const f=setup("Код ",type,marks); f.type("/h2"); assert.equal(f.suggestion,null); }
  for (const options of [{editable:false},{composing:true}]) { const f=setup();f.dispatch(f.state.tr.insertText("/h2"),options);assert.equal(f.suggestion,null); }
});

test("new slashes after dismissal work; deleting the trigger or making a range closes it", () => {
  const f=setup();f.type("/h2"); f.dispatch(f.state.tr.delete(f.suggestion.from,f.suggestion.to)); assert.equal(f.suggestion,null);
  f.type("/delete"); assert(f.suggestion);
  f.dispatch(f.state.tr.setSelection(TextSelection.create(f.state.doc,f.suggestion.from,f.suggestion.to))); assert.equal(f.suggestion,null);
  assert.deepEqual(filterSlashCommands("duplicate").map(x=>x.id),["duplicate"]);
  assert.deepEqual(filterSlashCommands("удалить").map(x=>x.id),["delete"]);
  assert.deepEqual(filterSlashCommands("несуществующая команда"),[]);
  const g=setup();
  g.dispatch(g.state.tr.replaceSelectionWith(schema.nodes.hardBreak.create()));
  g.type("/h2"); assert.equal(g.suggestion.query,"h2","A slash after Shift+Enter is at the start of a visual line");
});
