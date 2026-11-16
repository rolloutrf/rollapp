import { PlanningPreview } from "../planning-preview.jsx";

export default { id: "rollapp-kanban", title: "РОЛЛАПП/Модули/21 Kanban" };

const render = (args) => <PlanningPreview key={args.state} kind="kanban" {...args} />;
export const Board = { name: "Карточки, списки и перенос", render, args: { state: "ready" } };
export const Empty = { name: "Доска без задач", render, args: { state: "empty" } };
export const Long = { name: "Длинные колонки", render, args: { state: "long" } };
export const Retry = { name: "Ошибка загрузки и повтор", render, args: { state: "error" } };
