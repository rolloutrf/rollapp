import assert from "node:assert/strict";
import test from "node:test";
import { reorderCourses, sortCourses } from "./course-order.js";

test("sortCourses uses the saved order before the legacy status order", () => {
  const courses = [
    { id: "planned", status: "planned", sortOrder: 0 },
    { id: "active", status: "in_progress", sortOrder: 1 },
  ];

  assert.deepEqual(sortCourses(courses).map((course) => course.id), ["planned", "active"]);
});

test("sortCourses keeps the legacy order while existing courses share the default position", () => {
  const courses = [
    { id: "completed", status: "completed", sortOrder: 0 },
    { id: "planned", status: "planned", sortOrder: 0 },
    { id: "active", status: "in_progress", sortOrder: 0 },
  ];

  assert.deepEqual(sortCourses(courses).map((course) => course.id), ["active", "planned", "completed"]);
});

test("reorderCourses moves a tile and normalizes every saved position", () => {
  const courses = [
    { id: "first", sortOrder: 0 },
    { id: "second", sortOrder: 1 },
    { id: "third", sortOrder: 2 },
  ];

  assert.deepEqual(
    reorderCourses(courses, "first", 2).map(({ id, sortOrder }) => ({ id, sortOrder })),
    [
      { id: "second", sortOrder: 0 },
      { id: "third", sortOrder: 1 },
      { id: "first", sortOrder: 2 },
    ],
  );
});

test("reorderCourses leaves an invalid move unchanged", () => {
  const courses = [{ id: "only", sortOrder: 0 }];
  assert.equal(reorderCourses(courses, "only", -1), courses);
  assert.equal(reorderCourses(courses, "missing", 0), courses);
});
