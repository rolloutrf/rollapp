import { useEffect, useId, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
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

const STRENGTHS = [
  {
    title: "Управление и влияние",
    summary: "Gallup (Command, Self-Assurance) и TalentBot («Командир») показывают способность брать ответственность, быстро принимать решения и вести людей за собой.",
    approachTitle: "Как использовать",
    approach: [
      "Нарастить количество стратегических инициатив и быть в них драйвером.",
      "Сформировать целевой образ (ценность / CJM / UI) конфигурации ключевых сервисов.",
      "Лидировать кросс-функциональные проекты внутри Финтеха.",
    ],
    actions: [
      "Развить стратегический трек «От транзакции к человекоцентричности» через визуализацию и реализацию концепции.",
      "Проработать идею формирования финансовых бандлов.",
      "Сформировать ритмичный план социализации решений дизайн-команды на разных площадках: Disco Demo, All Hands и Avito Live.",
    ],
  },
  {
    title: "Фокус и результативность",
    summary: "Высокая ориентация на достижение — Gallup (Focus, Achiever), TalentBot («Фокусировка», «Результативность») — помогает доводить проекты до конца и держать команду в тонусе.",
    approachTitle: "Как использовать",
    approach: [
      "Инициировать проекты по повышению операционной эффективности и устранению неэффективных процессов в дизайн-департаменте.",
      "Кристаллизовать стандарты качества дизайна и инициировать их внедрение.",
      "Найти процессы, которые можно автоматизировать, и определить прикладное применение ИИ.",
    ],
    actions: [
      "Завершить платформизацию ключевых модулей Авито и встроить этот этап в процесс дизайн-департамента.",
      "Довести сквозное промотирование до технической реализации коммуникационной платформы.",
      "Реализовать коммуникационную стратегию Финтеха совместно с маркетингом.",
      "Проработать концепцию золотой записи, централизованной идентификации и обогащения встраиваемых анкет.",
    ],
  },
  {
    title: "Обучаемость и аналитика",
    summary: "Gallup ставит Learner и Analytical в топ, Hogan подтверждает любознательность, а TalentBot показывает «Логику» и «Улучшателя».",
    approachTitle: "Как использовать",
    approach: [
      "Усилить анализ рыночных трендов и на его основе формировать стратегические инициативы.",
      "Подготовить отраслевой курс по Финтеху и систематизировать накопленные за 10 лет знания в индустрии.",
      "Повысить экспертную и консалтинговую активность внутри компании для лучшего понимания картины рынка.",
    ],
    actions: [
      "На основе отраслевых заметок разметить свою базу Obsidian.",
      "Систематизировать знания по Финтеху и упаковать их в ряд лекций: транзакции, кошельки и карты, идентификация, лояльность.",
      "Глубоко изучить новые спецификации Центрального банка: цифровой рубль, Open API и цифровые финансовые активы.",
      "Собрать группу отраслевых единомышленников для открытого индустриального диалога.",
    ],
  },
];

const DEVELOPMENT_AREAS = [
  {
    title: "Межличностная восприимчивость и эмпатия",
    summary: "Hogan показывает сниженные показатели межличностной восприимчивости. Я часто бываю прямолинеен, резок и могу казаться отстранённым в вопросах, которые не затрагивают меня напрямую.",
    approachTitle: "Как прокачивать",
    approach: [
      "Снизить количество директивной коммуникации и перейти к формату открытых вопросов.",
      "Высказывать своё мнение в последнюю очередь, предоставляя каждому участнику дизайн-команды возможность высказаться.",
      "Занимать не больше 30% эфира в командных коммуникациях.",
      "Адаптировать стиль коммуникации под разных собеседников.",
      "Отслеживать корреляцию между моим стилем общения и результатами команды.",
    ],
    actions: [
      "Передать ведение командных встреч дизайнерам: участники сами формируют повестку и ведут беседу, мои высказывания — в конце встречи.",
      "Увеличить долю мотивирующей коммуникации, в первую очередь отмечая результаты и успехи дизайнеров.",
      "Разделить тон и повестку коммуникации с пирами-менеджерами и подчинёнными.",
      "Организовать регулярный Open Hour в начале недели для знакомств с участниками дизайн- и финтех-комьюнити.",
    ],
  },
  {
    title: "Управление стрессом и эмоциональными реакциями",
    summary: "Hogan выявляет высокие риски по шкалам «Эмоциональный» и «Сам в себе». В стрессе это может проявляться как изоляция или раздражительность.",
    approachTitle: "Как прокачивать",
    approach: [
      "Внедрить привычку отложенной реакции в коммуникации с провокационным подтекстом.",
      "Снизить плотность переговоров по конфликтным проектам, равномерно распределив их по таймлайну.",
      "Планировать буферное время между интенсивными встречами для восстановления.",
      "Вести краткий журнал триггеров стресса и разбивать стрессовые ситуации на управляемые части.",
    ],
    actions: [
      "Сфокусироваться на четырёх ключевых проектах, за результат которых я отвечаю: Финансовый кабинет, ОФП, Платформизация и Сквозное промотирование. Остальное — делегировать.",
      "Внедрить часовые утренние сессии для сфокусированной самостоятельной работы над стратегическими вопросами два раза в неделю.",
      "Выйти из очных встреч, где моя роль — Informed, и увеличить количество очных встреч, где моя роль — Driver.",
    ],
  },
  {
    title: "Гибкость и адаптивность",
    summary: "Обратная сторона сильных качеств — фокуса, структурированности и командного подхода — может превращаться в жёсткость, когда ситуация требует гибкости.",
    approachTitle: "Как прокачивать",
    approach: [
      "Тренировать технику динамического планирования с учётом изменения контекста.",
      "Дать участникам команды больше ответственности за свои направления и свободы в выборе тактических действий.",
      "Анализировать ситуации, в которых гибкость дала лучший результат, чем жёсткое следование плану.",
      "Планировать время для пересмотра курса и обкатки новых методов управления.",
    ],
    actions: [
      "Передать фасилитацию большей части регулярных встреч ключевым участникам команды: Internal Design Sync и Interface Product Sync.",
      "Доверить принятие решений по некритичным вопросам дизайнерам направлений и ослабить личный контроль в сформировавшихся проектах — кредитах и кошельке.",
      "Для новых направлений планировать тактические развилки на случай, если основной сценарий не сработает: сквозное промо и финансовый маркетплейс.",
    ],
  },
];

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

const DEVELOPMENT_PLAN_SOURCE = [
  "## Сильные стороны, которые стоит усиливать",
  "То, что уже помогает брать ответственность, держать фокус и превращать сложный контекст в понятную систему действий.",
  planItemsMarkdown(STRENGTHS),
  "## Зоны развития, которые стоит прокачать",
  "Поведенческие практики, которые помогут сохранять результативность, расширяя доверие, устойчивость и свободу команды.",
  planItemsMarkdown(DEVELOPMENT_AREAS),
].join("\n\n");

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
        className="rollapp-body"
        style={isMobile ? undefined : { "--drawer-content-width": "min(42rem, calc(100vw - 2rem))" }}
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
          <Button variant="outline" type="button" disabled={disabled} onClick={onAdd}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Добавить пункт
          </Button>
        )}
      </header>
      {items.length ? (
        <ul className="development-plan-editor__list">
          {items.map((entry, index) => (
            <li key={`${index}-${entry}`}>
              <span>{entry}</span>
              {!readOnly && (
                <div className="not-typeset development-plan-editor__item-actions">
                  <Button
                    className="size-12 rounded-full"
                    variant="ghost"
                    size="icon"
                    type="button"
                    disabled={disabled}
                    aria-label={`Редактировать пункт ${index + 1}`}
                    title="Редактировать пункт"
                    onClick={() => onEdit(index)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    className="size-12 rounded-full"
                    variant="ghost"
                    size="icon"
                    type="button"
                    disabled={disabled}
                    aria-label={`Удалить пункт ${index + 1}`}
                    title="Удалить пункт"
                    onClick={() => onDelete(index)}
                  >
                    <Trash2 className="text-destructive" aria-hidden="true" />
                  </Button>
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
    <div className="flex min-w-0 flex-col gap-6">
      <CareerEditAction
        label="Редактировать всё"
        loading={careerContent.loading}
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
                              <SelectValue>{(value) => plan.groups[Number(value)]?.title || "Выберите категорию"}</SelectValue>
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
                                  {category.title}
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
