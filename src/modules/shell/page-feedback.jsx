import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Sparkles, Gift } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Link } from "react-router-dom";
import { APP_HOME } from "./home-path.jsx";

export function Button({ children, className = "", variant = "primary", loading, ...props }) {
  const shadcnVariant = { primary: "default", soft: "secondary", paper: "secondary", reserved: "secondary" }[variant] || variant;
  return <ShadcnButton variant={shadcnVariant} className={className} {...props} disabled={loading || props.disabled} aria-busy={loading || props["aria-busy"] || undefined}>{children}</ShadcnButton>;
}

// Product composition of the shadcn Empty primitive. Standard size for a
// section; compact only when the surface already sits inside a smaller panel.
export function EmptyState({ icon: Icon = Sparkles, title, text, compact = false }) {
  return (
    <Empty data-empty-state="" className={`not-typeset border ${compact ? "min-h-40" : "min-h-80"}`}>
      <EmptyHeader className="w-full min-w-0">
        <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>
        <EmptyTitle className="max-w-full wrap-anywhere"><h3 className="m-0">{title}</h3></EmptyTitle>
        {text && <EmptyDescription className="wrap-anywhere">{text}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

export function LoadingScreen({ compact = false }) {
  return <div className={compact ? "inline-loader" : "page-loader"} role="status" aria-live="polite" aria-atomic="true" aria-busy="true"><Spinner className="gift-loader" aria-hidden="true" /><span>Собираем желания…</span></div>;
}

export function NotFound() { return <div className="not-found rollapp-body"><Gift /><h1>Похоже, эта мечта потерялась</h1><p>Страница не существует или ссылка устарела.</p><Link to={APP_HOME} className={buttonVariants()}>В приложение</Link></div>; }
