import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { api } from "@/api";
import { MarkdownDocument } from "@/components/life-strategy";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

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
      <AlertAction>
        <Button variant="outline" size="sm" type="button" onClick={onRetry}>
          <RotateCcw data-icon="inline-start" aria-hidden="true" />
          Повторить
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function CareerEditAction({ disabled = false, loading = false, label, onClick }) {
  return (
    <header className="not-typeset rollapp-body flex min-h-12 w-full items-center justify-center">
      <div className="page-actions wishes-page__hero-actions" role="group" aria-label="Редактирование раздела">
        <Button
          className="h-12 min-w-[180px] px-6 text-base max-[560px]:min-w-0"
          shape="pill"
          type="button"
          disabled={disabled || loading}
          onClick={onClick}
        >
          {loading && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {loading ? "Загружаем" : label}
        </Button>
      </div>
    </header>
  );
}

function MarkdownEditorDrawer({ content, label, onOpenChange, onSave, open }) {
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
        className="rollapp-body"
        style={isMobile ? undefined : { "--drawer-content-width": "min(52rem, calc(100vw - 2rem))" }}
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

export function EditableMarkdownDocument({
  className = "", collapsibleAges = false, collapsibleStrategies = false,
  label, scope = "career", section, source,
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const careerContent = useCareerContent(section, source, scope);
  const content = typeof careerContent.content === "string" ? careerContent.content : source;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CareerEditAction
        label="Редактировать"
        loading={careerContent.loading}
        onClick={() => setEditorOpen(true)}
      />
      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />
      <MarkdownDocument
        source={content}
        label={label}
        className={className}
        collapsibleAges={collapsibleAges}
        collapsibleStrategies={collapsibleStrategies}
      />
      <MarkdownEditorDrawer
        content={content}
        label={label}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={careerContent.save}
      />
    </div>
  );
}
