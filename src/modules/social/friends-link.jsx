import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function AppFriendsLink({ memberNumber }) {
  return (
    <ControlBar as="nav" aria-label="Связи профиля" className="flex items-center justify-center gap-2 whitespace-nowrap text-rollapp-body font-normal text-muted-foreground">
      {memberNumber && <span>{`ID #${memberNumber}`}</span>}
      <Link to="/app/friends" className={cn(buttonVariants({ variant: "link" }), "gap-2 px-2 text-rollapp-body font-normal text-muted-foreground hover:text-foreground hover:no-underline")}>
        <Users aria-hidden="true" />
        <span>Друзья</span>
      </Link>
    </ControlBar>
  );
}
