import { PlanningPreview } from "../planning-preview.jsx";

export default { id: "rollapp-calendar", title: "РОЛЛАПП/Модули РОЛЛАПП/20 Календарь" };

const render = (args) => <PlanningPreview key={JSON.stringify(args)} kind="calendar" {...args} />;
export const Day = { name: "День · пересечения и задачи без времени", render, args: { view: "day", state: "ready" } };
export const Week = { name: "Неделя · повторяющаяся серия", render, args: { view: "week", state: "ready" } };
export const Month = { name: "Месяц · сетка и повестка", render, args: { view: "month", state: "ready" } };
export const Year = { name: "Год", render, args: { view: "year", state: "ready" } };
export const Empty = { name: "Пустой календарь", render, args: { view: "month", state: "empty" } };
