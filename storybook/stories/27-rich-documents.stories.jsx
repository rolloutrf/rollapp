import { useRef, useState } from "react";
import { InlineDocument } from "@/modules/rich-documents/inline-document.jsx";
import { MarkdownDocument } from "@/modules/identity/life-strategy.jsx";
import { Page, Scenario, fixtureError, hold } from "../support.jsx";

export default { id: "rollapp-rich-documents", title: "РОЛЛАПП/Модули РОЛЛАПП/27 Документы и встроенный редактор" };

const samples = {
  basic: "# План недели\n\nОбсудить **приоритеты** и проверить *гипотезы*.\n\n> Одно решение нужно записать до встречи.\n\n- [x] Собрать вопросы\n- [ ] Подготовить материалы\n",
  table: "## Контрольные точки\n\n| Этап | Владелец | Статус |\n| --- | --- | --- |\n| Исследование | Мария | Готово |\n| Интерфейс | Алексей | В работе |\n\nСледующая строка остаётся обычным текстом.\n",
  media: "## Иллюстрация\n\n![Синяя фигурка](/store/cats/blue-tired.webp \"Кот — Уставший\")\n\nТекст после изображения. Его можно выделить и отформатировать.\n",
  empty: "",
};

function Document({ variant, mode }) {
  const [content, setContent] = useState(samples[variant]);
  const firstSave = useRef(true);
  async function save(next) {
    if (mode === "saving") return hold();
    if (mode === "retry" && firstSave.current) {
      firstSave.current = false;
      throw fixtureError("Не удалось сохранить. Повторите попытку.");
    }
    setContent(next);
    return next;
  }
  return <Scenario routes={{ UPLOADIMAGE: { id: "storybook-image", url: "/store/cats/blue-tired.webp" } }}><Page className="typeset typeset-rollapp">
    {mode === "reader" ? <MarkdownDocument source={content} /> : <InlineDocument value={content} onSave={save}
      label="Документ Storybook" documentKey="storybook-document" scope="identity" disabled={mode === "disabled"} readOnly={mode === "readonly"}
      showBusinessControls={false} addBlock={{ type: "paragraph" }} placeholder="Начните писать или нажмите /" />}
  </Page></Scenario>;
}
const render = (args) => <Document key={JSON.stringify(args)} {...args} />;
export const Edit = { name: "Текст, цитата, задачи и /-меню", render, args: { variant: "basic", mode: "edit" }, argTypes: { variant: { control: "select", options: Object.keys(samples) }, mode: { control: "select", options: ["edit", "reader", "readonly", "disabled", "saving", "retry"] } } };
export const Table = { ...Edit, name: "Редактирование таблицы", args: { variant: "table", mode: "edit" } };
export const Image = { ...Edit, name: "Изображение и изменение размера", args: { variant: "media", mode: "edit" } };
export const Reader = { ...Edit, name: "Чтение Markdown", args: { variant: "basic", mode: "reader" } };
export const ReadOnly = { ...Edit, name: "Доступ только для чтения", args: { variant: "basic", mode: "readonly" } };
export const Disabled = { ...Edit, name: "Редактирование заблокировано", args: { variant: "basic", mode: "disabled" } };
export const Empty = { ...Edit, name: "Пустой документ", args: { variant: "empty", mode: "edit" } };
export const Saving = { ...Edit, name: "Сохранение после ввода", args: { variant: "basic", mode: "saving" } };
export const Retry = { ...Edit, name: "Ошибка сохранения и повтор", args: { variant: "basic", mode: "retry" } };
