import { useEffect, useId, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CareerIconAction } from "@/components/career-icon-action";
import {
  CareerContentError, CareerEditAction, MarkdownEditorDrawer, useCareerContent,
} from "@/components/career-content";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
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

function EntryEditor({ initialValue = "", onOpenChange, onSave, open }) {
  const isMobile = useIsMobile();
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(initialValue);

  useEffect(() => {
    if (!open) return;
    setDraft(initialValue);
    setSaving(false);
    setError("");
  }, [initialValue, open]);

  const changeOpen = (nextOpen) => {
    if (!saving) onOpenChange(nextOpen);
  };

  const submit = async (event) => {
    event.preventDefault();
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
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />}
          aria-label="Закрыть редактор пункта"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? "Редактировать пункт" : "Новый пункт"}</DrawerTitle>
            <DrawerDescription>Каждый пункт сохраняется отдельно от остальных.</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
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
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? "Сохранить изменения" : "Добавить пункт"}
            </Button>
            <DrawerClose render={<Button className="min-h-12 text-base" variant="outline" type="button" disabled={saving} />}>
              Отмена
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function EntryList({ disabled, items, onAdd, onDelete, onEdit, readOnly, title }) {
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
            <li key={`${index}-${entry}`}>
              <span>{entry}</span>
              {!readOnly && (
                <div className="not-typeset development-plan-editor__item-actions">
                  <CareerIconAction
                    disabled={disabled}
                    label={`Редактировать пункт ${index + 1}`}
                    onClick={() => onEdit(index)}
                  >
                    <Pencil aria-hidden="true" />
                  </CareerIconAction>
                  <CareerIconAction
                    disabled={disabled}
                    label={`Удалить пункт ${index + 1}`}
                    onClick={() => onDelete(index)}
                  >
                    <Trash2 className="text-destructive" aria-hidden="true" />
                  </CareerIconAction>
                </div>
              )}
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
  const { readOnly } = useSphereSharing();
  const [editor, setEditor] = useState(null);
  const [wholeEditorOpen, setWholeEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [movingItem, setMovingItem] = useState("");
  const careerContent = useCareerContent("development", DEVELOPMENT_PLAN_SOURCE);
  const content = typeof careerContent.content === "string" ? careerContent.content : DEVELOPMENT_PLAN_SOURCE;
  const plan = parseDevelopmentPlanMarkdown(content);
  const editingEntry = editor?.entryIndex === undefined
    ? ""
    : plan.groups[editor.groupIndex]?.items[editor.itemIndex]?.[editor.listKey]?.[editor.entryIndex] || "";

  const savePlan = (groups) => careerContent.save(serializeDevelopmentPlanMarkdown({ groups }));

  const saveEntry = async (value) => {
    if (!editor) return;
    const groups = plan.groups.map((group, groupIndex) => groupIndex !== editor.groupIndex ? group : {
      ...group,
      items: group.items.map((item, itemIndex) => {
        if (itemIndex !== editor.itemIndex) return item;
        const entries = item[editor.listKey];
        return {
          ...item,
          [editor.listKey]: editor.entryIndex === undefined
            ? [...entries, value]
            : entries.map((entry, entryIndex) => entryIndex === editor.entryIndex ? value : entry),
        };
      }),
    });
    await savePlan(groups);
    toast.success(editor.entryIndex === undefined ? "Пункт добавлен" : "Пункт обновлён");
  };

  const removeEntry = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const groups = plan.groups.map((group, groupIndex) => groupIndex !== deleteTarget.groupIndex ? group : {
        ...group,
        items: group.items.map((item, itemIndex) => itemIndex !== deleteTarget.itemIndex ? item : {
          ...item,
          [deleteTarget.listKey]: item[deleteTarget.listKey]
            .filter((_, entryIndex) => entryIndex !== deleteTarget.entryIndex),
        }),
      });
      await savePlan(groups);
      setDeleteTarget(null);
      toast.success("Пункт удалён");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
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
    disabled: careerContent.loading,
    readOnly,
    onAdd: () => setEditor({ groupIndex, itemIndex, listKey }),
    onEdit: (entryIndex) => setEditor({ groupIndex, itemIndex, listKey, entryIndex }),
    onDelete: (entryIndex) => setDeleteTarget({ groupIndex, itemIndex, listKey, entryIndex }),
  });

  return (
    <div className="sphere-text-page page-stack">
      <CareerEditAction
        label="Редактировать"
        loading={careerContent.loading}
        showLabel
        onClick={() => setWholeEditorOpen(true)}
      />
      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />

      <article className="development-plan-editor rollapp-body" aria-label="Индивидуальный план развития">
        {plan.groups.map((group, groupIndex) => (
          <section className="development-plan-editor__group" key={`${groupIndex}-${group.title}`}>
            <header className="development-plan-editor__group-header">
              <h2>{group.title}</h2>
              {group.intro && <p>{group.intro}</p>}
            </header>
            <div className="development-plan-editor__cards">
              {group.items.map((item, itemIndex) => (
                <section className="development-plan-editor__card" key={`${itemIndex}-${item.title}`}>
                  <header className="development-plan-editor__card-header">
                    <div className="development-plan-editor__card-title-row">
                      <h3>{item.title}</h3>
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
                    {item.summary && <p>{item.summary}</p>}
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

      {!readOnly && (
        <EntryEditor
          initialValue={editingEntry}
          open={Boolean(editor)}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onSave={saveEntry}
        />
      )}
      {!readOnly && (
        <MarkdownEditorDrawer
          content={content}
          label="Индивидуальный план развития"
          open={wholeEditorOpen}
          onOpenChange={setWholeEditorOpen}
          onSave={careerContent.save}
        />
      )}
      {!readOnly && (
        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить этот пункт?</AlertDialogTitle>
              <AlertDialogDescription>Пункт будет удалён без возможности восстановления.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={deleting} onClick={removeEntry}>
                {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
                Удалить пункт
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
