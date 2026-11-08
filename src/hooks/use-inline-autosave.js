import { useEffect, useRef, useState } from "react";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// One queue per document, shared by all its editable blocks. Server responses
// acknowledge a snapshot; they never replace text typed while it was in flight.
export function useInlineAutosave({ value, onSave, storageKey, revision, enabled = true, delay = 800 }) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState("saved");
  const [error, setError] = useState("");
  const ref = useRef({ draft: value, saved: value, revision, timer: null, pending: null, mounted: true, restored: false });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const state = ref.current;
  const publish = (next, message = "") => {
    if (state.mounted) { setStatus(next); setError(message); }
  };
  const persist = () => {
    if (!storageKey) return;
    try {
      if (same(state.draft, state.saved)) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify({ base: state.saved, draft: state.draft, revision: state.revision }));
    } catch { /* Private mode/quota must not stop editing or server saving. */ }
  };
  const flush = (force = false) => {
    if (!enabledRef.current) return Promise.resolve(false);
    if (state.blocked && !force) return Promise.resolve(false);
    state.blocked = false;
    clearTimeout(state.timer);
    if (state.pending) return state.pending;
    if (same(state.draft, state.saved)) { publish("saved"); return Promise.resolve(true); }
    state.pending = (async () => {
      while (!same(state.draft, state.saved)) {
        const snapshot = state.draft;
        publish("saving");
        try {
          const result = state.revision === undefined
            ? await saveRef.current(snapshot)
            : await saveRef.current(snapshot, state.revision);
          if (state.revision !== undefined) state.revision = result.revision;
          state.saved = snapshot;
          persist();
        } catch (cause) {
          persist();
          state.blocked = true;
          publish("error", cause.message || "Не удалось сохранить текст.");
          return false;
        }
      }
      publish("saved");
      return true;
    })().finally(() => { state.pending = null; });
    return state.pending;
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    state.mounted = true;
    if (enabled && !state.restored && storageKey) {
      state.restored = true;
      try {
        const cached = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (cached && !same(cached.draft, value)) {
          state.blocked = true;
          state.draft = cached.draft;
          if (revision !== undefined) {
            // A restored draft must still compare against the version that
            // was open when it was written, including after a page reload.
            state.revision = typeof cached.revision === "string" ? cached.revision : "";
            state.saved = cached.base;
          }
          setDraft(cached.draft);
          publish("error", (revision !== undefined ? cached.revision === revision : same(cached.base, value))
            ? "Восстановлен несохранённый черновик. Проверьте текст и повторите сохранение."
            : revision !== undefined
              ? "На Диске другая версия. Восстановили ваш несохранённый черновик."
              : "На сервере другая версия. Восстановленный черновик не сохранён автоматически. Скопируйте нужный текст перед повторным сохранением.");
        } else if (cached && revision !== undefined) {
          sessionStorage.removeItem(storageKey);
        }
      } catch { /* Ignore invalid or unavailable browser storage. */ }
    }
    const beforeUnload = (event) => {
      if (same(state.draft, state.saved)) return;
      persist();
      event.preventDefault(); event.returnValue = "";
    };
    const visibility = () => { if (document.visibilityState === "hidden") void flushRef.current(); };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      state.mounted = false;
      clearTimeout(state.timer);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibility);
      void flushRef.current();
    };
  }, [storageKey, enabled]); // The owner/section is the component identity.

  useEffect(() => {
    if (!state.pending && same(state.draft, state.saved) && !same(value, state.saved)) {
      state.saved = value; state.draft = value; state.revision = revision; setDraft(value);
    }
  }, [value]);

  const change = (next) => {
    if (!enabledRef.current) return;
    state.blocked = false;
    state.draft = typeof next === "function" ? next(state.draft) : next;
    setDraft(state.draft);
    persist();
    publish("pending");
    clearTimeout(state.timer);
    state.timer = setTimeout(() => void flushRef.current(), delay);
  };
  return { draft, change, flush, status, error };
}
