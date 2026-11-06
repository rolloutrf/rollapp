import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ProductTitleInput } from "@/components/product-title-input";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/form-surface";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";

// Deterministic component input, not an API/database substitute. All HTTP API requests are rejected.
window.suggestionCalls = [];
window.submitted = 0;
async function search(query, signal) {
  window.suggestionCalls.push({ query, signal });
  await new Promise((resolve) => setTimeout(resolve, query === "slow" ? 1500 : 80));
  if (query === "error") throw new Error("Wikidata временно недоступна. Можно ввести название вручную.");
  if (query === "limit") throw Object.assign(new Error("Подсказки заняты. Можно продолжить ввод вручную."), { retryAfterSeconds: 2 });
  return { items: query === "empty" ? [] : [
    { id: "Q123", title: `${query} Model`, description: "Описание модели техники из справочника" },
    { id: "Q124", title: `${query} Pro`, description: "Длинное описание модели для проверки переноса строк на узком экране" },
  ] };
}
function Fixture() {
  useVisualViewport();
  const [value, setValue] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [open, setOpen] = useState(true);
  window.setSuggestionDisabled = setDisabled;
  window.setExternalTitle = setValue;
  return <Drawer open={open} onOpenChange={setOpen}><DrawerContent className="app-drawer--form rollapp-body">
    <DrawerHeader><DrawerTitle>Название товара</DrawerTitle><DrawerDescription>Проверка подсказок без сохранения данных.</DrawerDescription></DrawerHeader>
    <form className="form-surface flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); window.submitted += 1; }}>
      <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <Field><FieldLabel htmlFor="title">Название</FieldLabel><ProductTitleInput id="title" value={value} onValueChange={setValue} disabled={disabled} search={search} required /></Field>
        <Field><FieldLabel htmlFor="description">Описание</FieldLabel><Input id="description" defaultValue="Моё описание" /></Field>
        <output data-title>{value}</output>
      </div>
      <DrawerFooter><Button type="submit">Сохранить</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>Закрыть</Button></DrawerFooter>
    </form>
  </DrawerContent></Drawer>;
}
createRoot(document.getElementById("root")).render(<React.StrictMode><BrowserRouter><MobileFormPages><Fixture /></MobileFormPages></BrowserRouter></React.StrictMode>);
