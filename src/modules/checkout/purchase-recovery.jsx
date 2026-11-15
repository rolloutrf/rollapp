import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/modules/runtime/api.js";

export function usePurchaseRecovery({ storageKey, loadSaved, requestFor, readMatches, acceptResponse, onComplete, onReject, onCloseConflict }) {
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

  function clear(intent) {
    try {
      const saved = loadSaved();
      if (saved && requestFor(saved).payload.idempotencyKey === requestFor(intent).payload.idempotencyKey) {
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      // A locally retained intent still resolves through the same order key.
    }
    if (mounted.current) setPending(null);
  }

  async function run(mode, intent) {
    const { path, payload } = requestFor(intent);
    inFlight.current = true;
    setRequestMode(mode);
    resetNotice();
    try {
      const { purchase } = mode === "check"
        ? await api.get(`${path}/${encodeURIComponent(payload.idempotencyKey)}`)
        : await api.post(path, payload);
      if (mode === "check" && purchase === null) {
        if (mounted.current) setResult("missing");
        return;
      }
      if (!acceptResponse(purchase, mode)) throw new Error("Не удалось прочитать результат покупки.");
      if (mode === "check" && !readMatches(purchase, intent)) {
        if (mounted.current) setResult("conflict");
        return;
      }
      clear(intent);
      if (mounted.current) onComplete(purchase, intent);
    } catch (failure) {
      if (!mounted.current) return;
      if (failure.code === "IDEMPOTENCY_CONFLICT") {
        setResult("conflict");
      } else if (mode === "send" && failure.status >= 400 && failure.status < 500 && onReject(failure)) {
        clear(intent);
        setError(failure.message);
      } else {
        setError(mode === "check" ? failure.message : "Ответ об оплате пока не получен. Можно проверить заказ в журнале.");
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
    catch { setError("Разрешите хранение данных для Rollapp, чтобы безопасно восстановить покупку."); return; }
    setPending(newIntent);
    void run("send", newIntent);
  }

  function check() {
    if (pending && !inFlight.current) void run("check", pending);
  }

  function closeConflict() {
    if (!pending || result !== "conflict" || inFlight.current) return;
    clear(pending);
    resetNotice();
    onCloseConflict();
  }

  return { pending, requestMode, busy: requestMode !== null, error, result, send, check, closeConflict, resetNotice, inFlight };
}

export function PurchaseRecoveryNotice({ error, result }) {
  if (result === "missing") return <div className="grid gap-1" role="status">
    <p>В журнале пока нет покупки.</p>
    <p className="text-xs text-muted-foreground">Повторная оплата сохранит условия. Роллы спишутся только один раз.</p>
  </div>;
  if (result === "conflict") return <Alert variant="destructive"><AlertDescription>
    По этому номеру уже записана другая операция. Сверьте её в истории заказов.
  </AlertDescription></Alert>;
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;
  return null;
}
