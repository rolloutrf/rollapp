import { useEffect, useId, useState } from "react";
import { AlertTriangle, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  CareerContentError, MarkdownEditorDrawer, useCareerContent,
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSphereSharing } from "@/lib/sphere-sharing";
import { parseThesesMarkdown, serializeThesesMarkdown } from "@/lib/theses";
import thesesSource from "@/data/theses.md?raw";

function ThesisEditor({ initialValue = "", mode, onOpenChange, onSave, open }) {
  const isMobile = useIsMobile();
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = mode === "edit";

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
    const thesis = draft.trim();
    if (!thesis) {
      setError("Напишите текст тезиса.");
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
        className="rollapp-body"
        style={isMobile ? undefined : { "--drawer-content-width": "min(42rem, calc(100vw - 2rem))" }}
      >
        <DrawerClose
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />}
          aria-label="Закрыть редактор тезиса"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? "Редактировать тезис" : "Новый тезис"}</DrawerTitle>
            <DrawerDescription>Сформулируйте одну законченную мысль.</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить тезис</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor={fieldId}>Текст тезиса</FieldLabel>
              <Textarea
                className="min-h-52 resize-y text-base"
                id={fieldId}
                maxLength={20_000}
                required
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <FieldDescription>Переносы строк внутри тезиса сохраняются.</FieldDescription>
            </Field>
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? "Сохранить изменения" : "Добавить тезис"}
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

export function Theses() {
  const { readOnly } = useSphereSharing();
  const [editor, setEditor] = useState(null);
  const [wholeEditorOpen, setWholeEditorOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const careerContent = useCareerContent("theses", thesesSource, "identity");
  const content = typeof careerContent.content === "string" ? careerContent.content : thesesSource;
  const theses = parseThesesMarkdown(content);
  const editingIndex = editor?.mode === "edit" ? editor.index : null;

  const saveTheses = (nextTheses) => careerContent.save(serializeThesesMarkdown(nextTheses));

  const saveThesis = async (thesis) => {
    if (editingIndex === null) {
      await saveTheses([...theses, thesis]);
      toast.success("Тезис добавлен");
      return;
    }
    await saveTheses(theses.map((item, index) => (index === editingIndex ? thesis : item)));
    toast.success("Тезис обновлён");
  };

  const removeThesis = async () => {
    if (deleteIndex === null) return;
    setDeleting(true);
    try {
      await saveTheses(theses.filter((_, index) => index !== deleteIndex));
      setDeleteIndex(null);
      toast.success("Тезис удалён");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {!readOnly && <header className="not-typeset rollapp-body flex min-h-12 w-full items-center justify-center">
        <div className="page-actions wishes-page__hero-actions" role="group" aria-label="Управление тезисами">
          <Button
            className="h-12 min-w-[180px] px-6 text-base max-[560px]:min-w-0"
            shape="pill"
            type="button"
            disabled={careerContent.loading}
            onClick={() => setEditor({ mode: "add" })}
          >
            {careerContent.loading && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {careerContent.loading ? "Загружаем" : "Добавить тезис"}
          </Button>
          <Button
            className="h-12 min-w-[180px] px-6 text-base max-[560px]:min-w-0"
            shape="pill"
            variant="outline"
            type="button"
            disabled={careerContent.loading}
            onClick={() => setWholeEditorOpen(true)}
          >
            Редактировать всё
          </Button>
        </div>
      </header>}

      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />

      {theses.length ? (
        <article className="life-strategy-source theses-source typeset typeset-rollapp typeset-document" aria-label="Тезисы">
          <div className="flex flex-col gap-6" data-typeset-group>
            {theses.map((thesis, index) => (
              <div className="group/thesis grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2" key={`${index}-${thesis}`}>
                <blockquote className="mt-0! min-w-0">
                  {thesis.split(/\n\s*\n/gu).map((paragraph, paragraphIndex) => (
                    <p className="whitespace-pre-line" key={paragraphIndex}>{paragraph}</p>
                  ))}
                </blockquote>
                {!readOnly && <div className="not-typeset flex shrink-0 items-center gap-1">
                  <Button
                    className="size-12 rounded-full"
                    variant="ghost"
                    size="icon"
                    type="button"
                    disabled={careerContent.loading}
                    aria-label={`Редактировать тезис ${index + 1}`}
                    title="Редактировать тезис"
                    onClick={() => setEditor({ mode: "edit", index })}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    className="size-12 rounded-full"
                    variant="ghost"
                    size="icon"
                    type="button"
                    disabled={careerContent.loading}
                    aria-label={`Удалить тезис ${index + 1}`}
                    title="Удалить тезис"
                    onClick={() => setDeleteIndex(index)}
                  >
                    <Trash2 className="text-destructive" aria-hidden="true" />
                  </Button>
                </div>}
              </div>
            ))}
          </div>
        </article>
      ) : (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyTitle>Тезисов пока нет</EmptyTitle>
            <EmptyDescription>{readOnly ? "Владелец пока не добавил тезисы." : "Добавьте первую мысль, к которой хотите возвращаться."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!readOnly && <ThesisEditor
        initialValue={editingIndex === null ? "" : theses[editingIndex] || ""}
        mode={editor?.mode || "add"}
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSave={saveThesis}
      />}

      {!readOnly && <MarkdownEditorDrawer
        content={content}
        label="Тезисы"
        open={wholeEditorOpen}
        onOpenChange={setWholeEditorOpen}
        onSave={careerContent.save}
      />}

      {!readOnly && <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !deleting && !open && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить этот тезис?</AlertDialogTitle>
            <AlertDialogDescription>Тезис будет удалён без возможности восстановления.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={removeThesis}>
              {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Удалить тезис
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  );
}
