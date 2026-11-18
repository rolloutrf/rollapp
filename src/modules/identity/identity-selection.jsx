import { useCallback, useMemo } from "react";
import { useSphereSharing } from "@/modules/access/sphere-sharing.jsx";
import { useCareerContent } from "@/modules/career/career-content.jsx";
import { useInlineAutosave } from "@/modules/rich-documents/use-inline-autosave.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Reopening a tab must read after the previous instance finishes writing.
const pendingSelections = new Map();

export function useIdentitySelection(section, fallback, normalize) {
  const access = useSphereSharing();
  const storageKey = access.owner?.id ? `rollapp:identity-selection:${access.owner.id}:${section}` : undefined;
  const beforeLoad = useCallback(() => pendingSelections.get(storageKey), [storageKey]);
  const document = useCareerContent(section, fallback, "identity", beforeLoad);
  const value = useMemo(() => normalize(document.content), [document.content, normalize]);
  const disabled = access.readOnly || access.loading || Boolean(access.error) || document.loading || Boolean(document.error);
  const autosave = useInlineAutosave({ value, onSave: document.save, storageKey, enabled: !disabled });

  const flush = (retry = false) => {
    const pending = autosave.flush(retry);
    if (storageKey && pendingSelections.get(storageKey) !== pending) {
      pendingSelections.set(storageKey, pending);
      void pending.then(() => {
        if (pendingSelections.get(storageKey) === pending) pendingSelections.delete(storageKey);
      });
    }
    return pending;
  };
  const change = (update) => {
    if (disabled) return;
    autosave.change(update);
    void flush();
  };

  return { document, draft: disabled ? value : autosave.draft, disabled, change, status: autosave.status, error: autosave.error, flush };
}

export function IdentitySelectionFeedback({ selection }) {
  if (selection.disabled) return null;
  if (selection.status === "error") return (
    <Alert variant="destructive">
      <AlertTitle>Не удалось сохранить выбор</AlertTitle>
      <AlertDescription>{selection.error}</AlertDescription>
      <Button type="button" variant="outline" className="min-h-12 rounded-full justify-self-start" onClick={() => void selection.flush(true)}>
        Повторить сохранение
      </Button>
    </Alert>
  );
  return <span className="sr-only" role="status">{selection.status === "saving" ? "Сохраняем выбор…" : "Выбор сохранён"}</span>;
}
