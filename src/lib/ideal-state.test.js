import assert from "node:assert/strict";
import { test } from "node:test";
import { idealStateTopics, appendIdealStateItem } from "./ideal-state.js";

test("adding a point preserves other topics and formatted source content", () => {
  const source = "## Семья\n- **Первый** пункт\n\n## Самоощущение\n- Второй пункт\n";
  assert.deepEqual(idealStateTopics(source).map(({ title }) => title), ["Семья", "Самоощущение"]);
  assert.equal(appendIdealStateItem(source, { topicId: "0", text: "Новый пункт" }), "## Семья\n- **Первый** пункт\n- Новый пункт\n\n## Самоощущение\n- Второй пункт\n");
  assert.equal(appendIdealStateItem(source, { topicId: "1", text: "Первая строка\nВторая строка" }), `${source}- Первая строка\n  Вторая строка\n`);
});

test("new topics work in empty and existing documents; invalid input cannot replace content", () => {
  assert.equal(appendIdealStateItem("", { topicId: "new", topicTitle: "Отдых", text: "Много энергии" }), "## Отдых\n- Много энергии\n");
  assert.equal(appendIdealStateItem("Вступление", { topicId: "new", topicTitle: "Отдых", text: "Много энергии" }), "Вступление\n\n## Отдых\n- Много энергии\n");
  assert.throws(() => appendIdealStateItem("исходный текст", { topicId: "0", text: "новый текст" }), /Тема не найдена/);
  assert.throws(() => appendIdealStateItem("", { topicId: "new", topicTitle: "", text: "пункт" }), /название темы/);
  assert.throws(() => appendIdealStateItem("", { topicId: "new", topicTitle: "Тема", text: " " }), /Опишите/);
});
