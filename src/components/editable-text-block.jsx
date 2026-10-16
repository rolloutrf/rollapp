import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Keep prose semantics, links and text selection. A visually hidden button
// supplies native keyboard activation without a separate visible edit control.
export function EditableTextBlock({ as: Component = "article", children, className, disabled = false, label, onEdit, ...props }) {
  const editable = typeof onEdit === "function";
  const editFromText = (event) => {
    if (disabled || event.target.closest?.('a, button, input, textarea, select, [role="button"], [contenteditable="true"]')) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.containsNode(event.currentTarget, true)) return;
    onEdit();
  };
  return <Component {...props}
    className={cn("relative min-w-0", editable && "focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-ring", editable && !disabled && "cursor-pointer", className)}
    data-editable-text={editable ? "" : undefined}
    onClick={editable ? editFromText : undefined}
  >
    {children}
    {editable && <Button className="sr-only" type="button" disabled={disabled} onClick={onEdit}>{label}</Button>}
  </Component>;
}
