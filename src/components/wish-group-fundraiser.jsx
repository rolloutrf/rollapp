import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Coins, Layers3, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import { FundraiserVirtualCard } from "@/components/fundraiser-virtual-card";
import { GroupDialogHeader } from "@/components/group-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { ControlBar } from "@/components/control-bar";
import { DrawerFooter } from "@/components/form-surface";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatRolls, ROLLS_MAX_TRANSFER } from "../../shared/rolls.js";

function restorePending(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key));
    return Number.isSafeInteger(value?.amount) && value.amount > 0 && value.amount <= ROLLS_MAX_TRANSFER
      && /^[0-9a-f-]{36}$/i.test(value?.idempotencyKey) ? value : null;
  } catch { return null; }
}

export function WishGroupHeader({ group, viewerId = "guest", shareToken = "", request = api, ...props }) {
  if (group.space !== "products") return <GroupDialogHeader title={group.title} {...props} />;
  return <WishGroupFundraisingHeader
    key={JSON.stringify([group.id, viewerId, shareToken])}
    group={group} viewerId={viewerId} shareToken={shareToken} request={request}
    {...props}
  />;
}

function WishGroupFundraisingHeader({ group, viewerId, shareToken, request, ...props }) {
  const mobile = useIsMobile();
  const endpoint = `/wish-groups/${encodeURIComponent(group.id)}/fundraiser`;
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const readVersion = useRef(0);
  const hasOpened = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++readVersion.current;
    setLoadError("");
    try {
      const value = await request.get(`${endpoint}${shareToken ? `?shareToken=${encodeURIComponent(shareToken)}` : ""}`);
      if (version === readVersion.current) setData(value);
    } catch (failure) {
      if (version === readVersion.current) setLoadError(failure.message);
    }
  }, [endpoint, shareToken, request]);
  useEffect(() => {
    void refresh();
    return () => { readVersion.current++; };
  }, [refresh]);

  const summary = data
    ? `Собрано ${formatRolls(data.fundraiser?.raised ?? 0)}`
    : loadError ? "Сумма недоступна" : "Загрузка сбора…";

  const fundraiser = <Drawer swipeDirection={mobile ? "down" : "right"} onOpenChange={(open, details) => {
    if (!open) {
      if (busyRef.current) details.cancel();
      return;
    }
    if (hasOpened.current) {
      setData(null);
      void refresh();
    }
    hasOpened.current = true;
  }}>
    <ControlBar className="shrink-0">
      <DrawerTrigger
        render={<Button type="button" variant="secondary" size="icon" data-control-icon />}
        aria-label={`Открыть сбор группы «${group.title}»`}
        title="Открыть сбор"
      ><Layers3 aria-hidden="true" /></DrawerTrigger>
    </ControlBar>
    <DrawerContent className="app-drawer--form rollapp-body">
      <DrawerHeader className="flex-row items-center justify-between gap-2 pb-4 [[data-overlay-compact]_&]:py-1">
        <div className="min-w-0 text-left">
          <DrawerTitle className="text-xl font-semibold">Сбор роллов</DrawerTitle>
          <DrawerDescription className="truncate" title={group.title}>{group.title}</DrawerDescription>
        </div>
        <ControlBar className="shrink-0">
          <DrawerClose render={<Button type="button" variant="outline" size="icon" data-control-icon disabled={busy} />} aria-label="Закрыть сбор">
            <X aria-hidden="true" />
          </DrawerClose>
        </ControlBar>
      </DrawerHeader>
      <WishGroupFundraiser
        group={group} viewerId={viewerId} shareToken={shareToken} request={request} endpoint={endpoint}
        data={data} setData={setData} loadError={loadError} refresh={refresh}
        busy={busy} setBusy={setBusy} busyRef={busyRef}
      />
    </DrawerContent>
  </Drawer>;

  return <GroupDialogHeader title={group.title} {...props} description={<span role="status">{summary}</span>} icon={fundraiser} />;
}

function WishGroupFundraiser({ group, viewerId, shareToken, request, endpoint, data, setData, loadError, refresh, busy, setBusy, busyRef }) {
  const storageKey = `rollapp:group-contribution:${viewerId}:${group.id}`;
  const id = useId();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const alive = useRef(false);
  const [pending, setPending] = useState(() => restorePending(storageKey));
  const [confirming, setConfirming] = useState(Boolean(pending));
  const [confirmationAmount, setConfirmationAmount] = useState(pending?.amount || 0);
  const [success, setSuccess] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const fund = data?.fundraiser;
  const numericTarget = Number(target);
  const numericAmount = Number(amount);
  const validTarget = /^\d+$/.test(target) && Number.isSafeInteger(numericTarget) && numericTarget >= Math.max(1, fund?.raised || 0) && numericTarget <= ROLLS_MAX_TRANSFER;
  const remaining = fund ? fund.target - fund.raised : 0;
  const validAmount = /^\d+$/.test(amount) && numericAmount > 0 && numericAmount <= Math.min(remaining, data?.balance || 0, ROLLS_MAX_TRANSFER);
  const mutate = async action => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setSuccess("");
    try { await action(); }
    catch (failure) { if (alive.current) setError(failure.message); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const save = event => {
    event.preventDefault();
    if (!validTarget) return;
    mutate(async () => {
      const result = fund
        ? await request.patch(endpoint, { target: numericTarget, accepting: fund.accepting })
        : await request.post(endpoint, { target: numericTarget });
      if (alive.current) { setData(current => ({ ...current, ...result })); setEditing(false); }
    });
  };
  const contribute = () => mutate(async () => {
    const retrying = Boolean(pending);
    const intent = pending || { amount: numericAmount, idempotencyKey: crypto.randomUUID() };
    // Persist before sending: an unknown result after a disconnect/reload is
    // retried with exactly the same key and amount, never a second payment.
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); }
    catch { throw new Error("Не удалось сохранить запрос в браузере. Разрешите хранилище и повторите попытку."); }
    setPending(intent);
    let result;
    try { result = await request.post(`${endpoint}/contributions`, { ...intent, shareToken }); }
    catch (failure) {
      // A later access/session failure cannot prove that an earlier request
      // with an unknown outcome was rolled back. Retain its key until resolved.
      if (!retrying && failure.status >= 400 && failure.status < 500 && ![408, 429].includes(failure.status)) {
        sessionStorage.removeItem(storageKey); setPending(null); setConfirming(false);
      }
      throw failure;
    }
    sessionStorage.removeItem(storageKey);
    if (alive.current) {
      setPending(null); setConfirming(false); setAmount("");
      setData(current => ({ ...current, fundraiser: result.fundraiser, balance: Math.max(0, current.balance - intent.amount) }));
      setSuccess(`Взнос ${formatRolls(intent.amount)} принят`);
      // A replay may already be reflected in the loaded balance.
      await refresh();
    }
  });
  const notice = error || loadError;
  const canContribute = fund && !data.isOwner && data.signedIn && (fund.status === "active" || pending);
  const canSignIn = fund && !data.isOwner && !data.signedIn && fund.status === "active";
  const contributionForm = `${id}-contribution`;
  const targetForm = `${id}-target-form`;
  const renderDrawer = (cardBody, cardActions, confirmingPurchase) => {
    let actions;
    if (data && editing) {
      actions = <>
        <Button type="submit" form={targetForm} disabled={busy || !validTarget}>{busy && <Spinner />}{fund ? "Сохранить" : "Открыть сбор"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Отмена</Button>
      </>;
    } else if (fund && data.isOwner) {
      actions = <>
        {cardActions}
        {!confirmingPurchase && <Button type="button" variant={cardActions ? "outline" : "default"} disabled={busy} onClick={() => { setTarget(String(fund.target)); setEditing(true); }}>Изменить цель</Button>}
        {fund.status !== "completed" && <Button type="button" variant="outline" disabled={busy} onClick={() => mutate(async () => {
          const result = await request.patch(endpoint, { target: fund.target, accepting: !fund.accepting });
          if (alive.current) setData(current => ({ ...current, ...result }));
        })}>{fund.accepting ? "Приостановить" : "Возобновить"}</Button>}
      </>;
    } else if (canContribute) {
      actions = <Button type="submit" form={contributionForm} disabled={busy || (!validAmount && !pending)}><Coins aria-hidden="true" />{pending ? "Проверить взнос" : "Внести роллы"}</Button>;
    } else if (canSignIn) {
      actions = <Link data-slot="button" className={buttonVariants()} to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Войти</Link>;
    } else if (!fund && data?.isOwner) {
      actions = <Button type="button" disabled={busy} onClick={() => { setTarget(""); setEditing(true); }}>Организовать сбор</Button>;
    }

    return <>
      <div className="app-drawer-body wish-group-fundraiser flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-[max(var(--layout-item-gap),env(safe-area-inset-bottom))]">
        {!data && !loadError && <p role="status">Загрузка сбора…</p>}
        {data && !fund && !editing && <p>{data.isOwner ? "Откройте общий сбор на товары из этой группы." : "Для этой группы пока нет сбора."}</p>}
        {fund && <>
          <p className="text-xs text-muted-foreground">{fund.status === "completed" ? "Цель достигнута" : fund.status === "closed" ? "Приостановлен" : "Сбор открыт"}</p>
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
            <strong className="text-2xl font-semibold">{formatRolls(fund.raised)}</strong><span className="text-muted-foreground">из {formatRolls(fund.target)}</span>
          </div>
          <div role="progressbar" aria-label="Прогресс сбора" aria-valuemin={0} aria-valuemax={fund.target} aria-valuenow={fund.raised} aria-valuetext={`Собрано ${formatRolls(fund.raised)} из ${formatRolls(fund.target)}`} className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, fund.raised / fund.target * 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Участников: {fund.contributors}. {remaining > 0 ? `Осталось ${formatRolls(remaining)}.` : "Спасибо за поддержку!"}</p>
          <p className="text-xs text-muted-foreground">Взносы сразу поступают в кошелёк владельца группы. Это внутренняя валюта Rollapp.</p>
          {!editing && cardBody}
          {canContribute && <form id={contributionForm} className="flex min-w-0 flex-col gap-3" onSubmit={event => { event.preventDefault(); if (validAmount || pending) { setConfirmationAmount(pending?.amount || numericAmount); setConfirming(true); } }}>
            <Field><FieldLabel htmlFor={`${id}-amount`}>Сумма взноса, роллы</FieldLabel>
              <Input id={`${id}-amount`} inputMode="numeric" value={pending ? String(pending.amount) : amount} disabled={busy || Boolean(pending)} onChange={event => setAmount(event.target.value)} aria-describedby={`${id}-balance`} />
              <FieldDescription id={`${id}-balance`}>На балансе {formatRolls(data.balance)}. {amount && !validAmount && !pending ? "Укажите целую сумму в пределах баланса и остатка до цели." : "Комиссия — 0 роллов."}</FieldDescription>
            </Field>
          </form>}
          {canSignIn && <p>Войдите, чтобы внести роллы.</p>}
        </>}
        {data && editing && <form id={targetForm} className="flex min-w-0 flex-col gap-3" onSubmit={save}>
          <Field><FieldLabel htmlFor={`${id}-target`}>Цель сбора, роллы</FieldLabel>
            <Input id={`${id}-target`} inputMode="numeric" autoFocus value={target} disabled={busy} onChange={event => setTarget(event.target.value)} aria-describedby={`${id}-target-hint`} />
            <FieldDescription id={`${id}-target-hint`}>Целое число от {Math.max(1, fund?.raised || 0).toLocaleString("ru-RU")} до {ROLLS_MAX_TRANSFER.toLocaleString("ru-RU")}. Валюта — роллы.</FieldDescription>
          </Field>
        </form>}
        {notice && <p role="alert">{notice}</p>}
        {success && <p role="status">{success}</p>}
      </div>
      {(actions || notice) && <DrawerFooter>
        {actions}
        {notice && <Button type="button" variant="outline" disabled={busy} onClick={() => mutate(refresh)}>{data ? "Обновить сбор" : "Повторить"}</Button>}
      </DrawerFooter>}
      <AlertDialog open={Boolean(fund && confirming)} onOpenChange={open => { if (!busy) setConfirming(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{pending ? "Проверить взнос?" : `Внести ${formatRolls(confirmationAmount)}?`}</AlertDialogTitle><AlertDialogDescription>Сбор «{group.title}». Роллы сразу поступят владельцу группы. {pending ? "Проверим результат запроса без повторного списания." : "Отменить перевод после подтверждения нельзя."}</AlertDialogDescription></AlertDialogHeader>
          {error && <p role="alert">{error}</p>}
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Назад</AlertDialogCancel><AlertDialogAction disabled={busy || (!pending && !validAmount)} onClick={event => { event.preventDefault(); contribute(); }}>{busy && <Spinner />}{pending ? "Проверить взнос" : "Подтвердить взнос"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>;
  };

  if (data?.isOwner && fund?.status === "completed") {
    return <FundraiserVirtualCard key={`${viewerId}:${fund.id}`} fundraiser={fund} ownerId={viewerId}>{renderDrawer}</FundraiserVirtualCard>;
  }
  return renderDrawer();
}
