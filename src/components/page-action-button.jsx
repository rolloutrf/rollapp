import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Product composition for text actions. Keep the upstream Button defaults intact.
export function PageActionButton({ className, to, variant, size, ...props }) {
  const classes = cn(className, "min-h-(--layout-control-size) rounded-full px-6 has-data-[icon=inline-start]:pl-6 has-data-[icon=inline-end]:pr-6");
  if (to) return <Link {...props} to={to} data-slot="button" data-page-action="" className={cn(buttonVariants({ variant, size }), classes)} />;
  return <Button {...props} variant={variant} size={size} data-page-action="" className={classes} />;
}
