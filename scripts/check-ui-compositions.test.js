import assert from "node:assert/strict";
import test from "node:test";
import { checkUiComposition } from "./check-ui-compositions.mjs";

test("rejects native select even when imported under an alias in another page", () => {
  assert.throws(() => checkUiComposition('import { NativeSelect as Category } from "@/components/ui/native-select";\nconst page = <Category />;', "src/components/contact-editor.jsx"), /shadcn Select/);
});

test("rejects native disclosures and handwritten static or conditional dialogs", () => {
  for (const source of ['<details><summary>CV</summary></details>', '<section role="dialog" />', '<section role={editing ? "dialog" : undefined} />']) {
    assert.throws(() => checkUiComposition(source, "src/components/editor.jsx"));
  }
});

test("only permits invisible file handles and immutable Typeset task markers", () => {
  checkUiComposition('<input className="sr-only" type="file" />', "src/components/upload.jsx");
  checkUiComposition('<input type="checkbox" disabled readOnly aria-labelledby={id} />', "src/components/life-strategy.jsx");
  assert.throws(() => checkUiComposition('<input type="file" />', "src/components/upload.jsx"));
  assert.throws(() => checkUiComposition('<input type="checkbox" readOnly aria-labelledby={id} />', "src/components/life-strategy.jsx"));
  assert.throws(() => checkUiComposition('<input type="checkbox" disabled readOnly aria-labelledby={id} />', "src/components/form.jsx"));
});

test("accepts standard shadcn compositions", () => {
  checkUiComposition('<Dialog><DialogContent><Select><SelectTrigger /><SelectContent><SelectItem /></SelectContent></Select><Input /><Checkbox /><Button /></DialogContent></Dialog>', "src/components/editor.jsx");
});
