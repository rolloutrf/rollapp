import { useId, useState } from "react";
import { Copy, Link2, Share2 } from "lucide-react";
import { api } from "@/api.js";
import { PageActionButton } from "@/components/page-action-button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MembershipReceipt } from "@/components/membership-number";

export function ProfileInvites({ membershipNumber }) {
  const linkId = useId();
  const [url, setUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function createInvite() {
    setCreating(true);
    setError("");
    setStatus("");
    try {
      const invite = await api.post("/me/invites", {});
      setUrl(new URL(invite.url, window.location.origin).href);
      setExpiresAt(Number.isFinite(invite.expiresAt) ? new Date(invite.expiresAt) : null);
      setStatus("Ссылка готова.");
    } catch (error) {
      setError(error.message);
    } finally {
      setCreating(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Ссылка скопирована.");
    } catch {
      const input = document.getElementById(linkId);
      input?.focus();
      input?.select();
      setStatus("Скопируйте выделенную ссылку вручную.");
    }
  }

  async function shareInvite() {
    try {
      await navigator.share({ title: "Приглашение в Rollapp", url });
    } catch (error) {
      if (error.name !== "AbortError") await copyInvite();
    }
  }

  return (
    <div className="grid min-w-0 gap-4 px-4 pt-4 pb-1">
      <p>Пригласите человека в Rollapp. По ссылке можно создать один аккаунт в течение 10 дней.</p>
      <div className="grid min-w-0 gap-3">
        {url && (
          <Field className="min-w-0">
            <FieldLabel htmlFor={linkId}>Ссылка для приглашения</FieldLabel>
            <Input id={linkId} readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
            {expiresAt && <span className="text-muted-foreground">Действует до <time dateTime={expiresAt.toISOString()}>{new Intl.DateTimeFormat("ru", { dateStyle: "medium", timeStyle: "short" }).format(expiresAt)}</time></span>}
          </Field>
        )}
        {url && typeof navigator.share === "function" && <PageActionButton type="button" onClick={shareInvite}>
          <Share2 data-icon="inline-start" aria-hidden="true" />
          Поделиться
        </PageActionButton>}
        {url && <PageActionButton type="button" onClick={copyInvite}>
          <Copy data-icon="inline-start" aria-hidden="true" />
          Скопировать ссылку
        </PageActionButton>}
        <PageActionButton type="button" variant={url ? "outline" : "default"} disabled={creating} aria-busy={creating || undefined} onClick={createInvite}>
          {creating ? <Spinner data-icon="inline-start" /> : <Link2 data-icon="inline-start" aria-hidden="true" />}
          {url ? "Создать ещё ссылку" : "Создать ссылку"}
        </PageActionButton>
        {error && <FieldError role="alert">{error}</FieldError>}
        <span className={status ? "text-xs text-muted-foreground" : "sr-only"} role="status">{status}</span>
      </div>
      {membershipNumber && <MembershipReceipt key={membershipNumber} number={membershipNumber} />}
    </div>
  );
}
