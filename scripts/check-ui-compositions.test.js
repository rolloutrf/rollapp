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
  checkUiComposition('<input type="checkbox" disabled readOnly aria-labelledby={id} />', "src/modules/identity/life-strategy.jsx");
  assert.throws(() => checkUiComposition('<input type="file" />', "src/components/upload.jsx"));
  assert.throws(() => checkUiComposition('<input type="checkbox" readOnly aria-labelledby={id} />', "src/modules/identity/life-strategy.jsx"));
  assert.throws(() => checkUiComposition('<input type="checkbox" disabled readOnly aria-labelledby={id} />', "src/components/form.jsx"));
});

test("accepts standard shadcn compositions", () => {
  checkUiComposition('<Dialog><DialogContent><Select><SelectTrigger /><SelectContent><SelectItem /></SelectContent></Select><Input /><Checkbox /><Button /></DialogContent></Dialog>', "src/components/editor.jsx");
});

test("product button geometry belongs to the shared compositions", () => {
  for (const source of ['<Button shape="pill" />', '<Button shape={compact ? "pill" : "default"} />', '<PageActionButton className="px-5" />', '<PageActionButton size="lg" />', '<PageActionButton className="bg-white text-black" />']) {
    assert.throws(() => checkUiComposition(source, "src/components/page.jsx"));
  }
  checkUiComposition('<PageActionButton variant="outline" disabled={busy}>Настройки списка</PageActionButton>', "src/components/page.jsx");
});

test("horizontal report tiles require an explicit scroller contract", () => {
  checkUiComposition('<TabsList data-tab-scroller className="flex-nowrap overflow-x-auto" />', "src/components/reports.jsx");
  assert.throws(() => checkUiComposition('<TabsList className="flex-nowrap overflow-x-auto" />', "src/components/reports.jsx"), /data-tab-scroller/);
});

test("text actions and icon actions have separate visible content", () => {
  const file = "src/components/page.jsx";
  for (const source of [
    'import { Plus as Glyph } from "lucide-react"; const element = <Button><Glyph />Добавить</Button>;',
    '<PageActionButton><span>Скачать</span><svg /></PageActionButton>',
    '<AlertDialogAction>{busy && <Spinner />}Сохранить</AlertDialogAction>',
    '<Link className={buttonVariants()}><Icon />{label}</Link>',
  ]) {
    assert.throws(() => checkUiComposition(source, file), /text action must not render an icon/);
  }
  for (const source of [
    '<Button data-control-icon aria-label="Назад"><Icon /><span className="sr-only">Назад</span></Button>',
    '<Button>{compact ? <Icon /> : "Открыть"}</Button>',
    '<PageActionButton aria-busy={busy}>{busy ? "Сохраняем…" : "Сохранить"}</PageActionButton>',
    '<Button data-content-control><Icon />{record.name}</Button>',
  ]) checkUiComposition(source, file);
});
