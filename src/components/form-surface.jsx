import { createContext, useContext } from "react";
import { ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileFormFooter, MobileFormScreen } from "@/components/mobile-form-pages";
import { ControlBar } from "@/components/control-bar";
import { Button } from "@/components/ui/button";
import * as Sheet from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

// Product composition: native form pages on phones with an opt-in bottom drawer.
const FormMode = createContext(false);
export function Drawer({ children, mobileDrawer = false, onAfterClose, onOpenChangeComplete, ...props }) {
  const mobile = useIsMobile();
  return mobile && !mobileDrawer
    ? <MobileFormScreen open={props.open} onOpenChange={props.onOpenChange} onAfterClose={onAfterClose}><FormMode.Provider value>{children}</FormMode.Provider></MobileFormScreen>
    : <Sheet.Drawer {...props} swipeDirection={mobile ? "down" : "right"} showSwipeHandle={mobile} onOpenChangeComplete={(open) => { onOpenChangeComplete?.(open); if (!open) onAfterClose?.(); }}>{children}</Sheet.Drawer>;
}
export const DrawerTrigger = Sheet.DrawerTrigger;

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
export function DrawerSectionHeader({ title, titleId, titleRef, description, startAction, endAction, borderless = false }) {
  const heading = <DrawerTitle id={titleId} ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="min-w-0 flex-1 wrap-anywhere text-left text-2xl font-semibold">{title}</DrawerTitle>;
  return <ControlBar as={DrawerHeader} className="app-drawer-section-header" data-borderless={borderless || undefined}>
    {startAction}
    {description ? <div className="grid min-w-0 flex-1 gap-1 text-left">
      {heading}
      <DrawerDescription className="wrap-anywhere">{description}</DrawerDescription>
    </div> : heading}
    {endAction}
  </ControlBar>;
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

export function DrawerBack({ disabled }) {
  return <DrawerClose render={<Button type="button" variant="outline" size="icon" disabled={disabled} />} aria-label="Назад" title="Назад">
    <ArrowLeft aria-hidden="true" />
  </DrawerClose>;
}
