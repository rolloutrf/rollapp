import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Full-screen composition of the shared Dialog. Nested sibling drawers can
// suspend its focus trap while keeping the current screen mounted.
export function FullscreenDialog({ busy = false, suspended = false, onClose, className, children, ...props }) {
  return (
    <Dialog
      open
      modal={!suspended}
      disablePointerDismissal
      onOpenChange={(open, details) => {
        if (!open && !busy && !suspended) onClose();
        else details.cancel();
      }}
    >
      <DialogContent
        className={cn("app-fullscreen-dialog app-layout--dark inset-0! block h-dvh! max-h-none! w-full! max-w-none! translate-none! transform-none! rounded-none bg-background p-0! ring-0 data-open:animate-none data-closed:animate-none", className)}
        showCloseButton={false}
        {...props}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
