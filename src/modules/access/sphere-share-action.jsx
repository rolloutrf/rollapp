import { useRef, useState } from "react";
import { Building2, X } from "lucide-react";
import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { PageActionButton } from "@/components/page-action-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Drawer, DrawerClose, DrawerContent, DrawerSectionHeader, DrawerTrigger } from "@/components/form-surface";
import { EmptyState } from "@/modules/shell/page-feedback.jsx";
import { useAsync } from "@/modules/shell/use-async.jsx";
import { useToast } from "@/modules/shell/toast.jsx";
import { useSession } from "@/modules/auth/session.jsx";
import { api } from "@/modules/runtime/api.js";
import { SPHERE_SECTION_LABELS } from "../../../shared/modules/access/sphere-sharing.js";
import { useSphereSharing } from "./sphere-sharing.jsx";

export function SphereShareAction() {
  const { user } = useSession();
  const { active, isOwner, readOnly, error, sphere, section, reload } = useSphereSharing();
  if (user?.accountType !== "personal" || !active || !isOwner || readOnly || error) return null;
  return <SphereShareDrawer key={`${user.id}:${sphere}:${section}`} sphere={sphere} section={section} onChange={reload} />;
}

function SphereShareDrawer({ sphere, section, onChange }) {
  const [open, setOpen] = useState(false);
  const [savingId, setSavingId] = useState("");
  const label = SPHERE_SECTION_LABELS[section];
  return <div>
    <Drawer mobileDrawer open={open} onOpenChange={next => { if (!savingId) setOpen(next); }}>
      <DrawerTrigger render={<PageActionButton type="button" variant="outline" />}>Доступ к личному разделу</DrawerTrigger>
      <DrawerContent className="rollapp-body app-drawer--form">
        <DrawerSectionHeader
          title={`Доступ к разделу «${label}»`}
          description="Выберите, кому разрешить чтение этого раздела."
          endAction={<DrawerClose render={<Button type="button" variant="outline" size="icon" disabled={Boolean(savingId)} />} aria-label="Закрыть доступы"><X aria-hidden="true" /></DrawerClose>}
        />
        {open && <ShareCandidates sphere={sphere} section={section} onChange={onChange} savingId={savingId} setSavingId={setSavingId} />}
      </DrawerContent>
    </Drawer>
  </div>;
}

function ShareCandidates({ sphere, section, onChange, savingId, setSavingId }) {
  const toast = useToast();
  const lock = useRef(false);
  const [saveError, setSaveError] = useState(null);
  const { data, loading, error, reload } = useAsync(
    () => api.get(`/sphere-shares/candidates?${new URLSearchParams({ sphere, section })}`),
    [sphere, section],
  );

  const changeAccess = async (person) => {
    if (lock.current) return;
    lock.current = true;
    setSavingId(person.id);
    setSaveError(null);
    const granted = !person.granted;
    try {
      await api.post("/sphere-shares", {
        viewerId: person.id,
        sphere,
        section: granted ? section : person.grantSection,
        granted,
      });
      toast(granted ? `Доступ для ${person.name} открыт` : `Доступ для ${person.name} закрыт`, "success");
      await Promise.allSettled([reload({ background: true }), onChange({ background: true })]);
    } catch (failure) {
      setSaveError(failure);
    } finally {
      lock.current = false;
      setSavingId("");
    }
  };

  return <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
    {saveError && <Alert variant="destructive"><AlertTitle>Не удалось изменить доступ</AlertTitle><AlertDescription>{saveError.message}</AlertDescription></Alert>}
    {loading ? <p role="status" className="flex items-center gap-2"><Spinner aria-hidden="true" />Загружаем бизнес-аккаунты…</p> : error ? (
      <Alert variant="destructive">
        <AlertTitle>Не удалось загрузить бизнес-аккаунты</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
        <Button type="button" className="rounded-full" variant="outline" onClick={() => reload().catch(() => {})}>Повторить</Button>
      </Alert>
    ) : data.people.length ? (
      <ul className="m-0 grid list-none p-0" aria-label="Бизнес-аккаунты">
        {data.people.map(person => {
          const action = person.granted ? "Закрыть доступ" : "Открыть доступ";
          return <li key={person.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b py-3 last:border-b-0 max-[420px]:grid-cols-[auto_minmax(0,1fr)]">
            <Avatar user={person} size="sm" className="!size-11" aria-hidden="true" />
            <div className="grid min-w-0 gap-1 wrap-anywhere">
              <strong>{person.name}</strong>
              <small className="text-xs text-muted-foreground">@{person.username}</small>
              {person.grantSection === "wishlist" && <small className="text-xs text-muted-foreground">Доступ ко всему Вишлисту</small>}
            </div>
            <Button
              type="button"
              variant={person.granted ? "outline" : "default"}
              className="min-h-12 rounded-full max-[420px]:col-start-2 max-[420px]:justify-self-start"
              disabled={Boolean(savingId)}
              aria-busy={savingId === person.id}
              aria-label={`${action} для ${person.name}`}
              onClick={() => changeAccess(person)}
            >
              {savingId === person.id && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {action}
            </Button>
          </li>;
        })}
      </ul>
    ) : <EmptyState compact icon={Building2} title="В этом разделе пока нет бизнес-аккаунтов" />}
  </div>;
}
