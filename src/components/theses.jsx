import { useEffect, useId, useState } from "react";
import { AlertTriangle, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { EditorDeleteAction } from "@/components/editor-delete-action";
import { CareerIconAction } from "@/components/career-icon-action";
import { SphereBusinessControls } from "@/components/business-marketplace-page";
import {
  CareerContentError, useCareerContent,
} from "@/components/career-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSphereSharing } from "@/lib/sphere-sharing";
import { parseThesesMarkdown, serializeThesesMarkdown } from "@/lib/theses";
import thesesSource from "@/data/theses.md?raw";

const STATEMENT_SECTIONS = {
  theses: {
    title: "Тезисы",
    item: "тезис",
    itemGenitive: "тезиса",
    newTitle: "Новый тезис",
    description: "Сформулируйте одну законченную мысль.",
    deletedDescription: "Тезис будет удалён без возможности восстановления.",
    added: "Тезис добавлен",
    updated: "Тезис обновлён",
    deleted: "Тезис удалён",
    emptyTitle: "Тезисов пока нет",
    emptyDescription: "Добавьте первую мысль, к которой хотите возвращаться.",
    emptyReadOnlyDescription: "Владелец пока не добавил тезисы.",
    source: thesesSource,
  },
  principles: {
    title: "Принципы",
    item: "принцип",
    itemGenitive: "принципа",
    newTitle: "Новый принцип",
    description: "Сформулируйте правило, на которое опираетесь в решениях и поступках.",
    deletedDescription: "Принцип будет удалён без возможности восстановления.",
    added: "Принцип добавлен",
    updated: "Принцип обновлён",
    deleted: "Принцип удалён",
    emptyTitle: "Принципов пока нет",
    emptyDescription: "Добавьте первый принцип, на который хотите опираться в решениях и поступках.",
    emptyReadOnlyDescription: "Владелец пока не добавил принципы.",
    source: "",
  },
};

function ThesisEditor({ initialValue = "", mode, onDelete, onOpenChange, onSave, open, section = "theses" }) {
  const labels = STATEMENT_SECTIONS[section];
  const isMobile = useIsMobile();
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;
  const [error, setError] = useState("");
  const editing = mode === "edit";

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
    const thesis = draft.trim();
    if (!thesis) {
      setError(`Напишите текст ${labels.itemGenitive}.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(thesis);
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
          aria-label={`Закрыть редактор ${labels.itemGenitive}`}
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? `Редактировать ${labels.item}` : labels.newTitle}</DrawerTitle>
            <DrawerDescription>{labels.description}</DrawerDescription>
          </DrawerHeader>
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить {labels.item}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor={fieldId}>Текст {labels.itemGenitive}</FieldLabel>
              <Textarea
                className="min-h-52 resize-y text-base"
                id={fieldId}
                maxLength={20_000}
                required
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <FieldDescription>Переносы строк внутри {labels.itemGenitive} сохраняются.</FieldDescription>
            </Field>
            {editing && onDelete && <EditorDeleteAction
              label={`Удалить ${labels.item}`}
              title={`Удалить этот ${labels.item}?`}
              description={labels.deletedDescription}
              disabled={saving}
              onBusyChange={setDeleting}
              onDelete={onDelete}
              onDeleted={() => onOpenChange(false)}
            />}
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={busy}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? "Сохранить изменения" : `Добавить ${labels.item}`}
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

export function Theses() {
  return <IdentityStatements section="theses" />;
}

export function Principles() {
  return <IdentityStatements section="principles" />;
}

function IdentityStatements({ section }) {
  const labels = STATEMENT_SECTIONS[section];
  const { readOnly } = useSphereSharing();
  const [editor, setEditor] = useState(null);
  const careerContent = useCareerContent(section, labels.source, "identity");
  const content = typeof careerContent.content === "string" ? careerContent.content : labels.source;
  const theses = parseThesesMarkdown(content, labels.title);
  const editingIndex = editor?.mode === "edit" ? editor.index : null;

  const saveTheses = (nextTheses) => careerContent.save(serializeThesesMarkdown(nextTheses));

  const saveThesis = async (thesis) => {
    if (editingIndex === null) {
      await saveTheses([...theses, thesis]);
      toast.success(labels.added);
      return;
    }
    await saveTheses(theses.map((item, index) => (index === editingIndex ? thesis : item)));
    toast.success(labels.updated);
  };

  const removeThesis = async () => {
    if (editingIndex === null) return;
    await saveTheses(theses.filter((_, index) => index !== editingIndex));
    toast.success(labels.deleted);
  };

  return (
    <div className="sphere-text-page page-stack">
      {!readOnly && <header className="not-typeset rollapp-body page-toolbar w-full justify-center">
        <div className="page-actions wishes-page__hero-actions horizontal-action-scroller" role="group" aria-label={`Действия раздела «${labels.title}»`}>
          <Button
            className="min-h-12 shrink-0 rounded-full bg-white px-6 text-base text-black hover:bg-white/90"
            type="button"
            disabled={careerContent.loading || Boolean(careerContent.error)}
            aria-label={`Добавить ${labels.item}`}
            onClick={() => setEditor({ mode: "add" })}
          >
            {careerContent.loading && <Spinner data-icon="inline-start" aria-hidden="true" />}
            Добавить
          </Button>
          <SphereBusinessControls sphereId="identity" />
        </div>
      </header>}

      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />

      {theses.length ? (
        <article className="life-strategy-source theses-source typeset typeset-rollapp typeset-document" aria-label={labels.title}>
          <div className="flex flex-col gap-6" data-typeset-group>
            {theses.map((thesis, index) => (
              <div className="group/thesis grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2" key={`${index}-${thesis}`}>
                <blockquote className="career-action-copy mt-0! min-w-0">
                  {thesis.split(/\n\s*\n/gu).map((paragraph, paragraphIndex) => (
                    <p className="whitespace-pre-line" key={paragraphIndex}>{paragraph}</p>
                  ))}
                </blockquote>
                {!readOnly && <div className="not-typeset flex shrink-0 items-center gap-1">
                  <CareerIconAction
                    disabled={careerContent.loading || Boolean(careerContent.error)}
                    label={`Редактировать ${labels.item} ${index + 1}`}
                    onClick={() => setEditor({ mode: "edit", index })}
                  >
                    <Pencil aria-hidden="true" />
                  </CareerIconAction>
                </div>}
              </div>
            ))}
          </div>
        </article>
      ) : (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyTitle>{labels.emptyTitle}</EmptyTitle>
            <EmptyDescription>{readOnly ? labels.emptyReadOnlyDescription : labels.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!readOnly && <ThesisEditor
        section={section}
        initialValue={editingIndex === null ? "" : theses[editingIndex] || ""}
        mode={editor?.mode || "add"}
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onDelete={readOnly ? undefined : removeThesis}
        onSave={saveThesis}
      />}
    </div>
  );
}
