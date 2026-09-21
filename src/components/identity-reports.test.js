import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("identity reports keep their narrow-screen layout contract", async () => {
  const styles = await readFile(new URL("src/identity-reports.css", root), "utf8");
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
    styles,
    /\.gallup-dna__labels\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*10fr\)\s+minmax\(0,\s*24fr\);/su,
    "Gallup DNA labels must use shrinkable grid tracks",
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
    styles,
    /@media\s*\(max-width:\s*480px\)\s*\{\s*\.identity-report-domain-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/su,
    "Report domain cards must use one column on the narrowest supported screens",
  );
});
