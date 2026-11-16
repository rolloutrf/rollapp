import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ControlBar } from "@/components/control-bar";
import { PageActionButton } from "@/components/page-action-button";
import { Example, Examples, Page } from "../support.jsx";

export default {
  id: "rollapp-components", title: "РОЛЛАПП/UI-компоненты/Общие компоненты",
  tags: ["autodocs"], component: Button,
};

export const ButtonControl = {
  name: "Кнопка · параметры",
  args: { variant: "default", size: "lg", disabled: false, children: "Продолжить" },
  argTypes: { variant: { control: "select", options: ["default", "outline", "secondary", "ghost", "destructive", "link"] },
    size: { control: "select", options: ["sm", "default", "lg", "icon"] } },
  render: (args) => <Page title="Кнопка"><div><Button {...args} /></div></Page>,
};
export const ButtonMatrix = {
  name: "Кнопки · варианты и состояния",
  render: () => <Page title="Варианты кнопок"><Examples>
    {["default", "outline", "secondary", "ghost", "destructive", "link"].map(variant => <Example key={variant} title={variant}>
      <div className="flex flex-wrap gap-2"><Button variant={variant}>Действие</Button><Button variant={variant} disabled>Недоступно</Button></div>
    </Example>)}
    <Example title="Размеры и действия">
      <ControlBar className="flex flex-wrap gap-2">
        <Button size="icon" variant="outline" data-control-icon aria-label="Закрыть"><X /></Button>
        <PageActionButton><Pencil />Редактировать</PageActionButton>
        <Button size="icon" variant="destructive" data-control-icon aria-label="Удалить"><Trash2 /></Button>
      </ControlBar>
    </Example>
  </Examples></Page>,
};
function Fields({ invalid, disabled }) {
  const [checked, setChecked] = useState(true);
  return <Page title="Поля и переключатели"><Examples>
    <Example title="Ввод">
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="story-input">Имя</FieldLabel>
        <Input id="story-input" defaultValue="Мария" aria-invalid={invalid} disabled={disabled} />
        {invalid && <FieldError>Введите полное имя.</FieldError>}
      </Field>
      <Field><FieldLabel htmlFor="story-description">Описание</FieldLabel><Textarea id="story-description" placeholder="Описание" disabled={disabled} /></Field>
    </Example>
    <Example title="Выбор">
      <label className="flex items-center gap-2"><Checkbox checked={checked} onCheckedChange={setChecked} disabled={disabled} />В избранном</label>
      <label className="flex items-center gap-2"><Switch disabled={disabled} />Показывать публично</label>
    </Example>
  </Examples></Page>;
}
export const FormFields = { name: "Поля, валидация и выбор", render: Fields, args: { invalid: false, disabled: false } };
export const Feedback = {
  name: "Загрузка, подтверждение и ошибка",
  render: () => <Page title="Обратная связь"><Examples>
    <Example title="Загрузка"><Skeleton className="h-16 w-full rounded-xl" /><p role="status" className="flex items-center gap-2"><Spinner />Загружаем…</p></Example>
    <Example title="Подтверждение"><Alert><Check /><AlertTitle>Сохранено</AlertTitle><AlertDescription>Изменения применены.</AlertDescription></Alert></Example>
    <Example title="Ошибка"><Alert variant="destructive"><AlertTitle>Ошибка сохранения</AlertTitle><AlertDescription>Попробуйте ещё раз.</AlertDescription></Alert></Example>
  </Examples></Page>,
};
