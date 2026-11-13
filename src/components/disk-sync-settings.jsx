import { useEffect, useState } from "react";
import { Power } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import { PRIVATE_NOTES_PATH } from "@/components/private-notes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const path = "/me/disk-sync";
const errors = {
  reconnect: "Доступ к Яндекс Диску нужно подтвердить снова.",
  space: "На Яндекс Диске закончилось место.",
  folder: "Ограничьте общий доступ к папке приложения и архиву, затем повторите обновление.",
  failed: "Не удалось обновить архив. Rollapp повторит попытку автоматически.",
};
const callbackErrors = {
  cancelled: "Подключение Яндекс Диска отменено.",
  failed: "Не удалось подключить Яндекс Диск. Попробуйте ещё раз.",
  missing: "Выберите аккаунт Яндекса, в котором находится папка Rollapp.",
};
const dateFormat = new Intl.DateTimeFormat("ru", { dateStyle: "medium", timeStyle: "short" });

export function useDiskSyncSettings({ active, ownerId, next, callback, onNavigate }) {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!active || busy) return;
    let current = true;
    let timer;
    async function read() {
      try {
        const result = await api.get(path);
        if (!current) return;
        setState(result);
        setLoadError("");
        timer = setTimeout(read, result.pending ? 2500 : 15000);
      } catch (error) {
        if (current) setLoadError(error.message);
      }
    }
    void read();
    return () => { current = false; clearTimeout(timer); };
  }, [active, busy, ownerId, reload]);

  async function change(action) {
    setBusy(true);
    setActionError("");
    let redirecting = false;
    try {
      if (action === "connect") {
        const { authorizationUrl } = await api.post("/private-notes/connection/start", { ownerId, next, sync: true });
        window.location.assign(authorizationUrl);
        redirecting = true;
      } else {
        setState(await api.post(path, { ownerId, action }));
        setLoadError("");
        setReload((previous) => previous + 1);
      }
    } catch (error) {
      setActionError(error.message);
    } finally {
      if (!redirecting) setBusy(false);
    }
  }

  const connect = !state?.connected || state?.error === "reconnect";
  const status = !state ? "Проверяем синхронизацию…" : state.pending ? "Обновляем копию…" :
    state.enabled ? "Автоматическое обновление включено." : "Автоматическое обновление выключено.";
  const error = actionError || loadError || errors[state?.error] || callbackErrors[callback];
  return {
    busy,
    body: <Card className="rollapp-body grid gap-3 p-3">
      <h3 className="font-semibold">Синхронизация копии</h3>
      <p>Rollapp обновляет полный архив данных и загруженных файлов в папке приложения на Яндекс Диске каждый час.</p>
      <div className="grid gap-1 text-muted-foreground" role="status">
        {!loadError && <p>{status}</p>}
        {state?.lastCompletedAt && <p>Последняя копия <time dateTime={state.lastCompletedAt}>{dateFormat.format(new Date(state.lastCompletedAt))}</time></p>}
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {state?.hasNotes && <Link to={PRIVATE_NOTES_PATH} className="underline underline-offset-4" onClick={(event) => {
        event.preventDefault();
        onNavigate(PRIVATE_NOTES_PATH);
      }}>Открыть личные заметки</Link>}
    </Card>,
    actions: <>
      {loadError ? <Button onClick={() => setReload((previous) => previous + 1)}>Повторить</Button> : state && <>
        <Button disabled={busy || state.pending} aria-busy={busy || undefined}
          aria-label={connect ? (state.connected ? "Переподключить Яндекс Диск" : "Подключить синхронизацию") : undefined} onClick={() =>
          change(connect ? "connect" : state.enabled ? "refresh" : "enable")}>
          {connect ? (state.connected ? "Переподключить" : "Подключить Диск")
            : state.enabled ? "Обновить сейчас" : "Включить синхронизацию"}
        </Button>
        {state.enabled && <Button variant="outline" size="icon" data-control-icon="" disabled={busy || state.running}
          aria-label="Выключить синхронизацию" title="Выключить синхронизацию" onClick={() => change("disable")}>
          <Power aria-hidden="true" />
        </Button>}
      </>}
    </>,
  };
}
