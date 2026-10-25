import assert from "node:assert/strict";
import test from "node:test";
import { IDENTITY_QUESTION_TITLES } from "../shared/identity-questions.js";
import { identityCharacterSchema, identityContentSchemas, identityFourQuestionsSchema, identitySectionSchema, identityValuesSchema } from "./identity-content-schema.js";

test("principles accept Markdown and clearing, with the same limits as theses", () => {
  assert.equal(identitySectionSchema.parse("principles"), "principles");
  assert.equal(identitySectionSchema.safeParse("unknown").success, false);
  for (const section of ["theses", "principles", "ideal-state", "personal-development-plan"]) {
    assert.equal(identitySectionSchema.parse(section), section);
    const schema = identityContentSchemas[section];
    for (const content of ["", "> Держать слово.\n>\n> Предупреждать об изменениях.\n", "а".repeat(200_000)]) {
      assert.equal(schema.parse(content), content);
    }
    assert.equal(schema.safeParse("а".repeat(200_001)).success, false);
    assert.equal(schema.safeParse({ content: "текст" }).success, false);
    assert.equal(schema.safeParse(null).success, false);
  }
});

test("legacy character traits are preserved as selectable custom traits", () => {
  assert.deepEqual(identityCharacterSchema.parse([
    "  Решительность  ",
    { title: "  Самостоятельность ", description: "  Опираюсь на собственное решение.  " },
  ]), {
    selected: ["legacy:0", "legacy:1"],
    custom: [
      { id: "legacy:0", label: "Решительность", description: "" },
      { id: "legacy:1", label: "Самостоятельность", description: "Опираюсь на собственное решение." },
    ],
  });
  assert.equal(identityCharacterSchema.safeParse([""]).success, false);
  assert.equal(identityCharacterSchema.safeParse([{ title: "", description: "Описание" }]).success, false);
});

test("selected character traits have unique IDs", () => {
  assert.equal(identityCharacterSchema.safeParse({ selected: ["curiosity", "curiosity"], custom: [] }).success, false);
  assert.equal(identityCharacterSchema.safeParse({
    selected: ["custom:curiosity"],
    custom: [{ id: "custom:curiosity", label: "Любопытство", description: "Интересоваться новым." }],
  }).success, true);
});

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

test("inline answers can be cleared without replacing the other questions", () => {
  const questions = IDENTITY_QUESTION_TITLES.map((title, index) => ({ title, paragraphs: index === 0 ? [] : ["Ответ"] }));
  assert.deepEqual(identityFourQuestionsSchema.parse({ questions }).questions, questions);
  assert.equal(identityFourQuestionsSchema.safeParse({ questions: questions.slice(1) }).success, false);
});

test("inline answers preserve empty paragraphs and intentional whitespace", () => {
  const questions = IDENTITY_QUESTION_TITLES.map(title => ({ title, paragraphs: ["Текст", "", " Следующая строка "] }));
  assert.deepEqual(identityFourQuestionsSchema.parse({ questions }).questions, questions);
});


test("one rich answer fragment can use the existing aggregate paragraph budget", () => {
  const legacy = Array(30).fill("x".repeat(20_000));
  const questions = IDENTITY_QUESTION_TITLES.map((title, index) => ({ title, paragraphs: index ? [] : legacy }));
  assert(identityFourQuestionsSchema.safeParse({ questions }).success);
  questions[0].paragraphs = ["x".repeat(600_000)];
  assert(identityFourQuestionsSchema.safeParse({ questions }).success);
  questions[0].paragraphs = ['<div data-inline-block="true"><div data-type="nestedBlock"><p>' + "A".repeat(10_000) + "</p><p>" + "B".repeat(10_000) + "</p></div></div>"];
  assert(identityFourQuestionsSchema.safeParse({ questions }).success);
});

test("four answer limits retain the previous aggregate budget and paragraph count", () => {
  const questions = IDENTITY_QUESTION_TITLES.map(title => ({ title, paragraphs: [] }));
  for (const paragraphs of [["x".repeat(600_001)], ["x".repeat(300_001), "y".repeat(300_000)], Array(31).fill("")]) {
    questions[0].paragraphs = paragraphs;
    assert.equal(identityFourQuestionsSchema.safeParse({ questions }).success, false);
  }
});
