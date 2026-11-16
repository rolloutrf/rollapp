import { useState } from "react";
import { PlanningSpaceCreator, PlanningSpaceMenu } from "@/modules/planning/planning-space-switcher.jsx";
import { PlanningDatePicker } from "@/modules/planning/planning-date-picker.jsx";
import { RelatedChoiceCard } from "@/modules/planning/planning-related-card.jsx";
import { Page, Scenario, fixtureError, noop } from "../support.jsx";
import { PlanningPreview } from "../planning-preview.jsx";
import { sampleWish } from "../samples.js";

export default { id: "rollapp-planning", title: "РОЛЛАПП/Модули/18 Задачи и пространства" };

function Space({ kind, state }) {
  const [value, setValue] = useState("work");
  const [show, setShow] = useState(state === "new");
  const [spaces, setSpaces] = useState([{ id: "work", title: "Рабочие задачи" }, { id: "personal", title: "Личные дела" }]);
  const [date, setDate] = useState("2026-11-16");
  const [selected, setSelected] = useState(state !== "empty");
  return <Scenario><Page title="Пространства планирования">
    <div className="grid max-w-md gap-2">
      <PlanningSpaceMenu kind={kind} selected={value} onSelect={setValue} loading={state === "loading"} error={state === "error" ? "Не удалось загрузить пространства." : ""} reload={noop} spaces={spaces} />
      <PlanningDatePicker value={date} onChange={setDate} clearable />
      <RelatedChoiceCard item={{ ...sampleWish, kind: "wish", snippet: "Вишлист · товары" }} selected={selected} onToggle={() => setSelected(value => !value)} />
    </div>
    {show && <PlanningSpaceCreator kind={kind} onClose={() => setShow(false)} onCreate={async (title) => {
      if (title === "Ошибка") throw fixtureError("Не удалось создать пространство.");
      const id = crypto.randomUUID();
      setSpaces(current => [...current, { id, title }]); setValue(id);
    }} />}
  </Page></Scenario>;
}
export const Picker = { name: "Пространства, связанные объекты и дата", render: Space, args: { kind: "todo", state: "ready" } };
export const Create = { ...Picker, name: "Создать пространство", args: { kind: "todo", state: "new" } };
export const Tasks = { name: "Открыть и сохранить задачу", render: () => <PlanningPreview kind="todo" /> };
export const Loading = { name: "Загрузка задач", render: () => <PlanningPreview kind="todo" state="loading" /> };
export const Error = { name: "Ошибка загрузки и повтор", render: () => <PlanningPreview kind="todo" state="error" /> };
