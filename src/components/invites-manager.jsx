import { useEffect, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const statusLabel = { pending: "Отправляется", sent: "Отправлен", failed: "Ошибка отправки", expired: "Истёк", accepted: "Принят" };

export function InvitesManager() {
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.get("/me/invites").then(result => { if (active) setInvites(result.invites); })
      .catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);
  const send = async event => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api.post("/me/invites", { email });
      setEmail("");
      setInvites((await api.get("/me/invites")).invites);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Card className="rollapp-body grid gap-4 p-4">
    <div><h3 className="font-semibold">Приглашения</h3><p>Отправьте ссылку на email. Она действует 10 дней и подходит только для этого адреса.</p></div>
    <form className="grid gap-3" onSubmit={send}>
      <Field><FieldLabel htmlFor="account-invite-email">Email получателя</FieldLabel><Input id="account-invite-email" type="email" autoComplete="off" required value={email} onChange={event => setEmail(event.target.value)} /><FieldDescription>Один инвайт создаёт один аккаунт.</FieldDescription></Field>
      <Button type="submit" className="min-h-(--layout-control-size) rounded-full" disabled={busy}>{busy ? "Отправляем…" : "Отправить приглашение"}</Button>
    </form>
    {error && <p role="alert">{error}</p>}
    {invites.length > 0 && <ul className="grid gap-2">{invites.map(invite => <li key={invite.id} className="flex flex-wrap justify-between gap-2"><span className="break-all">{invite.email}</span><span>{statusLabel[invite.status] || invite.status} · до {new Date(invite.expiresAt).toLocaleDateString("ru-RU")}</span></li>)}</ul>}
  </Card>;
}
