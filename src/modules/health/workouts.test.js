import assert from "node:assert/strict";
import { test } from "node:test";
import { localDateInputValue, sortWorkouts, workoutWeekSummary } from "./workouts.js";

test("workouts sort upcoming sessions first and history newest first", () => {
  const workouts = [
    { id: "completed-old", status: "completed", workoutOn: "2026-08-20", startTime: "18:00" },
    { id: "planned-late", status: "planned", workoutOn: "2026-09-05", startTime: "09:00" },
    { id: "skipped", status: "skipped", workoutOn: "2026-08-29", startTime: "10:00" },
    { id: "completed-new", status: "completed", workoutOn: "2026-08-30", startTime: "08:00" },
    { id: "planned-early", status: "planned", workoutOn: "2026-09-01", startTime: "19:00" },
  ];

  assert.deepEqual(sortWorkouts(workouts).map(({ id }) => id), [
    "planned-early",
    "planned-late",
    "completed-new",
    "completed-old",
    "skipped",
  ]);
});

test("workouts preserve a saved order inside a list", () => {
  const workouts = [
    { id: "second", sortOrder: 1, status: "completed", workoutOn: "2026-08-30" },
    { id: "first", sortOrder: 0, status: "completed", workoutOn: "2026-08-20" },
  ];

  assert.deepEqual(sortWorkouts(workouts).map(({ id }) => id), ["first", "second"]);
});

test("weekly workout summary includes only completed workouts from the current Monday", () => {
  const summary = workoutWeekSummary([
    { status: "completed", workoutOn: "2026-08-24", durationMinutes: 45, distanceKm: 5.2 },
    { status: "completed", workoutOn: "2026-08-30", durationMinutes: 60, distanceKm: 0 },
    { status: "planned", workoutOn: "2026-08-29", durationMinutes: 90, distanceKm: 10 },
    { status: "completed", workoutOn: "2026-08-23", durationMinutes: 30, distanceKm: 3 },
  ], new Date(2026, 7, 30, 10));

  assert.deepEqual(summary, { completedCount: 2, durationMinutes: 105, distanceKm: 5.2 });
});

test("local date input value does not shift through UTC", () => {
  assert.equal(localDateInputValue(new Date(2026, 7, 31, 0, 5)), "2026-08-31");
});
