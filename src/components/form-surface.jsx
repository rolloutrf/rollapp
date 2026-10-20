import { createContext, useContext } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileFormFooter, MobileFormScreen } from "@/components/mobile-form-pages";
import { ControlBar } from "@/components/control-bar";
import * as Sheet from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

// Product composition: native form pages on phones, official Drawer on desktop.
const FormMode = createContext(false);
export function Drawer({ children, ...props }) {
  const mobile = useIsMobile();
  return mobile
    ? <MobileFormScreen open={props.open} onOpenChange={props.onOpenChange}><FormMode.Provider value>{children}</FormMode.Provider></MobileFormScreen>
    : <Sheet.Drawer {...props} swipeDirection="right" showSwipeHandle={false}>{children}</Sheet.Drawer>;
}
export function DrawerContent({ children, className, finalFocus, initialFocus, ...props }) {
  const page = useContext(FormMode);
  if (!page) return <Sheet.DrawerContent className={className} finalFocus={finalFocus} initialFocus={initialFocus} {...props}>{children}</Sheet.DrawerContent>;
  const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => ["id", "style", "ref", "tabIndex", "onKeyDown", "onFocus", "onBlur"].includes(key) || /^(aria-|data-)/.test(key)));
  return <section {...domProps} className={cn("mobile-form-page__surface", className)}>{children}</section>;
}
export function DrawerHeader({ className, ...props }) {
  return useContext(FormMode) ? <header className={cn("mobile-form-page__header flex flex-col gap-1 p-4", className)} {...props} /> : <Sheet.DrawerHeader className={className} {...props} />;
}
export function DrawerTitle({ className, ...props }) {
  return useContext(FormMode) ? <h1 className={cn("text-2xl font-semibold", className)} {...props} /> : <Sheet.DrawerTitle className={className} {...props} />;
}
export function DrawerDescription({ className, ...props }) {
  return useContext(FormMode) ? <p className={cn("text-muted-foreground", className)} {...props} /> : <Sheet.DrawerDescription className={className} {...props} />;
}
export function DrawerFooter({ className, ...props }) {
  return useContext(FormMode) ? <MobileFormFooter className={className} {...props} /> : <ControlBar as={Sheet.DrawerFooter} className={cn("app-form-actions", className)} {...props} />;
}
export function DrawerClose(props) {
  // Every native form page has one common fixed Back action at the bottom.
  const page = useContext(FormMode);
  if (page) return null;
  return props.render?.props.size?.startsWith("icon")
    ? <ControlBar className="contents"><Sheet.DrawerClose {...props} data-control-icon="" /></ControlBar>
    : <Sheet.DrawerClose {...props} />;
}
