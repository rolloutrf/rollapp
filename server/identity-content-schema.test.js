import assert from "node:assert/strict";
import test from "node:test";
import { IDENTITY_QUESTION_TITLES } from "../shared/identity-questions.js";
import { identityFourQuestionsSchema, identityValuesSchema } from "./identity-content-schema.js";

test("custom identity values preserve their description", () => {
  const result = identityValuesSchema.parse({
    selected: ["custom:subjectivity"],
    custom: [{
      id: "custom:subjectivity",
      label: "Субъектность",
      description: "Сохранять свободу выбора и способность действовать.",
    }],
  });

  assert.equal(result.custom[0].description, "Сохранять свободу выбора и способность действовать.");
});

test("legacy custom identity values default to an empty description", () => {
  const result = identityValuesSchema.parse({
    selected: ["custom:legacy"],
    custom: [{ id: "custom:legacy", label: "Своя ценность" }],
  });

  assert.equal(result.custom[0].description, "");
});

test("four question titles are always restored to their fixed wording", () => {
  const result = identityFourQuestionsSchema.parse({
    questions: IDENTITY_QUESTION_TITLES.map((title, index) => ({
      title: `${title} изменено`,
      paragraphs: [`Ответ ${index + 1}`],
    })),
  });

  assert.deepEqual(result.questions.map((question) => question.title), IDENTITY_QUESTION_TITLES);
  assert.deepEqual(result.questions.map((question) => question.paragraphs), [
    ["Ответ 1"],
    ["Ответ 2"],
    ["Ответ 3"],
    ["Ответ 4"],
  ]);
});

test("four question answers can be saved without sending titles", () => {
  const result = identityFourQuestionsSchema.parse({
    questions: IDENTITY_QUESTION_TITLES.map((_, index) => ({ paragraphs: [`Ответ ${index + 1}`] })),
  });

  assert.deepEqual(result.questions.map((question) => question.title), IDENTITY_QUESTION_TITLES);
});
