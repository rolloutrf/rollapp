export const PLANNING_STATUSES = [
  { id: "todo", label: "Запланировано" },
  { id: "doing", label: "В работе" },
  { id: "done", label: "Готово" },
];

export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calendarDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + index, 12));
}

export function isPlanningDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDateKey(date) === value;
}

export function defaultPlanningColumns() {
  return PLANNING_STATUSES.map(({ id, label }) => ({ id, title: label, complete: id === "done", collapsed: false }));
}

export function orderPlanningTasks(tasks, order = []) {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...tasks].sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
}

export function movePlanningTask(tasks, id, columnId, beforeId = null) {
  const remaining = tasks.filter((task) => task.id !== id);
  const source = tasks.find((task) => task.id === id);
  if (!source) return tasks;
  const before = beforeId ? remaining.findIndex((task) => task.id === beforeId) : -1;
  const lastInColumn = remaining.findLastIndex((task) => task.columnId === columnId && !task.archived);
  const index = before >= 0 ? before : lastInColumn >= 0 ? lastInColumn + 1 : remaining.length;
  remaining.splice(index, 0, { ...source, columnId });
  return remaining;
}

export function planningMarkdown(columns, tasks) {
  const card = (task) => `- [${task.completed ? "x" : " "}] ${task.title.replace(/\n/g, "<br>")}${task.dueOn ? ` @{${task.dueOn}}` : ""}${task.description ? `<br>${task.description.replace(/\n/g, "<br>")}` : ""}`;
  return ["---\nkanban-plugin: board\n---", ...columns.map((column) => [
    `## ${column.title.replace(/\n/g, " ")}`,
    ...(column.complete ? ["**Complete**"] : []),
    ...tasks.filter((task) => task.columnId === column.id && !task.archived).map(card),
  ].join("\n\n")), ...(tasks.some((task) => task.archived) ? ["***\n\n## Archive\n\n" + tasks.filter((task) => task.archived).map(card).join("\n\n")] : [])].join("\n\n") + "\n";
}
