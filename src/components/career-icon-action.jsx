import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CareerIconAction({ children, className, label, ...props }) {
  return (
    <Button
      className={cn(
        "career-icon-action not-typeset rollapp-body size-12 shrink-0 rounded-full [&_svg:not([class*='size-'])]:size-5",
        className,
      )}
      variant="outline"
      size="icon"
      type="button"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}
