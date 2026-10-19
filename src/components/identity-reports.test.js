import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("identity reports keep their narrow-screen layout contract", async () => {
  const [styles, productStyles, gallup] = await Promise.all([
    readFile(new URL("src/identity-reports.css", root), "utf8"),
    readFile(new URL("src/index.css", root), "utf8"),
    readFile(new URL("src/components/gallup-profile.jsx", root), "utf8"),
  ]);
  const phoneStyles = styles.slice(
    styles.indexOf("@media (max-width: 760px)"),
    styles.indexOf("@media (max-width: 640px)"),
  );

  assert.match(
    styles,
    /\.identity-report\s+:is\([^)]*section[^)]*dd[^)]*\)\s*,\s*\.identity-report-section\s*>\s*\*\s*\{\s*min-width:\s*0;/su,
    "Nested report content must be allowed to shrink inside the mobile viewport",
  );
  assert.match(
    styles,
    /\.identity-report\s+:is\([^)]*h2[^)]*a[^)]*\)\s*\{\s*overflow-wrap:\s*anywhere;/su,
    "Long report headings and links must wrap instead of widening the page",
  );
  assert.match(
    gallup,
    /function GeneratedGallupProfile\([^)]*\)\s*\{\s*return <IdentityGeneratedDocuments report=\{report\}\s*\/>;/su,
    "Uploaded Gallup reports must use the source PDF renderer covered by the layout checks",
  );
  for (const selector of ["identity-pdf-score", "identity-pdf-subscale"]) {
    assert.match(
      productStyles,
      new RegExp(`\\.${selector}\\s*\\{[^}]*grid-template-columns:\\s*minmax\\(0,\\s*1fr\\)\\s+auto;`, "su"),
      `${selector} labels must shrink while preserving the score/segments column`,
    );
  }
  assert.match(
    productStyles,
    /\.identity-pdf-rank\s*\{[^}]*grid-template-columns:\s*repeat\(34,\s*minmax\(0,\s*1fr\)\);/su,
    "The source Gallup rank ribbon must retain all 34 shrinkable cells",
  );
  assert.match(
    productStyles,
    /\.identity-pdf-content\s*\{[^}]*overflow-wrap:\s*anywhere;/su,
    "Source chart labels and unbroken PDF text must wrap without truncation",
  );
  assert.match(
    phoneStyles,
    /\.gallup-report-toolbar\s*\{[^}]*flex-direction:\s*column;/su,
    "Gallup report controls must stack on narrow screens",
  );
  assert.match(
    phoneStyles,
    /\.gallup-blend-grid,[\s\S]*\.hogan-scale-group dl\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/u,
    "Gallup and Hogan content grids must collapse to one column on phones",
  );
  assert.match(
    productStyles,
    /@media\s*\(max-width:\s*820px\)\s*\{\s*\.identity-pdf-subscale-columns\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/su,
    "Source profile columns must use one shrinkable column on narrow screens",
  );
  assert.match(
    productStyles,
    /\.identity-generated-document\s*\{[^}]*min-width:\s*0;/su,
    "The actual source document must shrink inside its page rail",
  );
});
