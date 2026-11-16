import { useEffect, useRef, useState } from "react";
import { api } from "@/modules/runtime/api.js";

export function useOperationRecovery({ client = api, storageKey, loadSaved, requestFor, field, messages, readMatches,
  acceptResponse, onRecorded, onComplete, onReject, onCloseConflict }) {
  const [pending, setPending] = useState(loadSaved);
  const [requestMode, setRequestMode] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function resetNotice() {
    setResult(null);
    setError("");
  }

  function keyFor(intent) {
    const { requestKey, payload } = requestFor(intent);
    return requestKey ?? payload.idempotencyKey;
  }

  function clear(intent) {
    try {
      const saved = loadSaved();
      if (saved && keyFor(saved) === keyFor(intent)) {
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      // A locally retained intent still resolves through the same request key.
    }
    if (mounted.current) setPending(null);
  }

  async function run(mode, intent) {
    const { path, payload, timeoutMs, statusPath = `${path}/${encodeURIComponent(keyFor(intent))}` } = requestFor(intent);
    const options = timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : undefined;
    inFlight.current = true;
    setRequestMode(mode);
    resetNotice();
    try {
      const payloadResult = mode === "check" ? await client.get(statusPath, options) : await client.post(path, payload, options);
      const operation = payloadResult?.[field];
      if (mode === "check" && operation === null) {
        if (mounted.current) setResult("missing");
        return;
      }
      if (!acceptResponse(operation, mode, intent)) throw new Error(messages.unreadable);
      if (mode === "check" && !readMatches(operation, intent)) {
        if (mounted.current) setResult("conflict");
        return;
      }
      onRecorded?.(operation, intent);
      clear(intent);
      if (mounted.current) onComplete(operation, intent);
    } catch (failure) {
      if (!mounted.current) return;
      if (failure.code === "IDEMPOTENCY_CONFLICT") {
        setResult("conflict");
      } else if (mode === "send" && failure.status >= 400 && failure.status < 500 && onReject(failure)) {
        clear(intent);
        setError(failure.message);
      } else {
        setError(mode === "check" ? (failure.message || messages.unreadable) : messages.unknown);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setRequestMode(null);
    }
  }

  function send(newIntent) {
    if (inFlight.current) return;
    if (pending) {
      if (result === "missing") void run("send", pending);
      return;
    }
    const saved = loadSaved();
    if (saved) {
      setPending(saved);
      resetNotice();
      return;
    }
    if (!newIntent) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(newIntent)); }
    catch { setError(messages.storage); return; }
    setPending(newIntent);
    void run("send", newIntent);
  }

  function check() {
    if (pending && !inFlight.current) void run("check", pending);
  }

  function closeResult(expected) {
    if (!pending || result !== expected || inFlight.current) return;
    clear(pending);
    resetNotice();
    onCloseConflict();
  }

  return { pending, requestMode, busy: requestMode !== null, error, result, send, check, closeConflict: () => closeResult("conflict"),
    closeUnrecorded: () => closeResult("missing"), resetNotice, inFlight };
}
