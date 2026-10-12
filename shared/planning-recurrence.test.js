import assert from "node:assert/strict";
import { test } from "node:test";
import { expandRecurringTasks, occursOn, recurrenceError } from "./planning-recurrence.js";
import { planningTaskSchema, planningPatchSchema } from "../server/planning.js";

const series = (frequency, dueOn = "2026-10-07", until = "") => ({ id: "series", title: "Событие", dueOn, startTime: "08:15", durationMinutes: 60, recurrence: { frequency, until } });
const dates = (task, from, to) => expandRecurringTasks([task], from, to).map(({ dueOn }) => dueOn);

test("daily recurrence respects its start and inclusive end, including all-day events", () => {
  const task = { ...series("daily", "2026-10-07", "2026-10-09"), startTime: "" };
  assert.deepEqual(dates(task, "2026-10-06", "2026-10-10"), ["2026-10-07", "2026-10-08", "2026-10-09"]);
  assert.equal(expandRecurringTasks([task], "2026-10-08", "2026-10-08")[0].startTime, "");
});

test("weekdays omit weekends and weekly recurrence preserves weekday and local time across DST", () => {
  assert.deepEqual(dates(series("weekdays", "2026-10-10"), "2026-10-10", "2026-10-13"), ["2026-10-12", "2026-10-13"]);
  const events = expandRecurringTasks([series("weekly", "2026-03-01")], "2026-03-01", "2026-03-30");
  assert.deepEqual(events.map(({ dueOn }) => dueOn), ["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22", "2026-03-29"]);
  assert.ok(events.every(({ startTime, durationMinutes }) => startTime === "08:15" && durationMinutes === 60));
});

test("monthly and yearly rules skip nonexistent dates without drifting", () => {
  assert.deepEqual(dates(series("monthly", "2026-01-31"), "2026-01-01", "2026-05-31"), ["2026-01-31", "2026-03-31", "2026-05-31"]);
  const leap = series("yearly", "2024-02-29");
  assert.equal(occursOn(leap, "2025-02-28"), false);
  assert.equal(occursOn(leap, "2025-03-01"), false);
  assert.equal(occursOn(leap, "2028-02-29"), true);
  assert.equal(occursOn(series("yearly", "2025-12-31"), "2026-12-31"), true);
});

test("completion belongs to an occurrence, ids are stable, and expansion never mutates the series", () => {
  const task = { ...series("daily"), completed: true, recurrenceCompletedDates: ["2026-10-08"] };
  const original = structuredClone(task);
  const events = expandRecurringTasks([task], "2026-10-07", "2026-10-09");
  assert.deepEqual(events.map(({ completed }) => completed), [false, true, false]);
  assert.deepEqual(events.map(({ id }) => id), ["series@2026-10-07", "series@2026-10-08", "series@2026-10-09"]);
  assert.ok(events.every(({ sourceId, seriesDueOn }) => sourceId === "series" && seriesDueOn === task.dueOn));
  assert.deepEqual(task, original);
  assert.deepEqual(dates({ ...task, archived: true }, "2026-10-07", "2026-10-09"), []);
});

test("ordinary tasks remain unchanged and unbounded series expand only within the requested window", () => {
  const task = { id: "single", dueOn: "2026-10-07", completed: true };
  assert.deepEqual(expandRecurringTasks([task], "2026-10-07", "2026-10-07"), [task]);
  assert.deepEqual(dates(task, "2026-10-08", "2026-10-09"), []);
  assert.deepEqual(dates(series("daily", "2000-01-01"), "2026-12-31", "2027-01-01"), ["2026-12-31", "2027-01-01"]);
  assert.throws(() => dates(series("daily"), "2026-01-01", "2028-01-01"), RangeError);
});

test("recurrence inputs reject missing dates, reversed end dates and mixed occurrence updates", () => {
  assert.ok(recurrenceError(series("daily", "")));
  assert.ok(recurrenceError(series("daily", "2026-10-07", "2026-10-06")));
  assert.equal(recurrenceError(series("daily", "2026-10-07", "2026-10-07")), "");
  assert.equal(planningTaskSchema.safeParse(series("hourly")).success, false);
  assert.equal(planningTaskSchema.safeParse(series("daily", "2026-10-07", "2026-02-30")).success, false);
  assert.deepEqual(planningPatchSchema.parse({ recurrence: null }), { recurrence: null });
  assert.deepEqual(planningPatchSchema.parse({ occurrenceDate: "2026-10-08", completed: false }), { occurrenceDate: "2026-10-08", completed: false });
  for (const patch of [{ occurrenceDate: "" }, { occurrenceDate: "2026-10-08" }, { occurrenceDate: "2026-10-08", completed: true, title: "x" }]) assert.equal(planningPatchSchema.safeParse(patch).success, false);
});
