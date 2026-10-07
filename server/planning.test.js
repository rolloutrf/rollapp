import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarDays, isPlanningDate, localDateKey } from "../shared/planning.js";
import { planningTaskSchema, planningPatchSchema } from "./planning.js";

test("calendar starts on Monday and covers month boundaries without UTC date shifts", () => {
  const days = calendarDays(new Date(2026, 2, 1, 12));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 1);
  assert.equal(localDateKey(days[0]), "2026-02-23");
  assert.equal(localDateKey(days[41]), "2026-04-05");
  assert.equal(days.filter((date) => date.getMonth() === 2).length, 31);
});

test("planning dates validate leap days and reject normalized invalid dates", () => {
  assert.equal(isPlanningDate("2024-02-29"), true);
  for (const value of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "invalid"]) assert.equal(isPlanningDate(value), false);
});

test("task input validates titles, status, description limits and optional date", () => {
  assert.deepEqual(planningTaskSchema.parse({ title: "  План  " }), { title: "План", description: "", status: "todo", dueOn: "" });
  for (const value of [{ title: " " }, { title: "x", status: "unknown" }, { title: "x", dueOn: "2026-02-30" }, { title: "x", description: "x".repeat(5001) }]) assert.equal(planningTaskSchema.safeParse(value).success, false);
});

test("moving a task does not reset its description or date", () => {
  assert.deepEqual(planningPatchSchema.parse({ status: "doing" }), { status: "doing" });
  assert.deepEqual(planningPatchSchema.parse({ dueOn: "" }), { dueOn: "" });
  assert.equal(planningPatchSchema.safeParse({}).success, false);
});

test("board moves preserve unmentioned cards and support insertion within the same list", async () => {
  const { movePlanningTask, orderPlanningTasks, planningMarkdown, defaultPlanningColumns } = await import("../shared/planning.js");
  const tasks = [
    { id: "a", title: "First", columnId: "todo" },
    { id: "b", title: "Second", columnId: "todo", completed: true, dueOn: "2026-10-07" },
    { id: "c", title: "Third", columnId: "doing", description: "- [ ] Step one\n- [x] Step two" },
  ];
  assert.deepEqual(movePlanningTask(tasks, "b", "todo", "a").map((task) => task.id), ["b", "a", "c"]);
  assert.deepEqual(movePlanningTask(tasks, "a", "doing", null).map((task) => task.id), ["b", "c", "a"]);
  assert.deepEqual(orderPlanningTasks(tasks, ["c"]).map((task) => task.id), ["c", "a", "b"]);
  const markdown = planningMarkdown(defaultPlanningColumns(), tasks);
  assert.match(markdown, /kanban-plugin: board/);
  assert.match(markdown, /\[x\] Second @\{2026-10-07\}/);
  assert.match(markdown, /Step one<br>- \[x\] Step two/);
});

test("calendar navigation clamps month ends and keeps Monday weeks across year boundaries", async () => {
  const { calendarWeek, shiftCalendarDate } = await import("../shared/planning-calendar.js");
  assert.equal(shiftCalendarDate("2024-01-31", "month", 1), "2024-02-29");
  assert.equal(shiftCalendarDate("2026-03-31", "month", -1), "2026-02-28");
  assert.equal(shiftCalendarDate("2026-12-31", "day", 1), "2027-01-01");
  assert.deepEqual(calendarWeek("2027-01-01"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
});

test("scheduling validates clock times and end of day", async () => {
  const { scheduleError, taskTimeLabel } = await import("../shared/planning-calendar.js");
  for (const startTime of ["24:00", "9:00", "09:60"]) assert.equal(planningPatchSchema.safeParse({ startTime }).success, false);
  assert.equal(planningPatchSchema.safeParse({ durationMinutes: 0 }).success, false);
  assert.notEqual(scheduleError({ startTime: "09:00" }), "");
  assert.notEqual(scheduleError({ dueOn: "2026-10-07", startTime: "23:30", durationMinutes: 60 }), "");
  assert.equal(scheduleError({ dueOn: "2026-10-07", startTime: "23:30", durationMinutes: 30 }), "");
  assert.equal(taskTimeLabel({ startTime: "23:30", durationMinutes: 30 }), "23:30–24:00");
});

test("overlapping appointments share lanes, adjacent appointments reuse full width", async () => {
  const { layoutCalendarEvents } = await import("../shared/planning-calendar.js");
  const tasks = [{ id: "a", startTime: "09:00", durationMinutes: 60 }, { id: "b", startTime: "09:30", durationMinutes: 60 }, { id: "c", startTime: "10:00", durationMinutes: 30 }, { id: "d", startTime: "10:30", durationMinutes: 60 }, { id: "all-day" }];
  assert.deepEqual(layoutCalendarEvents(tasks).map(({ task, lane, lanes }) => [task.id, lane, lanes]), [["a", 0, 2], ["b", 1, 2], ["c", 0, 2], ["d", 0, 1]]);
});

test("year navigation keeps leap-day selection within the destination year", async () => {
  const { shiftCalendarDate } = await import("../shared/planning-calendar.js");
  assert.equal(shiftCalendarDate("2024-02-29", "year", 1), "2025-02-28");
  assert.equal(shiftCalendarDate("2024-02-29", "year", -4), "2020-02-29");
});

test("calendar gestures snap both directions and preserve valid day boundaries", async () => {
  const { calendarRange, calendarMove, calendarResize } = await import("../shared/planning-calendar.js");
  assert.deepEqual(calendarRange(600, 540), { startTime: "09:00", durationMinutes: 60 });
  assert.deepEqual(calendarRange(-10, 8), { startTime: "00:00", durationMinutes: 15 });
  assert.deepEqual(calendarRange(1435, 1500), { startTime: "23:45", durationMinutes: 15 });
  const task = { startTime: "09:00", durationMinutes: 90 };
  assert.deepEqual(calendarMove(task, "2026-10-15", 1430), { dueOn: "2026-10-15", startTime: "22:30", durationMinutes: 90 });
  assert.deepEqual(calendarMove(task, "2026-10-15", null), { dueOn: "2026-10-15", startTime: "" });
  assert.deepEqual(calendarResize(task, 500), { durationMinutes: 15 });
  assert.deepEqual(calendarResize(task, 1500), { durationMinutes: 900 });
});
