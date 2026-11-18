import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Download } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { Drawer, DrawerBack, DrawerContent, DrawerFooter, DrawerSectionHeader } from "@/components/form-surface";
import { FullscreenDialog } from "@/components/fullscreen-dialog";
import { MobileFormFooter, MobileFormScreen, useNativeFormPageActive } from "@/components/mobile-form-pages";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageActionButton } from "@/components/page-action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/modules/runtime/api.js";
import { rollReceiptFields, rollReceiptText } from "../../../shared/modules/history/roll-receipt.js";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";

function downloadReceipt(receipt) {
  const url = URL.createObjectURL(new Blob([rollReceiptText(receipt)], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `rollapp-${receipt.id.replace(/[^a-z0-9_-]/gi, "-").slice(0, 100)}.txt`;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const receiptTitle = "Квитанция Rollapp";

function ReceiptContent({ intent, titleId, titleRef, onClose }) {
  const { kind, recordId, surface } = intent;
  const native = surface === "native";
  const drawer = surface === "drawer";
  const mobile = useIsMobile();
  const focusNativeTitle = useCallback((title) => title?.focus({ preventScroll: true }), []);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(0);

  useEffect(() => {
    let active = true;
    api.get(`/rolls/receipts/${encodeURIComponent(kind)}/${encodeURIComponent(recordId)}`).then(({ receipt: data }) => {
      if (active) setReceipt(data);
    }).catch((failure) => {
      if (active) setError(failure.message || "Не удалось загрузить квитанцию.");
    });
    return () => { active = false; };
  }, [kind, recordId, request]);

  const titleClass = "min-w-0 flex-1 wrap-anywhere font-heading text-2xl leading-8 font-semibold outline-none";
  const back = <Button type="button" variant="outline" size="icon" data-control-icon aria-label="Назад" onClick={onClose}>
    <ArrowLeft aria-hidden="true" />
  </Button>;
  const download = <Button type="button" variant={drawer || mobile ? "default" : "outline"} disabled={!receipt}
    className={mobile && !drawer ? "min-w-0 flex-1" : undefined} aria-label="Скачать квитанцию" onClick={() => downloadReceipt(receipt)}>
    <Download aria-hidden="true" />{mobile && !drawer ? "Скачать" : "Скачать квитанцию"}
  </Button>;

  const heading = native
    ? <h1 id={titleId} tabIndex={-1} ref={focusNativeTitle} className={titleClass}>{receiptTitle}</h1>
    : <DialogTitle id={titleId} render={<h1 tabIndex={-1} ref={titleRef} />} className={titleClass}>{receiptTitle}</DialogTitle>;
  return <section data-roll-receipt="" aria-labelledby={titleId}
    className={native ? "rollapp-body" : drawer ? "flex min-h-0 min-w-0 flex-1 flex-col" : "flex size-full min-h-0 min-w-0 flex-col"}>
    {drawer ? <DrawerSectionHeader title={receiptTitle} titleId={titleId} startAction={<DrawerBack />} /> :
      <header className="mx-auto w-full max-w-(--layout-text-width) shrink-0 px-(--layout-page-inset) pt-[max(var(--layout-item-gap),var(--layout-safe-top))] pb-(--layout-item-gap)">
        {mobile || native ? heading : <ControlBar className="flex flex-wrap items-center gap-2">
          {back}{heading}{download}
        </ControlBar>}
      </header>}
    <div data-receipt-body="" className={native ? undefined : "min-h-0 flex-1 overflow-y-auto overscroll-contain"}>
      <div className={drawer ? "grid min-w-0 gap-6 p-(--layout-item-gap)" : "mx-auto grid w-full max-w-(--layout-text-width) min-w-0 gap-6 px-(--layout-page-inset) pb-6"}>
        {error ? <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span className="wrap-anywhere">{error}</span>
            <PageActionButton variant="outline" onClick={() => { setError(""); setRequest((value) => value + 1); }}>Повторить</PageActionButton>
          </AlertDescription>
        </Alert> : !receipt ? <p role="status" className="flex items-center gap-2 text-muted-foreground"><Spinner />Загружаем квитанцию…</p> : <>
          <p className="wrap-anywhere text-4xl leading-10 font-semibold tabular-nums">{formatRolls(BigInt(receipt.amount))}</p>
          <dl className="grid min-w-0 gap-x-6 gap-y-4 sm:grid-cols-2">
            {rollReceiptFields(receipt).map(([label, value]) => <div key={label} className="grid min-w-0 content-start gap-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={`min-w-0 wrap-anywhere${label === "Номер" || label === "Номер заказа" ? " tabular-nums" : ""}`}>{value}</dd>
            </div>)}
          </dl>
        </>}
      </div>
    </div>
    {drawer ? <DrawerFooter aria-label="Действия с квитанцией">{download}</DrawerFooter>
      : native ? <MobileFormFooter aria-label="Действия с квитанцией">{download}</MobileFormFooter>
      : mobile && <ControlBar as="footer" className="mx-auto flex w-full max-w-(--layout-text-width) shrink-0 gap-2 px-(--layout-page-inset) pt-4 pb-[max(var(--layout-item-gap),env(safe-area-inset-bottom),var(--tg-content-safe-area-inset-bottom,0px))]" aria-label="Действия с квитанцией">
        {back}{download}
      </ControlBar>}
  </section>;
}

function ReceiptScreen({ intent, open, onClose }) {
  const titleId = useId();
  const titleRef = useRef(null);
  const restoreFocus = () => intent.opener.isConnected ? intent.opener : false;
  const close = (nextOpen) => { if (!nextOpen) onClose(); };
  const content = <ReceiptContent intent={intent} titleId={titleId} titleRef={titleRef} onClose={onClose} />;

  if (intent.surface === "drawer") {
    return <Drawer mobileDrawer open={open} onOpenChange={close}>
      <DrawerContent className="rollapp-body app-drawer--form" aria-labelledby={titleId} finalFocus={restoreFocus}>
        {content}
      </DrawerContent>
    </Drawer>;
  }
  if (intent.surface === "native") return <MobileFormScreen onOpenChange={close}>{content}</MobileFormScreen>;
  return <FullscreenDialog className="rollapp-body" aria-labelledby={titleId} initialFocus={titleRef}
    finalFocus={restoreFocus} onClose={onClose}>{content}</FullscreenDialog>;
}

// Keep the source mounted (including its filter, loaded rows and scroll).
// Only an opaque marker goes into browser history; receipt IDs stay in memory.
export function useRollReceiptScreen({ inDrawer = false } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const nativePage = useNativeFormPageActive();
  const surface = inDrawer ? "drawer" : nativePage ? "native" : "fullscreen";
  const [intent, setIntent] = useState(null);
  const active = Boolean(intent && (intent.surface === "native" || location.state?.rollReceiptScreen === intent.marker));
  function openReceipt(event, kind, recordId) {
    const opener = event.currentTarget;
    opener.focus({ preventScroll: true });
    const marker = crypto.randomUUID();
    setIntent({ kind, recordId, surface, opener, marker });
    if (surface !== "native") {
      navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
        state: { ...location.state, rollReceiptScreen: marker },
        preventScrollReset: true,
      });
    }
  }

  function closeReceipt() {
    if (!active) return;
    if (intent.surface === "native") setIntent(null);
    else navigate(-1);
  }

  return {
    openReceipt,
    receiptScreen: intent && (active || intent.surface === "drawer") ? <ReceiptScreen key={intent.marker}
      intent={intent} open={active} onClose={closeReceipt} /> : null,
  };
}

export function OrderReceipt({ order, onOpenReceipt }) {
  return <div className="col-span-full flex min-w-0">
    <PageActionButton variant="outline" type="button" onClick={(event) => onOpenReceipt(event, "order", order.id)}>
      Квитанция <ChevronRight data-icon="inline-end" aria-hidden="true" />
    </PageActionButton>
  </div>;
}
