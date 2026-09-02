import assert from "node:assert/strict";
import test from "node:test";
import { getLifeStrategyPeriods, replaceLifeStrategyPeriod } from "./life-strategy.js";

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
