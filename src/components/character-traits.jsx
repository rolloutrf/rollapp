import { useEffect, useId, useState } from "react";
import { AlertTriangle, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SphereBusinessControls } from "@/components/business-marketplace-page";
import { CareerIconAction } from "@/components/career-icon-action";
import { CareerContentError, useCareerContent } from "@/components/career-content";
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSphereSharing } from "@/lib/sphere-sharing";

const EMPTY_CHARACTER_TRAITS = [];
const EMPTY_CHARACTER_TRAIT = { title: "", description: "" };

function normalizeCharacterTrait(trait) {
  if (typeof trait === "string") return { title: trait.trim(), description: "" };
  if (!trait || typeof trait !== "object" || Array.isArray(trait)) return null;
  const title = typeof trait.title === "string" ? trait.title.trim() : "";
  const description = typeof trait.description === "string" ? trait.description.trim() : "";
  return title ? { title, description } : null;
}

function CharacterTraitEditor({ initialValue = EMPTY_CHARACTER_TRAIT, mode, onOpenChange, onSave, open }) {
  const isMobile = useIsMobile();
  const fieldId = useId();
  const [draft, setDraft] = useState(EMPTY_CHARACTER_TRAIT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = mode === "edit";

  useEffect(() => {
    if (!open) return;
    setDraft({
      title: initialValue?.title || "",
      description: initialValue?.description || "",
    });
    setSaving(false);
    setError("");
  }, [initialValue, open]);

  const changeOpen = (nextOpen) => {
    if (!saving) onOpenChange(nextOpen);
  };

  const submit = async (event) => {
    event.preventDefault();
    const title = draft.title.trim();
    const description = draft.description.trim();
    if (!title) {
      setError("Укажите название черты характера.");
      return;
    }
    if (!description) {
      setError("Добавьте описание черты характера.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ title, description });
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
          aria-label="Закрыть редактор черты характера"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? "Редактировать черту характера" : "Новая черта характера"}</DrawerTitle>
            <DrawerDescription>Опишите одно устойчивое качество или привычный способ проявлять себя.</DrawerDescription>
          </DrawerHeader>
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить черту характера</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor={`${fieldId}-title`}>Название</FieldLabel>
              <Input
                id={`${fieldId}-title`}
                maxLength={120}
                placeholder="Например, Креативность"
                required
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              />
              <FieldDescription>Коротко назовите качество.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-description`}>Описание</FieldLabel>
              <Textarea
                className="min-h-52 resize-y text-base"
                id={`${fieldId}-description`}
                maxLength={20_000}
                required
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              />
              <FieldDescription>Переносы строк внутри описания сохраняются.</FieldDescription>
            </Field>
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? "Сохранить изменения" : "Добавить черту"}
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

export function CharacterTraits() {
  const { readOnly } = useSphereSharing();
  const [editor, setEditor] = useState(null);
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const characterContent = useCareerContent("character", EMPTY_CHARACTER_TRAITS, "identity");
  const traits = Array.isArray(characterContent.content)
    ? characterContent.content.map(normalizeCharacterTrait).filter(Boolean)
    : EMPTY_CHARACTER_TRAITS;
  const editingIndex = editor?.mode === "edit" ? editor.index : null;

  const saveTrait = async (trait) => {
    if (editingIndex === null) {
      await characterContent.save([...traits, trait]);
      toast.success("Черта характера добавлена");
      return;
    }
    await characterContent.save(traits.map((item, index) => (index === editingIndex ? trait : item)));
    toast.success("Черта характера обновлена");
  };

  const removeTrait = async () => {
    if (deleteIndex === null) return;
    setDeleting(true);
    try {
      await characterContent.save(traits.filter((_, index) => index !== deleteIndex));
      setDeleteIndex(null);
      toast.success("Черта характера удалена");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="sphere-text-page page-stack">
      {!readOnly && <header className="not-typeset rollapp-body page-toolbar w-full justify-center">
        <div className="page-actions wishes-page__hero-actions horizontal-action-scroller" role="group" aria-label="Действия раздела «Характер»">
          <Button
            className="min-h-12 shrink-0 rounded-full bg-white px-6 text-base text-black hover:bg-white/90"
            type="button"
            disabled={characterContent.loading}
            aria-label="Добавить черту характера"
            onClick={() => setEditor({ mode: "add" })}
          >
            {characterContent.loading && <Spinner data-icon="inline-start" aria-hidden="true" />}
            Добавить
          </Button>
          <SphereBusinessControls sphereId="identity" />
        </div>
      </header>}

      <CareerContentError error={characterContent.error} onRetry={characterContent.retry} />

      {traits.length ? (
        <article className="life-strategy-source typeset typeset-rollapp typeset-document" aria-label="Черты характера">
          <div className="flex flex-col gap-6" data-typeset-group role="list">
            {traits.map((trait, index) => (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2" key={`${index}-${trait.title}`} role="listitem">
                <div className="min-w-0" data-typeset-group>
                  <h3>{trait.title}</h3>
                  {trait.description
                    ? trait.description.split(/\n\s*\n/gu).map((paragraph, paragraphIndex) => (
                      <p className="whitespace-pre-line" key={paragraphIndex}>{paragraph}</p>
                    ))
                    : <p className="text-muted-foreground">Описание не добавлено.</p>}
                </div>
                {!readOnly && <div className="not-typeset flex shrink-0 items-center gap-1">
                  <CareerIconAction
                    disabled={characterContent.loading}
                    label={`Редактировать черту характера ${index + 1}`}
                    onClick={() => setEditor({ mode: "edit", index })}
                  >
                    <Pencil aria-hidden="true" />
                  </CareerIconAction>
                  <CareerIconAction
                    disabled={characterContent.loading}
                    label={`Удалить черту характера ${index + 1}`}
                    onClick={() => setDeleteIndex(index)}
                  >
                    <Trash2 className="text-destructive" aria-hidden="true" />
                  </CareerIconAction>
                </div>}
              </div>
            ))}
          </div>
        </article>
      ) : (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyTitle>Черт характера пока нет</EmptyTitle>
            <EmptyDescription>{readOnly ? "Владелец пока не добавил черты характера." : "Добавьте первую черту, которая описывает ваш характер."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!readOnly && <CharacterTraitEditor
        initialValue={editingIndex === null ? EMPTY_CHARACTER_TRAIT : traits[editingIndex] || EMPTY_CHARACTER_TRAIT}
        mode={editor?.mode || "add"}
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSave={saveTrait}
      />}

      {!readOnly && <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !deleting && !open && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить эту черту характера?</AlertDialogTitle>
            <AlertDialogDescription>Черта будет удалена без возможности восстановления.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={removeTrait}>
              {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Удалить черту
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  );
}
