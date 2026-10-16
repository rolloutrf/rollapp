import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useSearchParams } from "react-router-dom";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { PlanningDatePicker } from "@/components/planning-date-picker";
import { TaskEditor } from "@/components/planning-space.jsx?drawer-smoke-export=TaskEditor";
import { Button } from "@/components/ui/button";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";

const columns = [{ id: "todo", title: "Запланировано", complete: false }];
function Fixture() {
  useVisualViewport();
  const [search, setSearch] = useSearchParams();
  const [editor, setEditor] = useState(false);
  const [saved, setSaved] = useState(null);
  const date = search.get("date") || "";
  return <>
    <main className="app-page page-stack">
      <h1>Задачи</h1>
      <PlanningDatePicker label="Выбрать дату" value={date} clearable onChange={(key) => setSearch((current) => {
        const next = new URLSearchParams(current);
        if (key) next.set("date", key); else next.delete("date");
        return next;
      })} />
      <Button onClick={() => setEditor(true)}>Открыть задачу</Button>
      <output data-saved-task>{JSON.stringify(saved)}</output>
    </main>
    {editor && <TaskEditor task={{ dueOn: date, columnId: "todo" }} columns={columns} onClose={() => setEditor(false)} onSave={async (_id, payload) => setSaved(payload)} />}
  </>;
}
createRoot(document.getElementById("root")).render(<StrictMode><BrowserRouter><MobileFormPages><Fixture /></MobileFormPages></BrowserRouter></StrictMode>);
