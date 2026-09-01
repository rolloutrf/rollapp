import assert from "node:assert/strict";
import test from "node:test";
import { parsePerformanceReviewText } from "./performance-review-pdf.js";

test("performance PDF text becomes a structured review cycle", () => {
  const result = parsePerformanceReviewText([
    "Перфоманс-ревью Лето 2026",
    "Сотрудник: Михаил Колосков",
    "Период: 1 января — 30 июня 2026",
    "Проект: Платформа заявок",
    "Что сделано?",
    "- Запустил новую форму заявки",
    "- Сократил количество ручных операций",
    "Какой результат?",
    "Конверсия выросла на 18%.",
    "Отзыв от: Анна Петрова",
    "Роль: Руководитель продукта",
    "Оценка: Выше ожиданий",
    "Что было хорошо",
    "Команда получила прозрачный процесс запуска.",
    "Что можно улучшить",
    "Раньше подключать аналитику.",
  ], { id: "cycle-pdf", filename: "Лето 2026.pdf" });

  assert.equal(result.cycle.season, "Лето");
  assert.equal(result.cycle.year, 2026);
  assert.equal(result.cycle.projects.length, 1);
  assert.equal(result.cycle.projects[0].title, "Платформа заявок");
  assert.equal(result.cycle.projects[0].sections[0].label, "Что сделано?");
  assert.equal(result.cycle.projects[0].reviewers[0].name, "Анна Петрова");
  assert.equal(result.cycle.projects[0].reviewers[0].score, "Выше ожиданий");
  assert.deepEqual(result.warnings, []);
});

test("performance PDF import preserves unstructured text as a visible project", () => {
  const result = parsePerformanceReviewText([
    "Обзор работы за 2026 год",
    "Собрал единый каталог финансовых сервисов.",
    "Команда использует его в квартальном планировании.",
  ], { id: "cycle-generic", filename: "Итоги работы.pdf" });

  assert.equal(result.cycle.year, 2026);
  assert.equal(result.cycle.season, "Ревью");
  assert.equal(result.cycle.projects[0].title, "Итоги работы");
  assert.match(result.cycle.projects[0].sections[0].blocks[0].text, /единый каталог/u);
  assert.equal(result.warnings.length, 1);
});
