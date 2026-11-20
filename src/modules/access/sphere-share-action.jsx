import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { PageActionButton } from "@/components/page-action-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerSectionHeader, DrawerTrigger } from "@/components/form-surface";
import { useToast } from "@/modules/shell/toast.jsx";
import { useSession } from "@/modules/auth/session.jsx";
import { api } from "@/modules/runtime/api.js";
import { SPHERE_SECTION_LABELS } from "../../../shared/modules/access/sphere-sharing.js";
import { useSphereSharing } from "./sphere-sharing.jsx";

export function SphereShareAction() {
  const { user } = useSession();
  const access = useSphereSharing();
  if (user?.accountType !== "personal" || !access.active || !access.isOwner || access.readOnly || access.error || !access.people.length) return null;
  return <SphereShareDrawer key={`${user.id}:${access.sphere}:${access.section}`} access={access} />;
}

function SphereShareDrawer({ access }) {
  const toast = useToast();
  const { people, sphere, section, reload } = access;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const lock = useRef(false);
  const grantKey = (person) => `${person.id}:${person.grantSection}`;
  const revoke = async (person) => {
    if (lock.current) return;
    lock.current = true;
    setSaving(grantKey(person));
    setError(null);
    try {
      await api.post("/sphere-shares", { viewerId: person.id, sphere, section: person.grantSection, granted: false });
      toast(`Доступ для ${person.name} закрыт`, "success");
      await reload({ background: true });
    } catch (failure) {
      setError(failure);
    } finally {
      lock.current = false;
      setSaving(null);
    }
  };

  return <div className="app-page app-page--collection">
    <Drawer mobileDrawer open={open} onOpenChange={next => { if (!lock.current) setOpen(next); }}>
      <DrawerTrigger render={<PageActionButton type="button" variant="outline" />}>Открытые доступы</DrawerTrigger>
      <DrawerContent className="rollapp-body app-drawer--form">
        <DrawerSectionHeader
          title={`Доступ к разделу «${SPHERE_SECTION_LABELS[section]}»`}
          description="Эти бизнес-аккаунты могут читать раздел."
          endAction={<DrawerClose render={<Button type="button" variant="outline" size="icon" disabled={Boolean(saving)} />} aria-label="Закрыть доступы"><X aria-hidden="true" /></DrawerClose>}
        />
        <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {error && <Alert variant="destructive"><AlertTitle>Не удалось закрыть доступ</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}
          <ul className="m-0 grid list-none p-0" aria-label="Бизнес-аккаунты с доступом">
            {people.map(person => (
              <li key={grantKey(person)} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b py-3 last:border-b-0 max-[420px]:grid-cols-[auto_minmax(0,1fr)]">
                <Avatar user={person} size="sm" className="!size-11" aria-hidden="true" />
                <div className="grid min-w-0 gap-1 wrap-anywhere">
                  <strong>{person.name}</strong>
                  <small className="text-xs text-muted-foreground">@{person.username}</small>
                  {person.grantSection === "wishlist" && <small className="text-xs text-muted-foreground">Доступ ко всему Вишлисту</small>}
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-12 rounded-full max-[420px]:col-start-2 max-[420px]:justify-self-start"
                  disabled={Boolean(saving)}
                  aria-busy={saving === grantKey(person)}
                  aria-label={`Закрыть доступ для ${person.name}`}
                  onClick={() => revoke(person)}
                >
                  Закрыть доступ
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DrawerContent>
    </Drawer>
  </div>;
}
