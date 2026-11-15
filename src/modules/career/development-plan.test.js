import assert from "node:assert/strict";
import test from "node:test";
import {
  migrateDevelopmentPlanDraft, moveDevelopmentPlanItem, parseDevelopmentPlanMarkdown, serializeDevelopmentPlanMarkdown,
} from "./development-plan.js";

const SOURCE = `## Сильные стороны\n\nВводный текст.\n\n### Управление\n\nОписание.\n\n### Как использовать\n\n- Первый пункт.\n- Второй пункт.\n\n### Что делать\n\n- Первое действие.\n\n### Аналитика\n\nДругое описание.\n\n### Как использовать\n\n- Третий пункт.\n\n### Что делать\n\n- Второе действие.\n`;

test("development plan parser keeps every bullet as a separate entry", () => {
  const plan = parseDevelopmentPlanMarkdown(SOURCE);

  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].items.length, 2);
  assert.deepEqual(plan.groups[0].items[0].approach, ["Первый пункт.", "Второй пункт."]);
  assert.deepEqual(plan.groups[0].items[1].actions, ["Второе действие."]);
});

test("development plan survives a parse and serialize round trip", () => {
  const plan = parseDevelopmentPlanMarkdown(SOURCE);
  const restored = parseDevelopmentPlanMarkdown(serializeDevelopmentPlanMarkdown(plan));

  assert.deepEqual(restored, plan);
});

test("development plan moves a complete item between categories", () => {
  const plan = parseDevelopmentPlanMarkdown(`${SOURCE}\n## Зоны развития\n\nОписание второй категории.\n`);
  const moved = moveDevelopmentPlanItem(plan, 0, 0, 1);

  assert.equal(moved.groups[0].items.length, 1);
  assert.equal(moved.groups[1].items.length, 1);
  assert.equal(moved.groups[1].items[0].title, "Управление");
  assert.deepEqual(moved.groups[1].items[0].approach, ["Первый пункт.", "Второй пункт."]);
  assert.deepEqual(moved.groups[1].items[0].actions, ["Первое действие."]);
});

test("inline empty list blocks survive saving while a new entry is being written", () => {
  const source = "## Группа\n\n### Блок\n\n### Подход\n\n- \n- Существующий пункт\n\n### Действия\n\n- Действие\n";
  const plan = parseDevelopmentPlanMarkdown(source);
  assert.deepEqual(plan.groups[0].items[0].approach, ["", "Существующий пункт"]);
  assert.deepEqual(parseDevelopmentPlanMarkdown(serializeDevelopmentPlanMarkdown(plan)), plan);
});

test("freeform development plan recovers the previous structured local draft without losing changes", () => {
  const base = parseDevelopmentPlanMarkdown(SOURCE);
  const draft = structuredClone(base);
  draft.groups[0].items[0].title = "Несохранённое название";
  let stored = JSON.stringify({ base, draft });
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  migrateDevelopmentPlanDraft(storage, "owner:career:development");
  const result = JSON.parse(stored);
  assert.equal(result.base, serializeDevelopmentPlanMarkdown(base));
  assert.equal(result.draft, serializeDevelopmentPlanMarkdown(draft));
  assert.match(result.draft, /Несохранённое название/);
  const migrated = stored;
  migrateDevelopmentPlanDraft(storage, "owner:career:development");
  assert.equal(stored, migrated, "Reopening must leave the Markdown draft unchanged");
});
