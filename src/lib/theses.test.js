import assert from "node:assert/strict";
import test from "node:test";
import { parseThesesMarkdown, serializeThesesMarkdown } from "./theses.js";

test("parseThesesMarkdown treats every quote block as an individual thesis", () => {
  const source = "# Тезисы\n\n> Первый тезис\n\n> Второй тезис\n> со второй строкой\n";

  assert.deepEqual(parseThesesMarkdown(source), ["Первый тезис", "Второй тезис\nсо второй строкой"]);
});

test("serializeThesesMarkdown preserves individual theses after removal and addition", () => {
  const source = serializeThesesMarkdown(["Первый тезис", "Новый\nтезис"]);

  assert.equal(source, "> Первый тезис\n\n> Новый\n> тезис\n");
  assert.deepEqual(parseThesesMarkdown(source), ["Первый тезис", "Новый\nтезис"]);
});

test("principles preserve paragraphs and literal headings when saved and reopened", () => {
  const principles = ["Держать слово.\n\nПредупреждать, если планы меняются.", "# Принципы", "# Тезисы"];
  const source = serializeThesesMarkdown(principles);

  assert.deepEqual(parseThesesMarkdown(source, "Принципы"), principles);
  assert.deepEqual(parseThesesMarkdown(`# Принципы\n\n${source}`, "Принципы"), principles);
  assert.deepEqual(parseThesesMarkdown(serializeThesesMarkdown([]), "Принципы"), []);
});
