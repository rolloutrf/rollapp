import { useEffect, useId, useState } from "react";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

function generatedId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function replaceAt(items, index, value) {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

function removeAt(items, index) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

function emptyBlock(type = "paragraph") {
  return type === "paragraph" ? { type, text: "" } : { type, items: [""] };
}

function blockValue(block) {
  return block.type === "paragraph" ? block.text : block.items.join("\n");
}

function changeBlockType(block, type) {
  const value = blockValue(block);
  return type === "paragraph"
    ? { type, text: value }
    : { type, items: value.split("\n") };
}

function changeBlockValue(block, value) {
  return block.type === "paragraph"
    ? { ...block, text: value }
    : { ...block, items: value.split("\n") };
}

function ReviewBlocksEditor({ blocks, idPrefix, label, onChange }) {
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="m-0 text-sm font-medium">{label}</h5>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" type="button" onClick={() => onChange([...blocks, emptyBlock()])}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Абзац
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={() => onChange([...blocks, emptyBlock("unordered-list")])}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Список
          </Button>
        </div>
      </div>
      {!blocks.length && <p className="m-0 text-sm text-muted-foreground">Содержимое пока не добавлено.</p>}
      {blocks.map((block, index) => (
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border p-3" key={`${idPrefix}-block-${index}`}>
          <div className="flex items-center gap-2">
            <Select
              value={block.type}
              onValueChange={(type) => onChange(replaceAt(blocks, index, changeBlockType(block, type)))}
            >
              <SelectTrigger className="min-h-12 flex-1 text-base" aria-label={`Тип блока ${index + 1}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rollapp-body">
                <SelectItem value="paragraph">Абзац</SelectItem>
                <SelectItem value="unordered-list">Маркированный список</SelectItem>
                <SelectItem value="ordered-list">Нумерованный список</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="size-12 shrink-0"
              variant="ghost"
              size="icon"
              type="button"
              aria-label={`Удалить блок ${index + 1}`}
              onClick={() => onChange(removeAt(blocks, index))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
          <Textarea
            className="min-h-28 resize-y text-base"
            id={`${idPrefix}-block-${index}`}
            maxLength={20_000}
            placeholder={block.type === "paragraph" ? "Текст абзаца" : "Каждый пункт с новой строки"}
            value={blockValue(block)}
            onChange={(event) => onChange(replaceAt(blocks, index, changeBlockValue(block, event.target.value)))}
          />
        </div>
      ))}
    </section>
  );
}

function ReviewerEditor({ idPrefix, interaction = false, onChange, onRemove, reviewer }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="m-0 text-base font-medium">{reviewer.name || "Новый отзыв"}</h4>
        <Button variant="ghost" size="icon" type="button" aria-label="Удалить отзыв" onClick={onRemove}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <FieldGroup className="gap-4 sm:grid sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-name`}>Имя</FieldLabel>
          <Input
            className="min-h-12 text-base"
            id={`${idPrefix}-name`}
            maxLength={240}
            value={reviewer.name}
            onChange={(event) => onChange({ ...reviewer, name: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-role`}>Роль</FieldLabel>
          <Input
            className="min-h-12 text-base"
            id={`${idPrefix}-role`}
            maxLength={500}
            value={reviewer.role}
            onChange={(event) => onChange({ ...reviewer, role: event.target.value })}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`${idPrefix}-score`}>Оценка</FieldLabel>
          <Input
            className="min-h-12 text-base"
            id={`${idPrefix}-score`}
            maxLength={120}
            placeholder="Например, Выше ожиданий"
            value={reviewer.score}
            onChange={(event) => onChange({ ...reviewer, score: event.target.value })}
          />
        </Field>
      </FieldGroup>
      {interaction ? (
        <ReviewBlocksEditor
          blocks={reviewer.comment}
          idPrefix={`${idPrefix}-comment`}
          label="Комментарий"
          onChange={(comment) => onChange({ ...reviewer, comment })}
        />
      ) : (
        <>
          <ReviewBlocksEditor
            blocks={reviewer.positive}
            idPrefix={`${idPrefix}-positive`}
            label="Положительная обратная связь"
            onChange={(positive) => onChange({ ...reviewer, positive })}
          />
          <ReviewBlocksEditor
            blocks={reviewer.improve}
            idPrefix={`${idPrefix}-improve`}
            label="Что можно улучшить"
            onChange={(improve) => onChange({ ...reviewer, improve })}
          />
        </>
      )}
    </div>
  );
}

function ProjectEditor({ idPrefix, onChange, onRemove, project }) {
  const addSection = () => onChange({
    ...project,
    sections: [...project.sections, { label: "Новая секция", blocks: [emptyBlock()] }],
  });
  const addReviewer = () => onChange({
    ...project,
    reviewers: [...project.reviewers, { name: "", role: "", score: "", positive: [emptyBlock()], improve: [] }],
  });

  return (
    <div className="flex min-w-0 flex-col gap-5 py-2">
      <div className="flex items-end gap-2">
        <Field className="flex-1">
          <FieldLabel htmlFor={`${idPrefix}-title`}>Название проекта</FieldLabel>
          <Input
            className="min-h-12 text-base"
            id={`${idPrefix}-title`}
            maxLength={500}
            value={project.title}
            onChange={(event) => onChange({ ...project, title: event.target.value })}
          />
        </Field>
        <Button className="size-12 shrink-0" variant="ghost" size="icon" type="button" aria-label="Удалить проект" onClick={onRemove}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>

      <section className="flex min-w-0 flex-col gap-3" aria-label="Секции проекта">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="m-0 text-base font-medium">Секции результата</h4>
          <Button variant="outline" size="sm" type="button" onClick={addSection}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Добавить секцию
          </Button>
        </div>
        {project.sections.map((section, sectionIndex) => (
          <div className="flex min-w-0 flex-col gap-4 rounded-xl border p-4" key={`${idPrefix}-section-${sectionIndex}`}>
            <div className="flex items-end gap-2">
              <Field className="flex-1">
                <FieldLabel htmlFor={`${idPrefix}-section-${sectionIndex}-label`}>Заголовок секции</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${idPrefix}-section-${sectionIndex}-label`}
                  maxLength={500}
                  value={section.label}
                  onChange={(event) => onChange({
                    ...project,
                    sections: replaceAt(project.sections, sectionIndex, { ...section, label: event.target.value }),
                  })}
                />
              </Field>
              <Button
                className="size-12 shrink-0"
                variant="ghost"
                size="icon"
                type="button"
                aria-label={`Удалить секцию «${section.label || sectionIndex + 1}»`}
                onClick={() => onChange({ ...project, sections: removeAt(project.sections, sectionIndex) })}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
            <ReviewBlocksEditor
              blocks={section.blocks}
              idPrefix={`${idPrefix}-section-${sectionIndex}`}
              label="Содержимое секции"
              onChange={(blocks) => onChange({
                ...project,
                sections: replaceAt(project.sections, sectionIndex, { ...section, blocks }),
              })}
            />
          </div>
        ))}
      </section>

      <section className="flex min-w-0 flex-col gap-3" aria-label="Отзывы о проекте">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="m-0 text-base font-medium">Отзывы о проекте</h4>
          <Button variant="outline" size="sm" type="button" onClick={addReviewer}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Добавить отзыв
          </Button>
        </div>
        {project.reviewers.map((reviewer, reviewerIndex) => (
          <ReviewerEditor
            idPrefix={`${idPrefix}-reviewer-${reviewerIndex}`}
            key={`${idPrefix}-reviewer-${reviewerIndex}`}
            reviewer={reviewer}
            onChange={(nextReviewer) => onChange({
              ...project,
              reviewers: replaceAt(project.reviewers, reviewerIndex, nextReviewer),
            })}
            onRemove={() => onChange({ ...project, reviewers: removeAt(project.reviewers, reviewerIndex) })}
          />
        ))}
      </section>
    </div>
  );
}

export function PerformanceEditor({ activeCycleId, content, onOpenChange, onSave, open }) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(structuredClone(content));
    setSaving(false);
    setError("");
  }, [content, open]);

  const cycleIndex = Math.max(0, draft.cycles.findIndex((cycle) => cycle.id === activeCycleId));
  const cycle = draft.cycles[cycleIndex];
  const updateCycle = (nextCycle) => setDraft((value) => ({
    ...value,
    cycles: replaceAt(value.cycles, cycleIndex, nextCycle),
  }));
  const changeOpen = (nextOpen) => {
    if (!saving) onOpenChange(nextOpen);
  };
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };
  const addProject = () => updateCycle({
    ...cycle,
    projects: [...cycle.projects, {
      id: generatedId("project"),
      title: "Новый проект",
      sections: [{ label: "Что сделано?", blocks: [emptyBlock()] }],
      reviewers: [],
    }],
  });
  const addInteraction = () => updateCycle({
    ...cycle,
    interaction: [...cycle.interaction, { name: "", role: "", score: "", comment: [emptyBlock()] }],
  });

  return (
    <Drawer open={open} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={changeOpen}>
      <DrawerContent
        className="rollapp-body"
        style={isMobile ? undefined : { "--drawer-content-width": "min(60rem, calc(100vw - 2rem))" }}
      >
        <DrawerClose
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />}
          aria-label="Закрыть редактирование перфоманса"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>Редактировать перфоманс</DrawerTitle>
            <DrawerDescription>
              Редактируется выбранный цикл «{cycle.season} {cycle.year}», его проекты и обратная связь.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить перфоманс</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Tabs className="min-w-0 gap-4" defaultValue="main">
              <TabsList className="h-auto w-full justify-start overflow-x-auto" aria-label="Содержимое перфоманса">
                <TabsTrigger className="min-h-10 min-w-max px-3" value="main">Основное</TabsTrigger>
                <TabsTrigger className="min-h-10 min-w-max px-3" value="projects">Проекты</TabsTrigger>
                <TabsTrigger className="min-h-10 min-w-max px-3" value="interaction">Взаимодействие</TabsTrigger>
              </TabsList>

              <TabsContent className="flex min-w-0 flex-col gap-4" value="main">
                <Field>
                  <FieldLabel htmlFor={`${formId}-heading`}>Заголовок страницы</FieldLabel>
                  <Input
                    className="min-h-12 text-base"
                    id={`${formId}-heading`}
                    maxLength={240}
                    value={draft.heading}
                    onChange={(event) => setDraft((value) => ({ ...value, heading: event.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-description`}>Описание страницы</FieldLabel>
                  <Textarea
                    className="min-h-28 resize-y text-base"
                    id={`${formId}-description`}
                    maxLength={4_000}
                    value={draft.description}
                    onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))}
                  />
                </Field>
                <FieldGroup className="gap-4 sm:grid sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`${formId}-season`}>Название цикла</FieldLabel>
                    <Input
                      className="min-h-12 text-base"
                      id={`${formId}-season`}
                      required
                      maxLength={120}
                      value={cycle.season}
                      onChange={(event) => updateCycle({ ...cycle, season: event.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-year`}>Год</FieldLabel>
                    <Input
                      className="min-h-12 text-base"
                      id={`${formId}-year`}
                      type="number"
                      min={1900}
                      max={2200}
                      required
                      value={cycle.year}
                      onChange={(event) => updateCycle({ ...cycle, year: Number(event.target.value) })}
                    />
                  </Field>
                </FieldGroup>
                <FieldDescription>Чтобы изменить другой цикл, закройте форму и выберите его во вкладках страницы.</FieldDescription>
              </TabsContent>

              <TabsContent className="flex min-w-0 flex-col gap-3" value="projects">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 text-sm text-muted-foreground">Проектов в цикле: {cycle.projects.length}</p>
                  <Button variant="outline" type="button" onClick={addProject}>
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    Добавить проект
                  </Button>
                </div>
                <Accordion multiple>
                  {cycle.projects.map((project, projectIndex) => (
                    <AccordionItem key={project.id} value={project.id}>
                      <AccordionTrigger className="min-h-12 text-base">
                        {project.title || `Проект ${projectIndex + 1}`}
                      </AccordionTrigger>
                      <AccordionContent>
                        <ProjectEditor
                          idPrefix={`${formId}-project-${projectIndex}`}
                          project={project}
                          onChange={(nextProject) => updateCycle({
                            ...cycle,
                            projects: replaceAt(cycle.projects, projectIndex, nextProject),
                          })}
                          onRemove={() => updateCycle({ ...cycle, projects: removeAt(cycle.projects, projectIndex) })}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>

              <TabsContent className="flex min-w-0 flex-col gap-3" value="interaction">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 text-sm text-muted-foreground">Отзывов о взаимодействии: {cycle.interaction.length}</p>
                  <Button variant="outline" type="button" onClick={addInteraction}>
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    Добавить отзыв
                  </Button>
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                  {cycle.interaction.map((reviewer, reviewerIndex) => (
                    <ReviewerEditor
                      interaction
                      idPrefix={`${formId}-interaction-${reviewerIndex}`}
                      key={`${reviewer.name}-${reviewerIndex}`}
                      reviewer={reviewer}
                      onChange={(nextReviewer) => updateCycle({
                        ...cycle,
                        interaction: replaceAt(cycle.interaction, reviewerIndex, nextReviewer),
                      })}
                      onRemove={() => updateCycle({ ...cycle, interaction: removeAt(cycle.interaction, reviewerIndex) })}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : "Сохранить изменения"}
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
