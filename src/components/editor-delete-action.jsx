import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function EditorDeleteAction({ description, disabled, label, onBusyChange, onDelete, onDeleted, title }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const changeOpen = (nextOpen) => {
    if (deleting) return;
    setError("");
    setOpen(nextOpen);
  };

  const remove = async () => {
    if (disabled || deleting) return;
    setDeleting(true);
    onBusyChange(true);
    setError("");
    try {
      await onDelete();
      setOpen(false);
      onDeleted();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeleting(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="border-t pt-4">
      <AlertDialog open={open} onOpenChange={changeOpen}>
        <AlertDialogTrigger render={<Button className="w-full" variant="destructive" type="button" disabled={disabled || deleting} />}>
          <Trash2 data-icon="inline-start" aria-hidden="true" />
          {label}
        </AlertDialogTrigger>
        <AlertDialogContent className="rollapp-body">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Не удалось удалить</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction type="button" variant="destructive" disabled={disabled || deleting} onClick={remove}>
              {deleting ? <Spinner data-icon="inline-start" aria-hidden="true" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              {deleting ? "Удаляем" : label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
