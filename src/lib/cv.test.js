import assert from "node:assert/strict";
import test from "node:test";
import { cvHasStructuredContent, normalizeCvContent } from "./cv.js";

test("legacy CV markdown is preserved during structured migration", () => {
  const cv = normalizeCvContent("## Опыт\n\nСтарое резюме.");

  assert.equal(cv.version, 1);
  assert.equal(cv.legacyMarkdown, "## Опыт\n\nСтарое резюме.");
  assert.equal(cv.experiences.length, 0);
  assert.equal(cvHasStructuredContent(cv), false);
});

test("structured CV content is normalized without losing sections", () => {
  const cv = normalizeCvContent({
    desiredPosition: "Руководитель продукта",
    skills: ["Финтех", "", null],
    experiences: [{ company: "Авито", position: "Директор", current: true }],
    education: [{ institution: "Университет", graduationYear: "2012" }],
  });

  assert.equal(cv.desiredPosition, "Руководитель продукта");
  assert.deepEqual(cv.skills, ["Финтех"]);
  assert.equal(cv.experiences[0].id, "experience-1");
  assert.equal(cv.education[0].id, "education-1");
  assert.equal(cvHasStructuredContent(cv), true);
});
