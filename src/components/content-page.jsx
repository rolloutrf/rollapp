import { useLayoutEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlBar } from "@/components/control-bar";

// A normal route page: no portal, modal state, focus trap or scroll locking.
export function ContentPage({ title, onBack, children, className = "" }) {
  useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
  return <main className={`mobile-content-page rollapp-body ${className}`} data-mobile-page>
    <ControlBar as="nav" className="mobile-content-page__nav" aria-label="Навигация страницы">
      <Button data-control-icon variant="outline" size="icon" className="rounded-full" aria-label={`Назад: ${title}`} onClick={onBack}><ArrowLeft aria-hidden="true" /></Button>
      <span>{title}</span>
    </ControlBar>
    {children}
  </main>;
}
