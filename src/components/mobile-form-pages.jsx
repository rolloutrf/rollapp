import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreenPortal } from "@/components/ui/screen-portal";
import { ControlBar } from "@/components/control-bar";
import { cn } from "@/lib/utils";

const MobileFormsContext = createContext(null);
const FormPageContext = createContext(null);
const FORM_QUERY = "formScreen";
const formToken = (search) => new URLSearchParams(search).get(FORM_QUERY);
function withForm(location, id) {
  const search = new URLSearchParams(location.search);
  if (id) search.set(FORM_QUERY, id); else search.delete(FORM_QUERY);
  return { pathname: location.pathname, search: search.size ? `?${search}` : "", hash: location.hash };
}

function FormBack({ close }) {
  return <Button data-control-icon type="button" variant="outline" size="icon" className="mobile-form-page__back rounded-full" aria-label="Назад" onClick={() => close.current()}><ArrowLeft aria-hidden="true" /></Button>;
}

function FormPageHost({ entry, active, hasFooter, setTarget }) {
  const ref = useCallback((node) => setTarget(entry.id, node), [entry.id, setTarget]);
  return <main hidden={!active} className="mobile-form-page mobile-content-page rollapp-body" data-mobile-form-page={entry.id} data-has-form-footer={hasFooter || undefined}>
    {!hasFooter && <ControlBar as="nav" className="mobile-content-page__nav" aria-label="Навигация формы">
      <FormBack close={entry.close} />
    </ControlBar>}
    <div ref={ref} className="mobile-form-page__content" />
  </main>;
}

export function MobileFormPages({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;
  const entriesRef = useRef(new Map());
  const timers = useRef(new Map());
  const pendingClose = useRef(null);
  const closeCallbacks = useRef(new Map());
  const reconcileFrame = useRef(0);
  const [entries, setEntries] = useState([]);
  const [targets, setTargets] = useState(new Map());
  const [footers, setFooters] = useState(new Set());
  const setFooter = useCallback((id, present) => setFooters((current) => {
    if (current.has(id) === present) return current;
    const next = new Set(current);
    if (present) next.add(id); else next.delete(id);
    return next;
  }), []);
  const sync = useCallback(() => setEntries([...entriesRef.current.values()]), []);
  const finishClose = useCallback((activeId) => {
    for (const [id, callback] of closeCallbacks.current) {
      if (id === activeId) continue;
      closeCallbacks.current.delete(id);
      // The owner must see its restored Router location before a selection
      // callback updates search params, otherwise it can retain formScreen.
      requestAnimationFrame(() => callback.current?.());
    }
  }, []);
  const setTarget = useCallback((id, node) => setTargets((current) => {
    if (current.get(id) === node || (!node && !current.has(id))) return current;
    const next = new Map(current);
    if (node) next.set(id, node); else next.delete(id);
    return next;
  }), []);
  const register = useCallback((entry) => {
    clearTimeout(timers.current.get(entry.id));
    timers.current.delete(entry.id);
    if (entriesRef.current.has(entry.id)) return;
    entriesRef.current.set(entry.id, { ...entry, scrollY: window.scrollY, opener: document.activeElement, ready: false });
    sync();
    queueMicrotask(() => {
      const registered = entriesRef.current.get(entry.id);
      if (!registered) return;
      navigate(withForm(locationRef.current, entry.id), { state: locationRef.current.state });
      // Browser history is committed synchronously; React may coalesce the
      // route render with a fast Back before its effect ever sees this token.
      registered.ready = true;
    });
    window.scrollTo({ left: 0, top: 0, behavior: "instant" });
  }, [navigate, sync]);
  const unregister = useCallback((id) => {
    // StrictMode re-runs effects; a re-registration cancels this disposal.
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      const entry = entriesRef.current.get(id);
      if (!entry) return;
      entriesRef.current.delete(id);
      sync();
      if (entry.afterClose?.current) closeCallbacks.current.set(id, entry.afterClose);
      if (formToken(window.location.search) === id) {
        pendingClose.current = id;
        navigate(-1);
      } else finishClose(formToken(window.location.search));
      requestAnimationFrame(() => {
        // The source's smooth-scroll CSS is active again after the form closes.
        // Restoring history position must not animate through the whole page.
        window.scrollTo({ left: 0, top: entry.scrollY, behavior: "instant" });
        // A newly focused source control owns the next interaction. The queued
        // return must not reclaim it after the form has already disappeared.
        const focused = document.activeElement;
        if (entry.opener?.isConnected && (!focused || focused === document.body || focused === document.documentElement)) entry.opener.focus?.({ preventScroll: true });
      });
    }, 0));
  }, [navigate, sync, finishClose]);
  const reconcileHistory = useCallback((id) => {
    cancelAnimationFrame(reconcileFrame.current);
    if (pendingClose.current && id !== pendingClose.current) pendingClose.current = null;
    const current = [...entriesRef.current.values()];
    if (!current.length) return;
    const selected = current.findIndex((entry) => entry.id === id);
    if (selected >= 0) current[selected].ready = true;
    const leaving = current.slice(selected + 1).filter((entry) => entry.ready);
    if (!leaving.length) return;
    for (const entry of leaving.reverse()) entry.close.current();
    reconcileFrame.current = requestAnimationFrame(() => {
      const blocked = leaving.find((entry) => entriesRef.current.has(entry.id) && entry.open.current);
      if (blocked) navigate(1);
    });
  }, [navigate]);
  // Native Back can coalesce with a pending Router push, leaving React's
  // location unchanged. Reconcile the committed browser URL on popstate too.
  useLayoutEffect(() => {
    const pop = () => reconcileHistory(formToken(window.location.search));
    window.addEventListener("popstate", pop);
    return () => { window.removeEventListener("popstate", pop); cancelAnimationFrame(reconcileFrame.current); };
  }, [reconcileHistory]);
  useLayoutEffect(() => {
    const id = formToken(location.search);
    if (id !== formToken(window.location.search)) return;
    finishClose(id);
    if (!entriesRef.current.size) {
      // A transient form URL after reload returns to its owning section.
      if (id && !pendingClose.current) navigate(withForm(location, null), { replace: true, state: location.state });
      return;
    }
    reconcileHistory(id);
  }, [location, navigate, reconcileHistory, finishClose]);
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); }, []);
  const value = useMemo(() => ({ register, unregister, setFooter, targets, active: entries.length > 0 }), [register, unregister, setFooter, targets, entries.length]);
  const active = entries.at(-1)?.id;
  return <MobileFormsContext.Provider value={value}>
    <div data-form-page-background inert={active ? true : undefined} aria-hidden={active ? true : undefined} style={{ display: active ? "none" : "contents" }}>{children}</div>
    {entries.map((entry) => <FormPageHost key={entry.id} entry={entry} active={entry.id === active} hasFooter={footers.has(entry.id)} setTarget={setTarget} />)}
  </MobileFormsContext.Provider>;
}

export function MobileFormScreen({ open = true, onOpenChange, onAfterClose, children }) {
  const pages = useContext(MobileFormsContext);
  const instanceId = useId();
  const id = useRef(`form-${instanceId.replace(/[^a-zA-Z0-9_-]/g, "")}`);
  const openRef = useRef(open);
  openRef.current = open;
  const close = useRef(null);
  close.current = () => onOpenChange?.(false, { reason: "close-press", cancel() {} });
  const afterClose = useRef(onAfterClose);
  afterClose.current = onAfterClose;
  const register = pages?.register;
  const unregister = pages?.unregister;
  const setFooter = pages?.setFooter;
  const footerPresence = useCallback((present) => setFooter?.(id.current, present), [setFooter]);
  const page = useMemo(() => ({ close, footerPresence }), [footerPresence]);
  useLayoutEffect(() => {
    if (!open || !register) return;
    openRef.current = true;
    register({ id: id.current, close, open: openRef, afterClose });
    return () => { openRef.current = false; unregister(id.current); };
  }, [open, register, unregister]);
  if (!pages) throw new Error("Mobile form screens require MobileFormPages");
  return open ? <ScreenPortal container={pages.targets.get(id.current)}><FormPageContext.Provider value={page}>{children}</FormPageContext.Provider></ScreenPortal> : null;
}

// Keep actions in their original form DOM. One fixed parent moves Back and
// submit/delete together without breaking native validation or Enter submission.
export function MobileFormFooter({ as: Component = "footer", className, children, ...props }) {
  const page = useContext(FormPageContext);
  useLayoutEffect(() => {
    if (!page) return;
    page.footerPresence(true);
    return () => page.footerPresence(false);
  }, [page]);
  if (!page) return <ControlBar as={Component} className={cn("app-form-actions", className)} {...props}>{children}</ControlBar>;
  return <ControlBar as={Component} {...props} className={cn("mobile-form-page__footer", className)} data-native-form-actions="">
    <FormBack close={page.close} />
    <div className="mobile-form-page__actions">{children}</div>
  </ControlBar>;
}

export function useNativeFormPageActive() {
  return useContext(MobileFormsContext)?.active || false;
}
