import { useEffect, useRef, useState } from "react";
import { api } from "@/modules/runtime/api.js";
import { DrawerFooter } from "@/components/form-surface";
import { PageActionButton } from "@/components/page-action-button";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const statusLabel = { pending: "Отправляется", sent: "Отправлен", failed: "Ошибка отправки", expired: "Истёк", accepted: "Принят" };

export function InvitesManager() {
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState([]);
  const [sending, setSending] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const initialRead = useRef(null);
  const busy = sending !== null;
  const latestInviteByEmail = new Map([...invites].reverse().map(invite => [invite.email, invite.id]));
  useEffect(() => {
    const controller = new AbortController();
    initialRead.current = controller;
    api.get("/me/invites", { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setInvites(result.invites); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, []);
  const deliver = async invite => {
    if (submitting.current) return;
    submitting.current = true;
    initialRead.current?.abort();
    setSending({ inviteId: invite?.id });
    setError("");
    setNotice("");
    try {
      if (invite) {
        await api.post(`/me/invites/${encodeURIComponent(invite.id)}/resend`);
        setNotice("Новое приглашение отправлено.");
      } else {
        await api.post("/me/invites", { email });
        setEmail("");
      }
    } catch (cause) { setError(cause.message); }
    try {
      setInvites((await api.get("/me/invites")).invites);
    } catch (cause) { setError(current => current || cause.message); }
    finally { submitting.current = false; setSending(null); }
  };
  const send = event => {
    event.preventDefault();
    void deliver();
  };
  return <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={send}>
    <ScrollArea className="min-h-0 w-full flex-1">
      <div className="rollapp-body grid min-w-0 gap-4 p-4">
        <p>Отправьте ссылку на email получателя. Она действует до 10 дней. Для входа получатель выберет свой Яндекс ID.</p>
        <Field>
          <FieldLabel htmlFor="account-invite-email">Email получателя</FieldLabel>
          <Input id="account-invite-email" type="email" autoComplete="off" required value={email}
            aria-describedby="account-invite-hint" readOnly={busy} onChange={event => setEmail(event.target.value)} />
          <FieldDescription id="account-invite-hint">Один инвайт создаёт один аккаунт.</FieldDescription>
        </Field>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {invites.length > 0 && <ul className="grid gap-2" aria-label="Приглашения">{invites.map(invite =>
          <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid min-w-0 gap-1">
              <span className="break-all">{invite.email}</span>
              <span>{statusLabel[invite.status] || invite.status} · до {new Date(invite.expiresAt).toLocaleDateString("ru-RU")}</span>
            </div>
            {invite.canResend !== false && latestInviteByEmail.get(invite.email) === invite.id && ["sent", "failed", "expired"].includes(invite.status) && (
              <PageActionButton type="button" variant="outline" disabled={busy} aria-busy={sending?.inviteId === invite.id || undefined}
                aria-label={`Отправить снова — ${invite.email}`} onClick={() => void deliver(invite)}>
                {sending?.inviteId === invite.id ? "Отправляем…" : "Отправить снова"}
              </PageActionButton>
            )}
          </li>)}</ul>}
      </div>
    </ScrollArea>
    <DrawerFooter>
      <Button type="submit" disabled={busy} aria-busy={busy && !sending.inviteId || undefined}>
        {busy && !sending.inviteId ? "Отправляем…" : "Отправить приглашение"}
      </Button>
    </DrawerFooter>
  </form>;
}
