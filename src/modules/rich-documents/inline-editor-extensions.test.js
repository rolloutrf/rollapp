import assert from "node:assert/strict";
import test from "node:test";
import { MarkdownManager } from "@tiptap/markdown";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { getSchema } from "@tiptap/core";
import { createBlockNode } from "./inline-block-types.js";

const manager = () => new MarkdownManager({ extensions: inlineEditorExtensions() });
// Markdown moves whitespace outside marks. Compare each visible character's
// marks and all block structure, without depending on text-node segmentation.
const semantics = node => node.type === "text"
  ? [...node.text].map(character => ({ character, marks: /\s/.test(character) ? [] : node.marks || [] }))
  : [{ type: node.type, attrs: node.attrs, content: (node.content || []).flatMap(semantics) }];
const textOf = node => [node.text || "", ...(node.content || []).map(textOf)].join("");

test("editor preserves representative documents through Markdown round trips without private fixtures", () => {
  const documents = {
    about: "### Вопрос\n\nОтвет с **выделением** и [ссылкой](https://example.com).\n\n### Второй вопрос\n\nДва абзаца.\n\nПоследний абзац.",
    mission: "# Миссия\n\n:::label Ориентир\n\n:::statement Завершённая мысль\n\n- Первая практика\n- Вторая практика",
    domain: "## Область\n\n1. Первый шаг\n2. Второй шаг\n   - Вложенная практика\n\n---\n\nСледующий раздел.",
    strategy: "# 35 y.o.\n\n## Планы\n\n- [ ] Запланировано\n- [x] Завершено\n\n# 40 y.o.\n\nБудущий период.",
    theses: "> Первая мысль.\n\n> Вторая мысль с *акцентом*.\n\nОбычный абзац после цитат.",
  };
  for (const [file, source] of Object.entries(documents)) {
    const markdown = manager();
    // Compare actual editor documents: the schema supplies default mark attrs
    // that a legacy Markdown parse can omit. Keep every explicit attribute.
    const schema = getSchema(inlineEditorExtensions());
    const original = schema.nodeFromJSON(markdown.parse(source)).toJSON();
    const result = schema.nodeFromJSON(markdown.parse(markdown.serialize(original))).toJSON();
    assert.equal(textOf(result), textOf(original), `${file}: text must survive editing`);
    assert.deepEqual(semantics(result), semantics(original), `${file}: formatting must survive editing`);
  }
});

test("editor round trips headings, tasks, nested lists, links, images, tables and semantic roles", () => {
  const markdown = manager();
  const source = '# Заголовок\n\n:::label Метка\n\n:::statement Важная мысль\n\n**Жирный**, *курсив* и [ссылка](https://example.com)\n\n- [x] Готово\n- [ ] Сделать\n\n1. Первый\n   - Вложенный\n\n> Цитата\n\n![Фото](https://example.com/image.png)\n\n| Один | Два |\n| --- | --- |\n| A | B |\n\n```js\nconst value = 1;\n```';
  const original = markdown.parse(source);
  assert.deepEqual(markdown.parse(markdown.serialize(original)), original);
});

test("collapsible blocks round trip nested rich content and their open state", () => {
  const markdown = manager();
  const schema = getSchema(inlineEditorExtensions());
  const paragraph = text => schema.nodes.paragraph.create(null, schema.text(text));
  const nested = createBlockNode(schema, "details");
  const details = schema.nodes.details.create({ open: true }, [
    schema.nodes.detailsSummary.create(null, schema.text("Подробности")),
    schema.nodes.detailsContent.create(null, [paragraph("Внутри"), nested,
      schema.nodes.typographyBlock.create({ role: "statement" }, schema.text("Важная мысль")),
      schema.nodes.codeBlock.create({ language: "md" }, schema.text(":::details\n:::")),
      schema.nodes.taskList.create(null, schema.nodes.taskItem.create({ checked: true }, paragraph("Готово")))]),
  ]);
  const original = schema.nodes.doc.create(null, details).toJSON();
  const serialized = markdown.serialize(original);
  const restored = schema.nodeFromJSON(markdown.parse(serialized));
  restored.check();
  assert.deepEqual(restored.toJSON(), original);
});


test("newly created tables and alphabetical/roman lists retain their structure through Markdown", () => {
  const markdown = manager();
  const schema = getSchema(inlineEditorExtensions());
  const p = text => schema.nodes.paragraph.create(null, schema.text(text));
  for (const type of ["a", "i"]) {
    const list = schema.nodes.orderedList.create({ type, start: 1 }, [schema.nodes.listItem.create(null, p("Первый")), schema.nodes.listItem.create(null, p("Второй"))]);
    const doc = schema.nodes.doc.create(null, list).toJSON();
    const restored = schema.nodeFromJSON(markdown.parse(markdown.serialize(doc)));
    restored.check();
    assert.deepEqual(restored.toJSON(), doc);
  }
  const table = schema.nodes.doc.create(null, createBlockNode(schema, "table")).toJSON();
  const restored = schema.nodeFromJSON(markdown.parse(markdown.serialize(table)));
  restored.check();
  assert.deepEqual(restored.toJSON(), table);
});
