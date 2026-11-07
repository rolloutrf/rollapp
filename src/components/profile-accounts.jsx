import { useEffect, useState } from "react";
import { Check, Plus, UserMinus } from "lucide-react";
import { api } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function ProfileAccounts({ Avatar, addHref, home, blocked, changed, onBusyChange }) {
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(null);

  useEffect(() => {
    let active = true;
    api.get("/auth/accounts")
      .then((result) => { if (active) setData(result); })
      .catch((error) => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [revision]);

  const selectAccount = async (account, remove = false) => {
    if (blocked || changed || pending) return;
    setPending({ id: account.id, remove });
    onBusyChange(true);
    setActionError("");
    let leaving = false;
    try {
      if (remove) {
        await api.delete(`/auth/accounts/${encodeURIComponent(account.id)}`);
        setData((current) => ({ ...current, accounts: current.accounts.filter(({ id }) => id !== account.id) }));
      } else {
        await api.post("/auth/accounts/switch", { accountId: account.id });
        window.location.replace(home);
        leaving = true;
      }
    } catch (error) {
      setActionError(error.message);
      if (error.code === "SAVED_ACCOUNT_UNAVAILABLE") setRevision((current) => current + 1);
    } finally {
      if (!leaving) {
        setPending(null);
        onBusyChange(false);
      }
    }
  };

  const actionBlocked = blocked || changed || Boolean(pending);
  return <section aria-label="Аккаунты на этом устройстве"
    aria-busy={(!data && !loadError) || Boolean(pending) || undefined}
    className="flex min-w-0 flex-col gap-2">
    {changed && <p className="text-xs text-muted-foreground">Сохраните изменения профиля, чтобы переключить аккаунт.</p>}
    {actionError && <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert>}
    {loadError ? <>
      <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>
      <Button type="button" variant="outline" className="min-h-12" onClick={() => {
        setLoadError("");
        setRevision((current) => current + 1);
      }}>Повторить</Button>
    </> : !data ? <p role="status" className="flex min-h-12 items-center gap-2"><Spinner />Загружаем аккаунты…</p> : <>
      <ul className="divide-y">
        {data.accounts.map((account) => {
          const label = <><Avatar user={account} size="sm" className="shrink-0" />
            <span className="grid min-w-0 flex-1 gap-1 text-left">
              <span className="truncate" title={account.name}>{account.name}</span>
              <span className="truncate text-xs text-muted-foreground" title={`@${account.username}`}>
                @{account.username} · {account.accountType === "business" ? "Бизнес" : "Личный"}
              </span>
            </span></>;
          return <li key={account.id} className="flex min-w-0 items-center gap-2 py-1">
            {account.active ? <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-2">
              {label}
              <span className="sr-only">Активный аккаунт</span>
              <Check className="size-5 shrink-0 text-primary" aria-hidden="true" />
            </div> : <>
              <Button type="button" variant="ghost" className="h-auto min-h-12 min-w-0 flex-1 justify-start gap-2 px-2 py-1"
                aria-label={`Переключиться на @${account.username}`} disabled={actionBlocked} onClick={() => selectAccount(account)}>
                {label}
                {pending?.id === account.id && !pending.remove && <Spinner />}
              </Button>
              <Button type="button" variant="destructive" size="icon" className="size-12 shrink-0 rounded-full"
                aria-label={`Убрать @${account.username} с этого устройства`} title="Убрать аккаунт с этого устройства"
                disabled={actionBlocked} onClick={() => selectAccount(account, true)}>
                {pending?.id === account.id && pending.remove ? <Spinner /> : <UserMinus className="size-5" aria-hidden="true" />}
              </Button>
            </>}
          </li>;
        })}
      </ul>
      {data.accounts.length < data.maxAccounts
        ? <a data-slot="button" href={actionBlocked ? undefined : addHref} aria-disabled={actionBlocked || undefined}
            className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full", actionBlocked && "opacity-50")}>
          <Plus className="size-5" aria-hidden="true" />Добавить аккаунт
        </a>
        : <p className="text-xs text-muted-foreground">Чтобы добавить аккаунт, уберите один из сохранённых.</p>}
    </>}
  </section>;
}
