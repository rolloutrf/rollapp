import test from "node:test";
import assert from "node:assert/strict";
import { durationLabel, nutritionTotals, sleepMinutes, sleepHistoryDays, trackerSchemas } from "./health-trackers.js";
import { isSphereSection, sphereSectionPath } from "./sphere-sharing.js";

test("sleep crosses midnight and validates dates, time and quality", () => {
  assert.equal(sleepMinutes("23:30", "07:15"), 465);
  assert.equal(sleepMinutes("13:00", "14:30"), 90);
  assert.equal(durationLabel(465), "7 ч 45 мин");
  const entry = { date: "2026-10-20", bedtime: "23:30", wakeTime: "07:15", quality: 4, notes: "" };
  assert(trackerSchemas.sleep.safeParse(entry).success);
  for (const invalid of [{ date: "2026-02-30" }, { wakeTime: "23:30" }, { bedtime: "25:00" }, { quality: 6 }, { quality: true }, { userId: "another" }]) assert(!trackerSchemas.sleep.safeParse({ ...entry, ...invalid }).success);
});
test("nutrition preserves missing values and zero, aggregates entered values", () => {
  const entry = { date: "2026-10-20", time: "12:00", mealType: "lunch", title: "Омлет", calories: "", protein: "12.5", fat: 0, carbs: null };
  const parsed = trackerSchemas.nutrition.parse(entry);
  assert.equal(parsed.completed, true);
  assert.equal(trackerSchemas.nutrition.parse({ ...entry, completed: false }).completed, false);
  assert.equal(parsed.calories, null); assert.equal(parsed.fat, 0);
  assert.deepEqual(nutritionTotals([parsed, { protein: 0.2, calories: 120 }]), { calories: 120, protein: 12.7, fat: 0, carbs: null });
  for (const invalid of [{ calories: -1 }, { protein: true }, { fat: [] }, { fat: Infinity }, { title: " " }, { time: "24:01" }, { mealType: "other" }]) assert(!trackerSchemas.nutrition.safeParse({ ...entry, ...invalid }).success);
});
test("each tracker has its own shared access scope and URL", () => {
  for (const tracker of ["sleep", "nutrition"]) {
    assert(isSphereSection("health", tracker));
    assert(!isSphereSection("career", tracker));
    assert.equal(sphereSectionPath({ sphere: "health", section: tracker }), `/app/spheres/health?tab=${tracker}`);
  }
});

test("sleep history puts today's automatic tile first and retains every historic period", () => {
  const entries = [{ id: 'old', date: '2026-10-19', wakeTime: '08:00' }, { id: 'earlier', date: '2026-10-19', wakeTime: '06:00' }, { id: 'older', date: '2026-10-18', wakeTime: '07:00' }];
  const days = sleepHistoryDays(entries, '2026-10-20');
  assert.deepEqual(days.map(day => day.date), ['2026-10-20', '2026-10-19', '2026-10-18']);
  assert.deepEqual(days[0].entries, []);
  assert.deepEqual(days[1].entries.map(entry => entry.id), ['earlier', 'old']);
  assert.equal(entries[0].id, 'old');
  assert.deepEqual(sleepHistoryDays([], '2026-10-21'), [{ date: '2026-10-21', entries: [] }]);
});
