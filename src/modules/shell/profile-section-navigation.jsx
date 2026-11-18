import { Link } from "react-router-dom";
import { ControlBar } from "@/components/control-bar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProfileSectionNavigation({ label, links, className, children }) {
  return <ControlBar as="nav" className={cn("page-actions horizontal-action-scroller profile-section-navigation", className)} aria-label={label}>
    {links.map(({ to, active, label, title, icon: Icon }) => (
      <Link key={to} to={to} data-control-icon aria-current={active ? "page" : undefined}
        aria-label={label} title={title || label}
        className={buttonVariants({ variant: active ? "default" : "outline", size: "icon" })}>
        <Icon aria-hidden="true" />
      </Link>
    ))}
    {children}
  </ControlBar>;
}
