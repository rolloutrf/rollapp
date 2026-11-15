import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

export function WishDeleteAlert({ open = true, wish, busy = false, onOpenChange, onConfirm }) {
  return <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onOpenChange?.(false); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Удалить «{wish.title}»?</AlertDialogTitle>
        <AlertDialogDescription>Желание исчезнет из всех списков. Отменить это действие не получится.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy || undefined} onClick={onConfirm}>{busy ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}Удалить</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
