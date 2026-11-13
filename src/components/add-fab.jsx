import { useRef } from "react";
import { Plus } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function AddFab({ actions, disabled = false, triggerRef: externalRef }) {
  const internalRef = useRef(null);
  const triggerRef = externalRef || internalRef;
  const pendingAction = useRef(null);
  const available = actions.filter(Boolean);
  if (!available.length) return null;
  const [primary] = available;
  const multiple = available.length > 1;
  const label = multiple ? "Добавить" : primary.label;
  const trigger = <Button ref={triggerRef} data-control-icon type="button" size="icon" className="shadow-lg"
    aria-label={label} title={label} disabled={disabled || available.every(action => action.disabled)}
    onClick={multiple ? undefined : (event) => {
      event.currentTarget.focus({ preventScroll: true });
      primary.onSelect();
    }}><Plus aria-hidden="true" /></Button>;

  return <ControlBar className="add-fab not-typeset" data-add-fab="">
    {multiple ? <DropdownMenu modal={false} onOpenChange={(open) => {
      if (open) pendingAction.current = null;
    }} onOpenChangeComplete={(open) => {
      if (open || !pendingAction.current) return;
      const action = pendingAction.current;
      pendingAction.current = null;
      const button = triggerRef.current;
      if (!button || button.disabled) return;
      // Let the menu finish before handing focus to a form and its opener.
      button.focus({ preventScroll: true });
      action();
    }}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" side="top" sideOffset={8}
        className="add-fab__menu rollapp-body w-max min-w-48 max-w-(--available-width)">
        {available.map(({ label, icon: Icon = Plus, onSelect, disabled }) =>
          <DropdownMenuItem key={label} disabled={disabled} onClick={() => { pendingAction.current = onSelect; }} className="min-h-12 gap-2 px-3">
            <Icon aria-hidden="true" /><span>{label}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu> : trigger}
  </ControlBar>;
}
