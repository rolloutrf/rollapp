import { useRef } from "react";
import { PlanningSpace } from "@/modules/planning/planning-space.jsx";
import { PlanningSpacesProvider } from "@/modules/planning/planning-space-switcher.jsx";
import { GlobalAppChrome } from "@/modules/shell/app-chrome.jsx";
import { movePlanningTask } from "../shared/modules/planning/planning.js";
import { Scenario, hold, fixtureError } from "./support.jsx";
import { columns as sampleColumns, tasks as sampleTasks, sampleWish } from "./samples.js";

const exampleSpaces = [
  { id: "main", title: "Основной список" },
  { id: "studio", title: "Планы мастерской" },
];
function initialTasks(state) {
  if (state === "empty") return [];
  if (state === "long") return Array.from({ length: 28 }, (_, i) => ({
    ...sampleTasks[i % sampleTasks.length], id: `task-${i + 1}`, title: `Запланированная задача ${i + 1}`, recurrence: null,
  }));
  return structuredClone(sampleTasks);
}

export function PlanningPreview({ kind, state = "ready", view = "month" }) {
  const rows = useRef(initialTasks(state));
  const columns = useRef(structuredClone(sampleColumns));
  const failure = useRef(state === "error");
  const routes = {
    "GET /planning/spaces": { spaces: exampleSpaces.map(space => ({ ...space, kind })) },
    "GET /planning/tasks": () => {
      if (state === "loading") return hold();
      if (failure.current) { failure.current = false; throw fixtureError("Не удалось загрузить задачи. Попробуйте снова."); }
      return { tasks: rows.current, columns: columns.current };
    },
    "GET /planning/calendar-device": { connected: false, eventCount: 0 },
    "GET /planning/calendar-device/events": { events: [] },
    "POST /planning/tasks": (_, body) => {
      if (body.title === "Ошибка") throw fixtureError("Не удалось сохранить задачу.");
      const task = { id: crypto.randomUUID(), ...body };
      rows.current = [...rows.current, task];
      return { task };
    },
    "PATCH /planning/tasks/*": (path, body) => {
      const [id, action] = path.split("?")[0].split("/").slice(3);
      if (action === "move") {
        rows.current = movePlanningTask(rows.current, id, body.columnId, body.beforeId);
        return { tasks: rows.current, columns: columns.current };
      }
      if (body.title === "Ошибка") throw fixtureError("Не удалось сохранить задачу.");
      const task = { ...rows.current.find(row => row.id === id), ...body, id };
      rows.current = rows.current.map(row => row.id === id ? task : row);
      return { task };
    },
    "DELETE /planning/tasks/*": (path) => {
      const id = path.split("?")[0].split("/").at(-1);
      rows.current = rows.current.filter(row => row.id !== id);
      return {};
    },
    "POST /planning/columns": (_, body) => {
      const column = { id: crypto.randomUUID(), complete: false, ...body };
      columns.current = [...columns.current, column];
      return { columns: columns.current, column };
    },
    "PATCH /planning/columns/*": (path, body) => {
      const [id, action] = path.split("?")[0].split("/").slice(3);
      const column = { ...columns.current.find(item => item.id === id), ...(action === "move" ? {} : body) };
      if (action === "move") {
        const next = columns.current.filter(item => item.id !== id);
        const before = next.findIndex(item => item.id === body.beforeId);
        next.splice(before === -1 ? next.length : before, 0, column);
        columns.current = next;
      } else columns.current = columns.current.map(item => item.id === id ? column : item);
      return { columns: columns.current, column };
    },
    "GET /dashboard": { lists: [], wishes: [sampleWish] },
    "GET /contacts": { contacts: [] },
    "GET /education/courses": { courses: [] },
    "GET /education/conferences": { conferences: [] },
    "GET /education/coaching-sessions": { sessions: [] },
    "GET /health/workouts": { workouts: [] },
    "GET /health/medications": { medications: [] },
  };
  const path = `/app/planning?tab=${kind}&space=studio&date=2026-11-16&view=${view}`;
  return <Scenario path={path} routes={routes}><PlanningSpacesProvider>
    <div className="app-layout app-layout--dark app-layout--planning">
      <GlobalAppChrome />
      <main className="app-main"><PlanningSpace /></main>
    </div>
  </PlanningSpacesProvider></Scenario>;
}
