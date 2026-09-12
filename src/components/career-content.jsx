import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Plus, RotateCcw, X } from "lucide-react";
import { api } from "@/api";
import { MarkdownDocument } from "@/components/life-strategy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSphereSharing } from "@/lib/sphere-sharing";
import {
  addLifeStrategyPeriod, getLifeStrategyPeriods, replaceLifeStrategyPeriod,
} from "@/lib/life-strategy";

export function useCareerContent(section, fallbackContent, scope = "career") {
  const fallbackRef = useRef(fallbackContent);
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState({
    content: fallbackRef.current,
    error: "",
    loading: true,
    updatedAt: null,
  });

  useEffect(() => {
    let current = true;
    setState((value) => ({ ...value, error: "", loading: true }));
    api.get(`/${scope}/content/${encodeURIComponent(section)}`).then((result) => {
      if (!current) return;
      setState({
        content: result.content ?? fallbackRef.current,
        error: "",
        loading: false,
        updatedAt: result.updatedAt || null,
      });
    }).catch((error) => {
      if (current) setState((value) => ({ ...value, error: error.message, loading: false }));
    });
    return () => { current = false; };
  }, [requestVersion, scope, section]);

  const save = async (content) => {
    if (state.loading || state.error) {
      throw new Error("Дождитесь загрузки сохранённого содержимого. При ошибке загрузки нажмите «Повторить».");
    }
    const result = await api.patch(`/${scope}/content/${encodeURIComponent(section)}`, { content });
    setState({ content: result.content, error: "", loading: false, updatedAt: result.updatedAt || null });
    return result.content;
  };

  return {
    ...state,
    retry: () => setRequestVersion((version) => version + 1),
    save,
  };
}

export function CareerContentError({ error, onRetry }) {
  if (!error) return null;
  return (
    <Alert className="not-typeset rollapp-body" variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>Не удалось загрузить сохранённое содержимое</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
      <div className="col-start-2 flex flex-wrap gap-2 pt-2">
        <Button variant="outline" size="sm" type="button" onClick={onRetry}>
          <RotateCcw data-icon="inline-start" aria-hidden="true" />
          Повторить
        </Button>
      </div>
    </Alert>
  );
}

export function CareerEditAction({ disabled = false, icon: Icon, loading = false, label, onClick }) {
  const { readOnly } = useSphereSharing();
  if (readOnly) return null;
  return (
    <header className="not-typeset rollapp-body page-toolbar w-full justify-center">
      <div className="page-actions wishes-page__hero-actions" role="group" aria-label="Редактирование раздела">
        <Button
          className="h-12 min-w-[180px] px-6 text-base max-[560px]:min-w-0"
          shape="pill"
          type="button"
          disabled={disabled || loading}
          onClick={onClick}
        >
          {loading
            ? <Spinner data-icon="inline-start" aria-hidden="true" />
            : Icon ? <Icon data-icon="inline-start" aria-hidden="true" /> : null}
          {loading ? "Загружаем" : label}
        </Button>
      </div>
    </header>
  );
}

export function MarkdownEditorDrawer({ content, label, onOpenChange, onSave, open }) {
  const isMobile = useIsMobile();
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(String(content || ""));
    setError("");
    setSaving(false);
  }, [content, open]);

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

  return (
    <Drawer open={open} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={changeOpen}>
      <DrawerContent
        className="rollapp-body app-drawer--document"
      >
        <DrawerClose
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />}
          aria-label={`Закрыть редактирование раздела «${label}»`}
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>Редактировать «{label}»</DrawerTitle>
            <DrawerDescription>Измените текст, заголовки, списки и ссылки раздела.</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить раздел</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor={fieldId}>Содержимое</FieldLabel>
              <Textarea
                className="min-h-[60vh] resize-y text-base"
                id={fieldId}
                maxLength={200_000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <FieldDescription>
                Поддерживаются заголовки с символом #, списки с дефисом, жирный текст **в звёздочках** и ссылки [название](https://…).
              </FieldDescription>
            </Field>
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

function LifeStrategyPeriodCreator({ onOpenChange, onSave, open }) {
  const isMobile = useIsMobile();
  const ageFieldId = useId();
  const contentFieldId = useId();
  const [age, setAge] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAge("");
    setDraft("");
    setSaving(false);
    setError("");
  }, [open]);

  const changeOpen = (nextOpen) => {
    if (!saving) onOpenChange(nextOpen);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ age, content: draft });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={changeOpen}>
      <DrawerContent className="rollapp-body app-drawer--document">
        <DrawerClose
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />}
          aria-label="Закрыть создание периода"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>Создать период</DrawerTitle>
            <DrawerDescription>Добавьте новый возрастной этап жизненной стратегии.</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось создать период</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor={ageFieldId}>Возраст</FieldLabel>
              <Input
                className="min-h-12 text-base"
                id={ageFieldId}
                inputMode="numeric"
                max="150"
                min="1"
                placeholder="Например, 45"
                required
                type="number"
                value={age}
                onChange={(event) => setAge(event.target.value)}
              />
              <FieldDescription>Период появится в списке в хронологическом порядке.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={contentFieldId}>Содержимое</FieldLabel>
              <Textarea
                className="min-h-[45vh] resize-y text-base"
                id={contentFieldId}
                maxLength={200_000}
                placeholder="Опишите цели, планы и ориентиры этого периода"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <FieldDescription>
                Поддерживаются заголовки с символом #, списки с дефисом, жирный текст **в звёздочках** и ссылки [название](https://…).
              </FieldDescription>
            </Field>
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" aria-hidden="true" /> : <Plus data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Создаём" : "Создать период"}
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

export function EditableMarkdownDocument({
  className = "", collapsibleAges = false, collapsibleStrategies = false,
  hideSourceLabels = false, label, scope = "career", section, source,
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [periodCreatorOpen, setPeriodCreatorOpen] = useState(false);
  const [periodEditorId, setPeriodEditorId] = useState(null);
  const careerContent = useCareerContent(section, source, scope);
  const content = typeof careerContent.content === "string" ? careerContent.content : source;
  const periods = collapsibleAges ? getLifeStrategyPeriods(content) : [];
  const editingPeriod = periods.find((period) => period.id === periodEditorId) || null;

  const editPeriod = (title) => {
    const period = periods.find((item) => item.title === title);
    if (period) setPeriodEditorId(period.id);
  };

  const savePeriod = async (draft) => {
    if (!editingPeriod) throw new Error("Период жизненной стратегии не найден");
    return careerContent.save(replaceLifeStrategyPeriod(content, editingPeriod.id, draft));
  };

  const createPeriod = ({ age, content: periodContent }) => (
    careerContent.save(addLifeStrategyPeriod(content, age, periodContent))
  );

  return (
    <div className="sphere-text-page page-stack">
      <CareerEditAction
        icon={collapsibleAges ? Plus : undefined}
        label={collapsibleAges ? "Создать период" : "Редактировать"}
        loading={careerContent.loading}
        onClick={() => collapsibleAges ? setPeriodCreatorOpen(true) : setEditorOpen(true)}
      />
      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />
      <MarkdownDocument
        source={content}
        label={label}
        className={className}
        collapsibleAges={collapsibleAges}
        collapsibleStrategies={collapsibleStrategies}
        ageEditDisabled={careerContent.loading}
        hideSourceLabels={hideSourceLabels}
        onEditAge={collapsibleAges ? editPeriod : undefined}
      />
      {collapsibleAges ? (
        <LifeStrategyPeriodCreator
          open={periodCreatorOpen}
          onOpenChange={setPeriodCreatorOpen}
          onSave={createPeriod}
        />
      ) : (
        <MarkdownEditorDrawer
          content={content}
          label={label}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSave={careerContent.save}
        />
      )}
      <MarkdownEditorDrawer
        content={editingPeriod?.content || ""}
        label={editingPeriod ? `Период ${editingPeriod.title}` : "Период жизни"}
        open={Boolean(editingPeriod)}
        onOpenChange={(open) => {
          if (!open) setPeriodEditorId(null);
        }}
        onSave={savePeriod}
      />
    </div>
  );
}
