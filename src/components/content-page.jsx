import { createContext, useContext, useLayoutEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlBar } from "@/components/control-bar";
import { ScreenPortal } from "@/components/ui/screen-portal";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const PageActionsContext = createContext(null);

// Keep the original actions and their contexts. On phones only their DOM host
// changes, so Back, the primary action and overflow share one fixed row.
export function ContentPageActions({ className, children, ...props }) {
  const page = useContext(PageActionsContext);
  const actions = <ControlBar {...props} data-content-page-actions="" className={cn("content-page-actions", className)}>{children}</ControlBar>;
  return page?.mobile ? <ScreenPortal container={page.target}>{actions}</ScreenPortal> : actions;
}

// A normal route page: no modal state, focus trap or scroll locking.
export function ContentPage({ title, onBack, children, className = "" }) {
  const mobile = useIsMobile();
  const [target, setTarget] = useState(null);
  useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
  return <PageActionsContext.Provider value={{ mobile, target }}><main className={`mobile-content-page rollapp-body ${className}`} data-mobile-page>
    <ControlBar as="nav" className="mobile-content-page__nav" aria-label="Навигация страницы">
      <Button data-control-icon variant="outline" size="icon" className="rounded-full" aria-label={`Назад: ${title}`} onClick={onBack}><ArrowLeft aria-hidden="true" /></Button>
      <span>{title}</span>
      <div ref={setTarget} className="mobile-content-page__actions-host" />
    </ControlBar>
    {children}
  </main></PageActionsContext.Provider>;
}
