import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Product composition for text actions. Keep the upstream Button defaults intact.
export function PageActionButton({ className, ...props }) {
  return <Button {...props} data-page-action="" className={cn(className, "min-h-(--layout-control-size) rounded-full px-6 has-data-[icon=inline-start]:pl-6 has-data-[icon=inline-end]:pr-6")} />;
}
