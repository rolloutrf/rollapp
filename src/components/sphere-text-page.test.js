import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("plain sphere pages share one centered content rail", async () => {
  const [styles, careerContent, aboutMe, fourQuestions, theses, lifeStrategy, developmentPlan, domain, mission, editableLifeStrategy] = await Promise.all([
    readFile(new URL("src/styles.css", root), "utf8"),
    readFile(new URL("src/components/career-content.jsx", root), "utf8"),
    readFile(new URL("src/components/about-me.jsx", root), "utf8"),
    readFile(new URL("src/components/four-questions.jsx", root), "utf8"),
    readFile(new URL("src/components/theses.jsx", root), "utf8"),
    readFile(new URL("src/components/life-strategy.jsx", root), "utf8"),
    readFile(new URL("src/components/development-plan.jsx", root), "utf8"),
    readFile(new URL("src/components/domain.jsx", root), "utf8"),
    readFile(new URL("src/components/mission.jsx", root), "utf8"),
    readFile(new URL("src/components/editable-life-strategy.jsx", root), "utf8"),
  ]);

  assert.match(
    styles,
    /\.sphere-text-page\s*\{[^}]*width:\s*min\(var\(--layout-text-width\),\s*100%\);[^}]*margin-inline:\s*auto;/su,
    "The shared text rail must own the desktop measure and centering",
  );
  assert.match(
    styles,
    /\.sphere-text-page\s*>\s*:is\([^)]*\.life-strategy-source,[^)]*\.about-me-questions,[^)]*\.four-questions,[^)]*\.development-plan-editor[^)]*\)\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/su,
    "Text-page children must fill the shared rail without their own width cap",
  );
  assert.match(
    styles,
    /\.sphere-tabs__content\s*>\s*section\s*\{\s*max-width:\s*var\(--layout-text-width\);\s*\}/u,
    "Fallback sections must use the shared reading measure",
  );
  assert.doesNotMatch(
    styles,
    /\.four-question__answer\s*\{[^}]*max-width:/su,
    "Four-question answers must not introduce a second text measure",
  );
  assert.match(styles, /\.sphere-text-page\s*\{[^}]*padding-block:\s*0;/su, "The page shell must own the ending space without nested padding");
  assert.match(
    fourQuestions,
    /className="four-questions__list m-0 list-none p-0"/u,
    "Four questions must reset the prose list inset",
  );
  assert.match(
    fourQuestions,
    /className="four-question p-0"/u,
    "Four-question rows must not inherit prose list-item padding",
  );
  assert.match(
    developmentPlan,
    /className="not-typeset development-plan-editor__list"/u,
    "Development-plan items must start at the content edge without the prose list inset",
  );

  for (const [label, source] of [
    ["editable Markdown pages", careerContent],
    ["About me", aboutMe],
    ["Four questions", fourQuestions],
    ["Theses", theses],
    ["standalone life strategy", lifeStrategy],
    ["Development plan", developmentPlan],
  ]) {
    assert.match(source, /className="sphere-text-page page-stack"/u, `${label} must use the shared text rail`);
  }

  for (const [label, source] of [
    ["Domain", domain],
    ["Mission", mission],
    ["Life strategy", editableLifeStrategy],
  ]) {
    assert.match(source, /<EditableMarkdownDocument/u, `${label} must use the shared editable Markdown page`);
  }
});
