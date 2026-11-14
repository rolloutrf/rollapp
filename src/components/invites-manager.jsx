import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { DrawerFooter } from "@/components/form-surface";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const statusLabel = { pending: "Отправляется", sent: "Отправлен", failed: "Ошибка отправки", expired: "Истёк", accepted: "Принят" };

export function InvitesManager() {
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    api.get("/me/invites").then(result => { if (active) setInvites(result.invites); })
      .catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);
  const send = async event => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      await api.post("/me/invites", { email });
      setEmail("");
      setInvites((await api.get("/me/invites")).invites);
    } catch (cause) { setError(cause.message); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={send}>
    <ScrollArea className="min-h-0 w-full flex-1">
      <div className="rollapp-body grid min-w-0 gap-4 p-4">
        <p>Отправьте ссылку на email. Она действует 10 дней и подходит только для этого адреса.</p>
        <Field>
          <FieldLabel htmlFor="account-invite-email">Email получателя</FieldLabel>
          <Input id="account-invite-email" type="email" autoComplete="off" required value={email}
            aria-describedby="account-invite-hint" readOnly={busy} onChange={event => setEmail(event.target.value)} />
          <FieldDescription id="account-invite-hint">Один инвайт создаёт один аккаунт.</FieldDescription>
        </Field>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {invites.length > 0 && <ul className="grid gap-2" aria-label="Приглашения">{invites.map(invite =>
          <li key={invite.id} className="flex flex-wrap justify-between gap-2">
            <span className="break-all">{invite.email}</span>
            <span>{statusLabel[invite.status] || invite.status} · до {new Date(invite.expiresAt).toLocaleDateString("ru-RU")}</span>
          </li>)}</ul>}
      </div>
    </ScrollArea>
    <DrawerFooter>
      <Button type="submit" disabled={busy} aria-busy={busy || undefined}>{busy ? "Отправляем…" : "Отправить приглашение"}</Button>
    </DrawerFooter>
  </form>;
}
