import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreenPortal } from "@/components/ui/screen-portal";
import { ControlBar } from "@/components/control-bar";

const MobileFormsContext = createContext(null);
const FORM_QUERY = "formScreen";
const formToken = (search) => new URLSearchParams(search).get(FORM_QUERY);
function withForm(location, id) {
  const search = new URLSearchParams(location.search);
  if (id) search.set(FORM_QUERY, id); else search.delete(FORM_QUERY);
  return { pathname: location.pathname, search: search.size ? `?${search}` : "", hash: location.hash };
}

function FormPageHost({ entry, active, setTarget }) {
  const ref = useCallback((node) => setTarget(entry.id, node), [entry.id, setTarget]);
  return <main hidden={!active} className="mobile-form-page mobile-content-page rollapp-body" data-mobile-form-page={entry.id}>
    <ControlBar as="nav" className="mobile-content-page__nav" aria-label="Навигация формы">
      <Button data-control-icon variant="outline" size="icon" className="rounded-full" aria-label="Назад" onClick={() => entry.close.current()}><ArrowLeft aria-hidden="true" /></Button>
    </ControlBar>
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
  const reconcileFrame = useRef(0);
  const [entries, setEntries] = useState([]);
  const [targets, setTargets] = useState(new Map());
  const sync = useCallback(() => setEntries([...entriesRef.current.values()]), []);
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
    window.scrollTo(0, 0);
  }, [navigate, sync]);
  const unregister = useCallback((id) => {
    // StrictMode re-runs effects; a re-registration cancels this disposal.
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      const entry = entriesRef.current.get(id);
      if (!entry) return;
      entriesRef.current.delete(id);
      sync();
      if (formToken(window.location.search) === id) {
        pendingClose.current = id;
        navigate(-1);
      }
      requestAnimationFrame(() => {
        window.scrollTo(0, entry.scrollY);
        if (entry.opener?.isConnected) entry.opener.focus?.({ preventScroll: true });
      });
    }, 0));
  }, [navigate, sync]);
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
    if (!entriesRef.current.size) {
      // A transient form URL after reload returns to its owning section.
      if (id && !pendingClose.current) navigate(withForm(location, null), { replace: true, state: location.state });
      return;
    }
    reconcileHistory(id);
  }, [location, navigate, reconcileHistory]);
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); }, []);
  const value = useMemo(() => ({ register, unregister, targets, active: entries.length > 0 }), [register, unregister, targets, entries.length]);
  const active = entries.at(-1)?.id;
  return <MobileFormsContext.Provider value={value}>
    <div data-form-page-background inert={active ? true : undefined} aria-hidden={active ? true : undefined} style={{ display: active ? "none" : "contents" }}>{children}</div>
    {entries.map((entry) => <FormPageHost key={entry.id} entry={entry} active={entry.id === active} setTarget={setTarget} />)}
  </MobileFormsContext.Provider>;
}

export function MobileFormScreen({ open = true, onOpenChange, children }) {
  const pages = useContext(MobileFormsContext);
  const instanceId = useId();
  const id = useRef(`form-${instanceId.replace(/[^a-zA-Z0-9_-]/g, "")}`);
  const openRef = useRef(open);
  openRef.current = open;
  const close = useRef(null);
  close.current = () => onOpenChange?.(false, { reason: "close-press", cancel() {} });
  const register = pages?.register;
  const unregister = pages?.unregister;
  useLayoutEffect(() => {
    if (!open || !register) return;
    openRef.current = true;
    register({ id: id.current, close, open: openRef });
    return () => { openRef.current = false; unregister(id.current); };
  }, [open, register, unregister]);
  if (!pages) throw new Error("Mobile form screens require MobileFormPages");
  return open ? <ScreenPortal container={pages.targets.get(id.current)}>{children}</ScreenPortal> : null;
}

export function useNativeFormPageActive() {
  return useContext(MobileFormsContext)?.active || false;
}
