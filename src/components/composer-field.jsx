import { ControlBar } from "./control-bar";
import { InputGroup, InputGroupAddon } from "./ui/input-group";
import { cn } from "@/lib/utils";
import "./composer-field.css";

export function ComposerField({ actions, children, className, ...props }) {
  return <InputGroup className={cn("composer-field", className)} {...props}>
    {children}
    <InputGroupAddon align="block-end" className="composer-field__addon">
      <ControlBar className="composer-field__actions">{actions}</ControlBar>
    </InputGroupAddon>
  </InputGroup>;
}
