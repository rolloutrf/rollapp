import { Layers3, X } from "lucide-react";
import { FullscreenDialog } from "@/components/fullscreen-dialog";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function GroupDialog({ className, ...props }) {
  return <FullscreenDialog className={cn("app-group-dialog", className)} {...props} />;
}

export function GroupDialogHeader({ title, description, actions, busy = false }) {
  return <header className="app-group-dialog__header">
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Layers3 className="size-5" aria-hidden="true" />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        {typeof title === "string" ? <strong className="truncate text-base font-semibold">{title}</strong> : title}
        <small className="text-sm text-muted-foreground">{description}</small>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2 [&_[data-slot=button]]:size-12">
      {actions}
      <DialogClose render={<Button className="size-12 rounded-full" variant="ghost" size="icon" type="button" disabled={busy} />} aria-label="Закрыть группу">
        <X aria-hidden="true" />
      </DialogClose>
    </div>
  </header>;
}
