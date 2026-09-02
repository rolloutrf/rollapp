import assert from "node:assert/strict";
import test from "node:test";
import { parseAboutMeMarkdown, serializeAboutMeMarkdown } from "./about-me.js";

test("about-me markdown becomes separate question and description pairs", () => {
  const parsed = parseAboutMeMarkdown(`### 1. Первый вопрос?\n\nПервый абзац.\n\nВторой абзац.\n\n### 2. Второй вопрос?\n\n[Ответ](https://example.com)\n`);

  assert.deepEqual(parsed, {
    preamble: "",
    questions: [
      { question: "Первый вопрос?", description: "Первый абзац.\n\nВторой абзац." },
      { question: "Второй вопрос?", description: "[Ответ](https://example.com)" },
    ],
  });
});

test("about-me serialization restores numbering and preserves a preamble", () => {
  const source = serializeAboutMeMarkdown({
    preamble: "Вводный текст.",
    questions: [
      { question: "Новый вопрос?", description: "Новый ответ." },
      { question: "Ещё один?", description: "Описание в двух строках.\n\nПродолжение." },
    ],
  });

  assert.equal(source, "Вводный текст.\n\n### 1. Новый вопрос?\n\nНовый ответ.\n\n### 2. Ещё один?\n\nОписание в двух строках.\n\nПродолжение.\n");
  assert.equal(parseAboutMeMarkdown(source).questions.length, 2);
});
