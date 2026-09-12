import assert from "node:assert/strict";
import test from "node:test";
import {
  addLifeStrategyPeriod, getLifeStrategyPeriods, removeLifeStrategyPeriod, replaceLifeStrategyPeriod,
  setLifeStrategyChecklistItem,
} from "./life-strategy.js";

const source = `# 35 y.o.\n\nПервый период\n\n---\n\n# 40 y.o.\n\nВторой период\n\n---\n\n# 45 y.o\n\nТретий период\n`;

test("getLifeStrategyPeriods returns separately editable age periods", () => {
  const periods = getLifeStrategyPeriods(source);

  assert.deepEqual(periods.map((period) => period.title), ["35 y.o.", "40 y.o.", "45 y.o"]);
  assert.deepEqual(periods.map((period) => period.content), ["Первый период", "Второй период", "Третий период"]);
});

test("replaceLifeStrategyPeriod only changes the selected period", () => {
  const periods = getLifeStrategyPeriods(source);
  const result = replaceLifeStrategyPeriod(source, periods[1].id, "Обновлённый второй период");

  assert.match(result, /# 35 y\.o\.\n\nПервый период/u);
  assert.match(result, /# 40 y\.o\.\n\nОбновлённый второй период/u);
  assert.match(result, /# 45 y\.o\n\nТретий период/u);
  assert.doesNotMatch(result, /Второй период/u);
  assert.equal((result.match(/^# /gmu) || []).length, 3);
});

test("addLifeStrategyPeriod inserts a period in chronological order", () => {
  const result = addLifeStrategyPeriod(source, "42", "Новый период");
  const periods = getLifeStrategyPeriods(result);

  assert.deepEqual(periods.map((period) => period.title), ["35 y.o.", "40 y.o.", "42 y.o.", "45 y.o"]);
  assert.equal(periods[2].content, "Новый период");
  assert.equal((result.match(/^# /gmu) || []).length, 4);
});

test("addLifeStrategyPeriod appends a period and rejects a duplicate age", () => {
  const result = addLifeStrategyPeriod(source, 50, "Будущий период");
  const periods = getLifeStrategyPeriods(result);

  assert.equal(periods.at(-1).title, "50 y.o.");
  assert.equal(periods.at(-1).content, "Будущий период");
  assert.throws(() => addLifeStrategyPeriod(source, 40, "Дубль"), /уже существует/u);
});

test("setLifeStrategyChecklistItem toggles only the selected Markdown checkbox", () => {
  const checklist = "# 45 y.o.\n\n- [ ] Первая цель\n- [x] Вторая цель\n";
  const checked = setLifeStrategyChecklistItem(checklist, 2, true);
  const unchecked = setLifeStrategyChecklistItem(checked, 3, false);

  assert.equal(unchecked, "# 45 y.o.\n\n- [x] Первая цель\n- [ ] Вторая цель\n");
  assert.throws(() => setLifeStrategyChecklistItem(checklist, 0, true), /не является чекбоксом/u);
});

test("removeLifeStrategyPeriod removes a middle or final period with its separator", () => {
  const periods = getLifeStrategyPeriods(source);
  const withoutMiddle = removeLifeStrategyPeriod(source, periods[1].id);
  const withoutFinal = removeLifeStrategyPeriod(source, periods[2].id);

  assert.deepEqual(getLifeStrategyPeriods(withoutMiddle).map((period) => period.title), ["35 y.o.", "45 y.o"]);
  assert.deepEqual(getLifeStrategyPeriods(withoutFinal).map((period) => period.title), ["35 y.o.", "40 y.o."]);
  assert.doesNotMatch(withoutFinal, /---\s*$/u);
  assert.throws(() => removeLifeStrategyPeriod(source, "missing"), /не найден/u);
});
