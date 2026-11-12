import { useEffect, useState } from "react";
import { api } from "@/api";
import { PageActionButton } from "@/components/page-action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

export function DiskProfileSettings({ ownerId, onProfileUpdated, onBusyChange }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    api.get("/me/disk-profile").then((result) => {
      if (active) setStatus(result);
    }).catch((failure) => {
      if (active) setError(failure.message);
    });
    return () => { active = false; };
  }, [ownerId]);

  const activate = async () => {
    setSaving(true);
    onBusyChange(true);
    setError("");
    try {
      const result = await api.post("/me/disk-profile", { ownerId });
      setStatus((previous) => ({ ...previous, active: result.active, available: result.available }));
      onProfileUpdated(result.user);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  };

  if (status && !status.enabled && !status.active) return null;
  return <Card className="grid gap-3 p-3 rollapp-body">
    <h3 className="font-semibold">Профиль на Яндекс Диске</h3>
    {!status && !error && <p role="status">Проверяем подключение…</p>}
    {status?.active && status.available && <p role="status">Профиль хранится на Яндекс Диске.</p>}
    {status?.active && !status.available && <Alert variant="destructive">
      <AlertDescription>Профиль на Диске недоступен. Показана последняя сохранённая версия. Проверьте подключение Диска или восстановите файл профиля.</AlertDescription>
    </Alert>}
    {status?.enabled && !status.active && (status.connected ? <>
      <p>Rollapp сохранит имя, адрес профиля, описание, дату рождения, ссылку на фото и внешние вишлисты в папке приложения на вашем Диске.</p>
      <PageActionButton className="justify-self-start" type="button" aria-label="Хранить профиль на Диске" disabled={saving} aria-busy={saving || undefined} onClick={activate}>Хранить на Диске</PageActionButton>
    </> : <p>Сначала подключите Диск в разделе «Личные заметки на Диске».</p>)}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </Card>;
}
