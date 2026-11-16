import { PlanningPreview } from "../planning-preview.jsx";

export default { id: "rollapp-daily-todo", title: "РОЛЛАПП/Модули РОЛЛАПП/19 Ежедневный To Do" };

const render = (args) => <PlanningPreview key={args.state} kind="todo" {...args} />;
export const Today = { name: "Задачи дня, отметки и редактор", render, args: { state: "ready" } };
export const Empty = { name: "День без задач", render, args: { state: "empty" } };
export const Long = { name: "Длинный список и прокрутка", render, args: { state: "long" } };
