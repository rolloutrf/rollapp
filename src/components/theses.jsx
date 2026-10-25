import { useEffect, useId, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { InlineDocument } from "@/components/inline-document";
import { ControlBar } from "@/components/control-bar";
import { EditorDeleteAction } from "@/components/editor-delete-action";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { useSphereSharing } from "@/lib/sphere-sharing";

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
    source: "",
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
          </div>
          <ControlBar as={DrawerFooter} className="flex-row items-center gap-2 border-t pt-4">
            <Button className="min-h-12 min-w-0 flex-1 text-base" type="submit" aria-label={editing ? "Сохранить изменения" : `Добавить ${labels.item}`} disabled={busy}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? (isMobile ? "Сохранить" : "Сохранить изменения") : `Добавить ${labels.item}`}
            </Button>
            {editing && onDelete && <EditorDeleteAction compact
              label={`Удалить ${labels.item}`}
              title={`Удалить этот ${labels.item}?`}
              description={labels.deletedDescription}
              disabled={saving}
              onBusyChange={setDeleting}
              onDelete={onDelete}
              onDeleted={() => onOpenChange(false)}
            />}
            {!isMobile && <DrawerClose render={<Button className="min-h-12 text-base" variant="outline" type="button" disabled={busy} />}>
              Отмена
            </DrawerClose>}
          </ControlBar>
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
  const sharing = useSphereSharing();
  const careerContent = useCareerContent(section, labels.source, "identity");
  const content = typeof careerContent.content === "string" ? careerContent.content : labels.source;
  return <div className="sphere-text-page page-stack">
    <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />
    {careerContent.loading && <span role="status">Загружаем…</span>}
    {!careerContent.loading && !careerContent.error && <InlineDocument key={`${section}:${sharing.owner?.id || "self"}`}
      documentKey={`identity:${section}`} value={content} onSave={careerContent.save} label={labels.title}
      readOnly={sharing.readOnly || sharing.loading || Boolean(sharing.error)}
      placeholder={labels.description} className="theses-source"
      addBlock={{ type: "blockquote", content: [{ type: "paragraph" }] }} />}
  </div>;
}
