import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Sparkles, Gift } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Link } from "react-router-dom";
import { APP_HOME } from "./home-path.jsx";

export function Button({ children, className = "", variant = "primary", icon: Icon, loading, ...props }) {
  const shadcnVariant = { primary: "default", soft: "secondary", paper: "secondary", reserved: "secondary" }[variant] || variant;
  return <ShadcnButton variant={shadcnVariant} className={className} {...props} disabled={loading || props.disabled} aria-busy={loading || props["aria-busy"] || undefined}>{loading ? <Spinner data-icon="inline-start" /> : Icon ? <Icon data-icon="inline-start" aria-hidden="true" /> : null}{children}</ShadcnButton>;
}

export function EmptyState({ icon: Icon = Sparkles, title, text, action }) {
  return <Empty className="empty-state"><EmptyHeader><EmptyMedia className="empty-state__icon" variant="icon"><Icon size={28} /></EmptyMedia><EmptyTitle><h3>{title}</h3></EmptyTitle><EmptyDescription><p>{text}</p></EmptyDescription></EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty>;
}

export function LoadingScreen({ compact = false }) {
  return <div className={compact ? "inline-loader" : "page-loader"} role="status" aria-live="polite" aria-atomic="true" aria-busy="true"><Spinner className="gift-loader" aria-hidden="true" /><span>Собираем желания…</span></div>;
}

export function NotFound() { return <div className="not-found rollapp-body"><Gift /><h1>Похоже, эта мечта потерялась</h1><p>Страница не существует или ссылка устарела.</p><Link to={APP_HOME} className={buttonVariants()}>В приложение</Link></div>; }
