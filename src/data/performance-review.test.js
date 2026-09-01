import assert from "node:assert/strict";
import test from "node:test";
import { PERFORMANCE_CYCLES } from "./performance-review.js";

test("the performance archive keeps every imported review cycle and project", () => {
  assert.equal(PERFORMANCE_CYCLES.length, 5);
  assert.equal(PERFORMANCE_CYCLES[0].id, "2025-Лето");
  assert.equal(PERFORMANCE_CYCLES.reduce((sum, cycle) => sum + cycle.projects.length, 0), 31);
  assert.ok(PERFORMANCE_CYCLES.every((cycle) => cycle.projects.every((project) => project.sections.length > 0)));
});

test("performance feedback is complete and generated data contains no guest access token", () => {
  const feedbackCount = PERFORMANCE_CYCLES.reduce(
    (total, cycle) => total + cycle.interaction.length + cycle.projects.reduce((sum, project) => sum + project.reviewers.length, 0),
    0,
  );
  assert.equal(feedbackCount, 117);
  assert.doesNotMatch(JSON.stringify(PERFORMANCE_CYCLES), /(?:[?&]token=|eyJ0eXAi)/iu);
  const validScores = new Set(["", "Супер", "Выше ожиданий", "Соответствует ожиданиям", "Хорошо"]);
  const scores = PERFORMANCE_CYCLES.flatMap((cycle) => [
    ...cycle.interaction.map((reviewer) => reviewer.score),
    ...cycle.projects.flatMap((project) => project.reviewers.map((reviewer) => reviewer.score)),
  ]);
  assert.ok(scores.every((score) => validScores.has(score)), "Reviewer scores must contain labels, not review prose");
});
