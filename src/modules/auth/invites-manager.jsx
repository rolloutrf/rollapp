import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Clock3, Ellipsis, Link2, RotateCw, Send, TimerOff } from "lucide-react";
import { api } from "@/modules/runtime/api.js";
import { ControlBar } from "@/components/control-bar";
import { DrawerFooter } from "@/components/form-surface";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";

const inviteStatuses = {
  pending: { label: "Отправляется", icon: Clock3 },
  sent: { label: "Отправлено", icon: Send },
  failed: { label: "Ошибка отправки", icon: CircleAlert },
  expired: { label: "Истекло", icon: TimerOff },
  accepted: { label: "Принято", icon: Check },
};
const dateFormat = new Intl.DateTimeFormat("ru-RU");

function InviteList({ label, items, sending, copyResult, onCopy, onResend }) {
  const busy = sending !== null;
  return <ul role="list" aria-label={label} className="min-w-0 divide-y border-y">
    {items.map(({ invite, canCopy, canResend }) => {
      const { label: status, icon: StatusIcon } = inviteStatuses[invite.status] || { label: invite.status };
      const expires = invite.status === "sent";
      const date = expires ? invite.expiresAt : invite.createdAt;
      const resending = sending?.inviteId === invite.id;
      const feedback = copyResult?.id === invite.id && copyResult;
      return <li key={invite.id} className="grid min-w-0 gap-2 py-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="grid min-w-0 gap-1">
            <span className="wrap-anywhere">{invite.email}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className={invite.status === "failed" ? "inline-flex items-center gap-1 text-destructive" : "inline-flex items-center gap-1"}>
                {StatusIcon && <StatusIcon aria-hidden="true" className="size-3.5 shrink-0" />}
                {status}
              </span>
              {date && <span className="inline-flex items-center gap-2">
                <span aria-hidden="true">·</span>
                <time dateTime={date}>{expires ? "до " : "создано "}{dateFormat.format(new Date(date))}</time>
              </span>}
            </span>
          </div>
          {(canCopy || canResend) && <ControlBar className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" variant="ghost" size="icon" data-control-icon="" />}
                disabled={busy} aria-busy={resending || undefined}
                title="Действия с приглашением" aria-label={`Действия с приглашением — ${invite.email}, ${status}`}>
                {resending ? <Spinner aria-hidden="true" /> : <Ellipsis aria-hidden="true" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-(--layout-menu-width) max-w-(--available-width)">
                {canCopy && <DropdownMenuItem onClick={() => void onCopy(invite)}>
                  <Link2 aria-hidden="true" /> Скопировать ссылку
                </DropdownMenuItem>}
                {canResend && <DropdownMenuItem onClick={() => void onResend(invite)}>
                  <RotateCw aria-hidden="true" /> Отправить снова
                </DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </ControlBar>}
        </div>
        {feedback && <p role="status" className="text-xs text-muted-foreground">{feedback.message}</p>}
        {feedback?.showLink && canCopy && <Input value={invite.copyUrl} readOnly
          aria-label={`Ссылка на приглашение — ${invite.email}`} onFocus={event => event.currentTarget.select()}
          onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} />}
      </li>;
    })}
  </ul>;
}

export function InvitesManager() {
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [sending, setSending] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copyResult, setCopyResult] = useState(null);
  const submitting = useRef(false);
  const initialRead = useRef(null);
  const busy = sending !== null;
  const seenEmails = new Set();
  const recentInvites = [];
  const previousInvites = [];
  for (const invite of invites) {
    const latest = !seenEmails.has(invite.email);
    seenEmails.add(invite.email);
    const canCopy = invite.status === "sent" && Boolean(invite.copyUrl);
    const canResend = latest && invite.canResend !== false && ["sent", "failed", "expired"].includes(invite.status);
    const list = !latest && ["failed", "expired"].includes(invite.status) ? previousInvites : recentInvites;
    list.push({ invite, canCopy, canResend });
  }
  useEffect(() => {
    const controller = new AbortController();
    initialRead.current = controller;
    api.get("/me/invites", { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setInvites(result.invites); })
      .catch(cause => { if (!controller.signal.aborted) setHistoryError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [historyAttempt]);
  const retryHistory = () => {
    setHistoryError("");
    setHistoryLoading(true);
    setHistoryAttempt(attempt => attempt + 1);
  };
  const deliver = async invite => {
    if (submitting.current) return;
    submitting.current = true;
    initialRead.current?.abort();
    setSending({ inviteId: invite?.id });
    setError("");
    setHistoryError("");
    setNotice("");
    setCopyResult(null);
    try {
      if (invite) {
        await api.post(`/me/invites/${encodeURIComponent(invite.id)}/resend`);
        setNotice("Новое приглашение отправлено.");
      } else {
        await api.post("/me/invites", { email });
        setEmail("");
        setNotice("Приглашение отправлено.");
      }
    } catch (cause) { setError(cause.message); }
    try {
      setInvites((await api.get("/me/invites")).invites);
    } catch (cause) { setHistoryError(cause.message); }
    finally {
      submitting.current = false;
      setSending(null);
      setHistoryLoading(false);
    }
  };
  const copyLink = async invite => {
    if (Date.parse(invite.expiresAt) <= Date.now()) {
      setCopyResult({ id: invite.id, message: "Срок действия ссылки истёк." });
      return;
    }
    try {
      await navigator.clipboard.writeText(invite.copyUrl);
      setCopyResult({ id: invite.id, message: "Ссылка скопирована." });
    } catch {
      setCopyResult({ id: invite.id, message: "Скопируйте ссылку из поля ниже.", showLink: true });
    }
  };
  const send = event => {
    event.preventDefault();
    void deliver();
  };
  const listActions = { sending, copyResult, onCopy: copyLink, onResend: deliver };
  return <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={send}>
    <ScrollArea className="min-h-0 w-full flex-1">
      <div className="rollapp-body grid min-w-0 gap-6 p-4">
        <section aria-labelledby="account-invite-new" className="grid min-w-0 gap-3">
          <h2 id="account-invite-new" className="font-heading text-xl font-semibold">Новое приглашение</h2>
          <Field>
            <FieldLabel htmlFor="account-invite-email">Email получателя</FieldLabel>
            <Input id="account-invite-email" type="email" autoComplete="off" required value={email}
              aria-describedby="account-invite-hint" readOnly={busy} onChange={event => setEmail(event.target.value)} />
            <FieldDescription id="account-invite-hint" className="text-xs/4">
              Одноразовая ссылка действует до 10 дней. Для регистрации нужен Яндекс ID.
            </FieldDescription>
          </Field>
          {error && <p role="alert" className="wrap-anywhere text-destructive">{error}</p>}
          {notice && <p role="status">{notice}</p>}
        </section>
        <section aria-labelledby="account-invite-history" className="grid min-w-0 gap-3">
          <h2 id="account-invite-history" className="font-heading text-xl font-semibold">История приглашений</h2>
          {historyLoading && <p role="status" className="text-muted-foreground">Загружаем историю…</p>}
          {historyError && <p role="alert" className="wrap-anywhere text-destructive">{historyError}</p>}
          {!historyLoading && !historyError && invites.length === 0 && <p className="text-muted-foreground">Приглашений пока нет.</p>}
          {recentInvites.length > 0 && <InviteList label="Приглашения" items={recentInvites} {...listActions} />}
          {previousInvites.length > 0 && <Accordion>
            <AccordionItem value="previous-attempts">
              <AccordionTrigger headerAs="h3" className="min-h-12 items-center gap-2 text-rollapp-body! hover:no-underline">
                <span className="min-w-0 flex-1">Предыдущие попытки</span>
                <span className="text-xs text-muted-foreground">{previousInvites.length}</span>
              </AccordionTrigger>
              <AccordionContent className="text-rollapp-body duration-0! motion-reduce:animate-none!">
                <InviteList label="Предыдущие попытки" items={previousInvites} {...listActions} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>}
        </section>
      </div>
    </ScrollArea>
    <DrawerFooter>
      <Button type="submit" disabled={busy || !email.trim()} aria-busy={busy && !sending.inviteId || undefined}
        aria-label={historyError ? "Отправить приглашение" : undefined}>
        {busy && !sending.inviteId ? "Отправляем…" : historyError ? "Отправить" : "Отправить приглашение"}
      </Button>
      {historyError && <Button type="button" variant="outline" size="icon" data-control-icon="" disabled={busy}
        title="Обновить историю" aria-label="Обновить историю" onClick={retryHistory}>
        <RotateCw aria-hidden="true" />
      </Button>}
    </DrawerFooter>
  </form>;
}
