import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarSync, Copy, Download, X } from "lucide-react";
import { toast } from "sonner";
import { planningApi } from "@/lib/planning-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";

function CalendarConnection({ spaceId, transport, onClose, onUpdate }) {
  const api = useMemo(() => transport || planningApi(spaceId), [spaceId, transport]);
  const id = useId(), link = useRef(null), current = useRef(true), saving = useRef(false);
  const [connection, setConnection] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [retry, setRetry] = useState(0), [confirm, setConfirm] = useState(false);
  useEffect(() => { current.current = true; return () => { current.current = false; }; }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    api.get("calendar-device").then(value => { if (active) setConnection(value); }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, retry]);
  const change = async disconnect => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const value = disconnect ? await api.delete("calendar-device") : await api.post("calendar-device", {});
      if (current.current) { setConnection(previous => ({ ...previous, ...value })); setConfirm(false); onUpdate?.(); }
    } catch (cause) { if (current.current) setError(cause.message); }
    finally { saving.current = false; if (current.current) setBusy(false); }
  };
  const code = connection?.connected && connection.token ? `rollapp-calendar://connect?${new URLSearchParams({ server: window.location.origin, token: connection.token, title: connection.title || "Календарь Rollapp" })}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast.success("Код подключения скопирован"); }
    catch { link.current?.focus(); link.current?.select(); setError("Выделите и скопируйте код подключения."); }
  };
  return <Drawer open onOpenChange={open => { if (!open && !saving.current) onClose(); }}>
    <DrawerContent className="rollapp-body app-drawer--form" data-calendar-sync>
      <DrawerClose render={<Button variant="ghost" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть синхронизацию"><X aria-hidden="true" /></DrawerClose>
      <DrawerHeader className="pr-16 text-left!"><DrawerTitle>Календарь устройства</DrawerTitle><DrawerDescription>События Apple Calendar в Rollapp.</DrawerDescription></DrawerHeader>
      <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <p>Приложение Rollapp Calendar читает выбранные календари на устройстве и обновляет их события здесь. Изменяйте события в Apple Calendar.</p>
        <p className="text-muted-foreground">Передаются названия, описания, места, даты и время выбранных событий. Доступ можно отключить ниже.</p>
        <p className="text-muted-foreground">Браузер не имеет доступа к системному календарю. Для подключения нужно нативное приложение и ваше разрешение на устройстве. Оно также видит календари «На моём Mac».</p>
        {loading && <p role="status" className="flex items-center gap-2"><Spinner />Проверяем подключение…</p>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {!loading && !connection && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Повторить</Button>}
        {connection && <>
          <p className="text-muted-foreground">{connection.title || "Выбранный календарь"} · {connection.deviceName || (connection.connected ? "Ожидаем устройство" : "Устройство не подключено")}</p>
          {connection.lastSyncedAt && <p role="status">Последнее обновление: {new Intl.DateTimeFormat("ru", { dateStyle: "short", timeStyle: "short" }).format(new Date(connection.lastSyncedAt))}. Событий: {connection.eventCount}.</p>}
          <p>На Mac скачайте и откройте Rollapp Calendar. Затем откройте подключение, выберите нужные календари и подтвердите передачу их событий в Rollapp.</p>
          <Button variant="outline" nativeButton={false} role="link" render={<a href="/api/planning/calendar-device/macos" download />}><Download aria-hidden="true" />Приложение для Mac</Button>
          <p className="text-muted-foreground">На iPhone требуется установленная iOS-версия Rollapp Calendar. Публикация этой версии ещё не выполнена. Кнопка в браузере сама по себе не включает доступ к календарям iPhone.</p>
          {code && <>
            <Field><FieldLabel htmlFor={id}>Код подключения устройства</FieldLabel><Input ref={link} id={id} value={code} readOnly onFocus={event => event.target.select()} /></Field>
            <Button variant="outline" onClick={copy}><Copy aria-hidden="true" />Копировать код</Button>
            <p className="text-muted-foreground">Этот код разрешает выбранному устройству загружать события только в этот календарь Rollapp. Сохраните его для своего приложения.</p>
            <Button variant="outline" disabled={busy} onClick={() => { setRetry(value => value + 1); onUpdate?.(); }}>Проверить обновление</Button>
            {confirm ? <div className="flex flex-col gap-2" role="group" aria-label="Отключение устройства"><p>Отключить устройство и скрыть загруженные им события в этом календаре Rollapp? События на устройстве сохранятся.</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Отмена</Button><Button variant="destructive" disabled={busy} onClick={() => change(true)}>Отключить</Button></div></div>
              : <Button variant="destructive" disabled={busy} onClick={() => setConfirm(true)}>Отключить устройство</Button>}
          </>}
        </>}
      </div>
      <DrawerFooter>{code ? <Button variant="outline" className="flex-1" nativeButton={false} role="link" render={<a href={code} rel="noreferrer" />} disabled={busy} aria-label="Открыть Rollapp Calendar">Открыть приложение</Button>
        : <Button variant="outline" className="flex-1" aria-label="Подключить" disabled={loading || busy || !connection} onClick={() => change(false)}>{busy && <Spinner />}Подключить</Button>}</DrawerFooter>
    </DrawerContent>
  </Drawer>;
}
export function CalendarSyncButton({ spaceId = "main", transport, onUpdate }) {
  const [open, setOpen] = useState(false);
  return <><Button data-control-icon variant="outline" size="icon" shape="pill" title="Синхронизация с Apple Calendar" aria-label="Синхронизация с Apple Calendar" aria-expanded={open} onClick={() => setOpen(true)}><CalendarSync aria-hidden="true" /></Button>
    {open && <CalendarConnection key={spaceId} spaceId={spaceId} transport={transport} onUpdate={onUpdate} onClose={() => setOpen(false)} />}</>;
}
