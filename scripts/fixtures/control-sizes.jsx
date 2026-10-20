import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import { MoreHorizontal, Plus, X } from "lucide-react";
import { GlobalAppChrome, PlanningFab, SessionContext, ToastContext, CollectionNavigationContext } from "@/App.jsx?controls-smoke";
import { ControlBar } from "@/components/control-bar";
import { PlanningCalendar } from "@/components/planning-calendar";
import { PlanningDailyTodo } from "@/components/planning-daily-todo";
import { PlanningKanban } from "@/components/planning-kanban";
import { TaskEditor } from "@/components/planning-space.jsx?controls-smoke";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { Button } from "@/components/ui/button";
import { PageActionButton } from "@/components/page-action-button";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";
import "../../src/components/planning-space.css";

function Fixture() {
  useVisualViewport();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const planning = location.pathname === "/app/planning";
  const tab = search.get("tab") || "kanban";
  const [editor, setEditor] = useState(null);
  const columns = [{ id: "todo", title: "Запланировано", complete: false }];
  const tasks = search.has("empty") ? [] : Array.from({ length: 24 }, (_, index) => ({
    id: `task-${index}`, title: `Задача ${index + 1}`, description: "", columnId: "todo", status: "todo", completed: false, archived: false,
    dueOn: "2026-10-15", startTime: "09:00", durationMinutes: 60,
  }));
  const create = (value = {}) => setEditor({ title: "", dueOn: typeof value === "string" ? value : "2026-10-15", columnId: "todo" });
  // Presentation props only: the fixture never authenticates or writes records.
  const user = search.has("guest") ? null : { canDiscoverSpheres: true, accountType: "personal" };
  return <SessionContext.Provider value={{ user }}><ToastContext.Provider value={() => {}}><CollectionNavigationContext.Provider value={{ collection: null }}><MobileFormPages>
    <GlobalAppChrome /><PlanningFab />
    <div className={`app-layout app-layout--dark ${planning ? "app-layout--planning" : ""}`}><main className="app-main">
      {!planning && <div className="app-shell-chrome-spacer" />}
      <section className={`app-page ${planning ? `planning-space planning-space--${tab}` : "rollapp-body"}`}>
        {planning ? <div className="planning-tools">
          {tab === "calendar" ? <PlanningCalendar tasks={tasks} columns={columns} onEdit={setEditor} onCreate={create} onSave={async () => {}} />
            : tab === "todo" ? <PlanningDailyTodo tasks={tasks} columns={columns} onEdit={setEditor} onCreate={create} onSave={async () => {}} />
              : <PlanningKanban tasks={tasks} columns={columns} onEdit={setEditor} onCreate={create} onSave={async () => {}} />}
        </div> : <>
          <h1>Контролы приложения</h1>
          <div className="page-toolbar"><PageActionButton onClick={create}>Добавить</PageActionButton><PageActionButton variant="outline">Редактировать</PageActionButton></div>
          <ControlBar className="flex gap-2" aria-label="Единый стиль кнопок">
            <Button data-control-icon variant="secondary" size="icon" aria-label="Единый стиль: меню"><MoreHorizontal /></Button>
            <Button data-control-icon variant="outline" size="icon" aria-label="Единый стиль: закрыть"><X /></Button>
          </ControlBar>
          <ControlBar className="flex gap-2" aria-label="Защита от локального размера">
            <Button data-control-icon className="!size-20 rounded-full" aria-label="Локальный большой размер"><Plus className="size-8" /></Button>
            <Button className="!h-16" disabled>Недоступное действие</Button>
          </ControlBar>
          {Array.from({ length: 20 }, (_, index) => <p className="py-4" key={index}>Проверка прокрутки {index + 1}</p>)}
        </>}
      </section>
    </main></div>
    {editor && <TaskEditor task={editor} columns={columns} onClose={() => setEditor(null)} onSave={async () => {}} />}
  </MobileFormPages></CollectionNavigationContext.Provider></ToastContext.Provider></SessionContext.Provider>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><Fixture /></BrowserRouter>);
