import { InlineTextField } from "@/components/inline-text-field";
import { InlineSaveStatus, useDocumentDraft } from "@/components/inline-document";
import { useEffect, useId, useMemo, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { EditorDeleteAction } from "@/components/editor-delete-action";
import { CareerIconAction } from "@/components/career-icon-action";
import {
  CareerContentError, useCareerContent,
} from "@/components/career-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/form-surface";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  moveDevelopmentPlanItem, parseDevelopmentPlanMarkdown, serializeDevelopmentPlanMarkdown,
} from "@/lib/development-plan";
import { useSphereSharing } from "@/lib/sphere-sharing";

const STRENGTHS = [];

const DEVELOPMENT_AREAS = [];

function planItemsMarkdown(items) {
  return items.map((item) => [
    `### ${item.title}`,
    item.summary,
    `### ${item.approachTitle}`,
    ...item.approach.map((entry) => `- ${entry}`),
    "### Что мне с этим делать",
    ...item.actions.map((entry) => `- ${entry}`),
  ].join("\n\n")).join("\n\n");
}

const DEVELOPMENT_PLAN_SOURCE = [];

const DEVELOPMENT_GROUP_LABELS = ["Сильная сторона", "Зона развития"];

function EntryEditor({ initialValue = "", onDelete, onOpenChange, onSave, open }) {
  const isMobile = useIsMobile();
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;
  const [error, setError] = useState("");
  const editing = Boolean(initialValue);

  useEffect(() => {
    if (!open) return;
    setDraft(initialValue);
    setSaving(false);
    setError("");
  }, [initialValue, open]);

  const changeOpen = (nextOpen) => {
    if (!busy) onOpenChange(nextOpen);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const value = draft.trim();
    if (!value) {
      setError("Напишите текст пункта.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(value);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={changeOpen}>
      <DrawerContent
        className="rollapp-body app-drawer--document"
      >
        <DrawerClose
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={busy} />}
          aria-label="Закрыть редактор пункта"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? "Редактировать пункт" : "Новый пункт"}</DrawerTitle>
            <DrawerDescription>Каждый пункт сохраняется отдельно от остальных.</DrawerDescription>
          </DrawerHeader>
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить пункт</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor={fieldId}>Текст пункта</FieldLabel>
              <Textarea
                className="min-h-40 resize-y text-base"
                id={fieldId}
                maxLength={10_000}
                required
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <FieldDescription>Сформулируйте одно действие или практику.</FieldDescription>
            </Field>
            {onDelete && <EditorDeleteAction
              label="Удалить пункт"
              title="Удалить этот пункт?"
              description="Пункт будет удалён без возможности восстановления."
              disabled={saving}
              onBusyChange={setDeleting}
              onDelete={onDelete}
              onDeleted={() => onOpenChange(false)}
            />}
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={busy}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? "Сохранить изменения" : "Добавить пункт"}
            </Button>
            <DrawerClose render={<Button className="min-h-12 text-base" variant="outline" type="button" disabled={busy} />}>
              Отмена
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function EntryList({ disabled, items, onAdd, onChange, onBlur, autoFocusIndex, readOnly, title }) {
  return (
    <section className="development-plan-editor__list-section">
      <header className="development-plan-editor__list-header">
        <h4>{title}</h4>
        {!readOnly && (
          <CareerIconAction label={`Добавить пункт в раздел «${title}»`} disabled={disabled} onClick={onAdd}>
            <Plus aria-hidden="true" />
          </CareerIconAction>
        )}
      </header>
      {items.length ? (
        <ul className="not-typeset development-plan-editor__list">
          {items.map((entry, index) => (
            <li key={index}>
              <InlineTextField singleLine autoFocus={autoFocusIndex === index} value={entry} label={`${title}: пункт ${index + 1}`} disabled={disabled || readOnly}
                onChange={value => onChange(index, value)} onBlur={onBlur} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="development-plan-editor__empty">Пунктов пока нет.</p>
      )}
    </section>
  );
}

export function DevelopmentPlan() {
  const sharing = useSphereSharing();
  const readOnly = sharing.readOnly || sharing.loading || Boolean(sharing.error);
  const [focusedEntry, setFocusedEntry] = useState(null);
  const [movingItem, setMovingItem] = useState("");
  const careerContent = useCareerContent("development", DEVELOPMENT_PLAN_SOURCE);
  const content = typeof careerContent.content === "string" ? careerContent.content : DEVELOPMENT_PLAN_SOURCE;
  const unavailable = readOnly || careerContent.loading || Boolean(careerContent.error);
  const initialPlan = useMemo(() => parseDevelopmentPlanMarkdown(content), [content]);
  const autosave = useDocumentDraft(initialPlan, async next => {
    if (next.groups.some(group => !group.title.trim() || group.items.some(item => !item.title.trim()))) {
      throw new Error("Названия групп и блоков не могут быть пустыми. Черновик сохранён.");
    }
    await careerContent.save(serializeDevelopmentPlanMarkdown(next));
  }, "career:development", !unavailable);
  const plan = autosave.draft;
  const updatePlan = (change) => autosave.change(current => {
    const next = structuredClone(current);
    change(next);
    return next;
  });
  const savePlan = async (groups) => {
    autosave.change({ groups });
    if (!await autosave.flush()) throw new Error("Не удалось сохранить изменения. Черновик сохранён на странице.");
  };

  const moveItem = async (fromGroupIndex, itemIndex, targetGroup) => {
    const toGroupIndex = Number(targetGroup);
    if (fromGroupIndex === toGroupIndex) return;
    const key = `${fromGroupIndex}-${itemIndex}`;
    setMovingItem(key);
    try {
      const nextPlan = moveDevelopmentPlanItem(plan, fromGroupIndex, itemIndex, toGroupIndex);
      await savePlan(nextPlan.groups);
      toast.success(`Блок перенесён в «${nextPlan.groups[toGroupIndex].title}»`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setMovingItem("");
    }
  };

  const listProps = (groupIndex, itemIndex, listKey) => ({
    disabled: unavailable,
    readOnly,
    onBlur: autosave.flush,
    onChange: (entryIndex, value) => updatePlan(next => { next.groups[groupIndex].items[itemIndex][listKey][entryIndex] = value; }),
    autoFocusIndex: focusedEntry?.groupIndex === groupIndex && focusedEntry?.itemIndex === itemIndex && focusedEntry?.listKey === listKey ? focusedEntry.entryIndex : undefined,
    onAdd: () => {
      setFocusedEntry({ groupIndex, itemIndex, listKey, entryIndex: plan.groups[groupIndex].items[itemIndex][listKey].length });
      updatePlan(next => { next.groups[groupIndex].items[itemIndex][listKey].push(""); });
    },
  });

  return (
    <div className="sphere-text-page page-stack">
      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />

      <article className="development-plan-editor typeset-document rollapp-body" aria-label="Индивидуальный план развития">
        {plan.groups.map((group, groupIndex) => (
          <section className="development-plan-editor__group" key={groupIndex}>
            <header className="development-plan-editor__group-header">
              <h2><InlineTextField singleLine value={group.title} label="Название группы" disabled={unavailable} onBlur={autosave.flush} onChange={value => updatePlan(next => { next.groups[groupIndex].title = value; })} /></h2>
              <p><InlineTextField value={group.intro} label="Описание группы" disabled={unavailable} onBlur={autosave.flush} onChange={value => updatePlan(next => { next.groups[groupIndex].intro = value; })} /></p>
            </header>
            <div className="development-plan-editor__cards">
              {group.items.map((item, itemIndex) => (
                <section className="development-plan-editor__card" key={itemIndex}>
                  <header className="development-plan-editor__card-header">
                    <div className="development-plan-editor__card-title-row">
                      <h3><InlineTextField singleLine value={item.title} label="Название блока" disabled={unavailable} onBlur={autosave.flush} onChange={value => updatePlan(next => { next.groups[groupIndex].items[itemIndex].title = value; })} /></h3>
                      {!readOnly && (
                        <div className="development-plan-editor__category-field">
                          <Select
                            value={String(groupIndex)}
                            disabled={careerContent.loading || Boolean(movingItem)}
                            onValueChange={(value) => moveItem(groupIndex, itemIndex, value)}
                          >
                            <SelectTrigger
                              className="development-plan-editor__category-trigger min-h-12 w-full text-base"
                              aria-label={`Категория блока «${item.title}»`}
                            >
                              {movingItem === `${groupIndex}-${itemIndex}` && <Spinner aria-hidden="true" />}
                              <SelectValue>{(value) => DEVELOPMENT_GROUP_LABELS[Number(value)] || plan.groups[Number(value)]?.title || "Выберите категорию"}</SelectValue>
                            </SelectTrigger>
                            <SelectContent
                              className="development-plan-editor__category-content"
                              align="start"
                              alignItemWithTrigger={false}
                            >
                              {plan.groups.map((category, categoryIndex) => (
                                <SelectItem
                                  className="development-plan-editor__category-option"
                                  value={String(categoryIndex)}
                                  key={`${categoryIndex}-${category.title}`}
                                >
                                  {DEVELOPMENT_GROUP_LABELS[categoryIndex] || category.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <p><InlineTextField value={item.summary} label="Описание блока" disabled={unavailable} onBlur={autosave.flush} onChange={value => updatePlan(next => { next.groups[groupIndex].items[itemIndex].summary = value; })} /></p>
                  </header>
                  <EntryList
                    {...listProps(groupIndex, itemIndex, "approach")}
                    title={item.approachTitle}
                    items={item.approach}
                  />
                  <EntryList
                    {...listProps(groupIndex, itemIndex, "actions")}
                    title={item.actionsTitle}
                    items={item.actions}
                  />
                </section>
              ))}
            </div>
          </section>
        ))}
      </article>
      {!unavailable && <InlineSaveStatus autosave={autosave} />}

    </div>
  );
}
