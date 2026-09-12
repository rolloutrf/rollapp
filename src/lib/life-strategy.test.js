import assert from "node:assert/strict";
import test from "node:test";
import {
  addLifeStrategyPeriod, getLifeStrategyPeriods, replaceLifeStrategyPeriod,
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
