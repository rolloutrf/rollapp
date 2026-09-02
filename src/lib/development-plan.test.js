import assert from "node:assert/strict";
import test from "node:test";
import {
  moveDevelopmentPlanItem, parseDevelopmentPlanMarkdown, serializeDevelopmentPlanMarkdown,
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
