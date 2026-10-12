import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Product composition for text actions. Keep the upstream Button defaults intact.
export function PageActionButton({ className, ...props }) {
  return <Button {...props} className={cn(className, "min-h-12 rounded-full px-6")} />;
}
