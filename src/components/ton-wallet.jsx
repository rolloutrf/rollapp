import { useEffect, useRef, useState } from "react";
import TonConnect, { CHAIN, toUserFriendlyAddress } from "@tonconnect/sdk";
import QRCode from "qrcode";
import { ArrowLeft, ArrowUpRight, Copy, Unplug, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { createTonStorage, loadTonConfig, tonConnectionError, walletConnectionSource } from "@/lib/ton-connect";

const SUPPORTED_WALLETS = ["tonkeeper", "mytonwallet", "telegram-wallet"];

export function TonWallet({ userId }) {
  const runtime = useRef(null);
  const pending = useRef(null);
  const connectionSignal = useRef(null);
  const connectButton = useRef(null);
  const sessionStorage = useRef(null);
  const expiry = useRef(null);
  const attempt = useRef(0);
  const [wallet, setWallet] = useState(null);
  const [wallets, setWallets] = useState([]);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);

  const cancelPending = () => {
    attempt.current += 1;
    clearTimeout(expiry.current);
    pending.current?.abort();
    pending.current = null;
    try { sessionStorage.current?.cancelConnection(); }
    catch { setError("Не удалось удалить запрос подключения. Разрешите хранение данных сайта."); }
    setSelected(null);
    setLink("");
    setQr("");
  };

  useEffect(() => {
    let active = true;
    let unsubscribe;
    let connector;
    const lifecycle = new AbortController();
    setReady(false);
    setError("");
    setWallet(null);
    async function initialize() {
      const config = await loadTonConfig({ signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(8_000)]) });
      if (!active) return;
      const storage = createTonStorage(userId, window.localStorage);
      sessionStorage.current = storage;
      // Fail visibly when persistence is blocked instead of losing a session.
      await storage.setItem("storage-check", "1");
      await storage.removeItem("storage-check");
      if (!active) return;
      connector = new TonConnect({
        manifestUrl: config.manifestUrl,
        walletsListSource: new URL("/tonconnect-wallets.json", window.location.origin).href,
        storage,
        disableAutoPauseConnection: true,
        analytics: { mode: "off" },
      });
      runtime.current = connector;
      unsubscribe = connector.onStatusChange((connected) => {
        if (!active) return;
        setWallet(connected);
        setError("");
        if (connected) {
          storage.commitConnection();
          clearTimeout(expiry.current);
          // The connect signal now owns the live session; don't abort it on success.
          pending.current = null;
          attempt.current += 1;
          setSelected(null);
          setLink("");
          setQr("");
          setOpen(false);
        }
      }, (cause) => { if (active) { cancelPending(); setError(tonConnectionError(cause)); } });
      const available = await connector.getWallets();
      if (!active) return;
      setWallets(available.filter((item) => SUPPORTED_WALLETS.includes(item.appName))
        .sort((a, b) => SUPPORTED_WALLETS.indexOf(a.appName) - SUPPORTED_WALLETS.indexOf(b.appName)));
      await connector.restoreConnection({ signal: lifecycle.signal, openingDeadlineMS: 10_000 });
      if (active) setReady(true);
    }
    initialize().catch((cause) => {
      if (active) setError(tonConnectionError(cause));
    });
    return () => {
      active = false;
      attempt.current += 1;
      pending.current?.abort();
      pending.current = null;
      connectionSignal.current?.abort();
      connectionSignal.current = null;
      clearTimeout(expiry.current);
      try { sessionStorage.current?.cancelConnection(); } catch { /* Site storage may have been revoked. */ }
      unsubscribe?.();
      lifecycle.abort();
      connector?.pauseConnection();
      if (runtime.current === connector) runtime.current = null;
    };
  }, [userId, retry]);

  async function connect(item) {
    cancelPending();
    setError("");
    setSelected(item);
    const version = attempt.current;
    const controller = new AbortController();
    pending.current = controller;
    connectionSignal.current = controller;
    try {
      await loadTonConfig({ signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]) });
      if (attempt.current !== version) return;
      sessionStorage.current.beginConnection();
      expiry.current = setTimeout(() => {
        if (attempt.current !== version) return;
        cancelPending();
        setError("Время ожидания истекло. Выберите кошелёк и попробуйте снова.");
      }, 120_000);
      const url = runtime.current.connect(walletConnectionSource(item), { signal: controller.signal, openingDeadlineMS: 30_000 });
      if (url) {
        setLink(url);
        const image = await QRCode.toDataURL(url, { width: 288, margin: 4, errorCorrectionLevel: "M" });
        if (attempt.current === version) setQr(image);
      }
    } catch (cause) {
      if (attempt.current === version) { cancelPending(); setError(tonConnectionError(cause)); }
    }
  }

  async function disconnect() {
    const connector = runtime.current;
    setBusy(true);
    setError("");
    try { await connector.disconnect({ signal: AbortSignal.timeout(10_000) }); }
    catch { setError("Не удалось завершить отключение. Проверьте подключение к интернету."); }
    finally { setBusy(false); }
  }

  function openWallet(event) {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) return;
    const url = new URL(link);
    if (url.hostname === "t.me" && webApp.openTelegramLink) {
      event.preventDefault();
      webApp.openTelegramLink(link);
    } else if (webApp.openLink) {
      event.preventDefault();
      webApp.openLink(link);
    }
  }

  const address = wallet ? toUserFriendlyAddress(wallet.account.address, wallet.account.chain === CHAIN.TESTNET) : "";
  const walletName = wallets.find((item) => item.appName === wallet?.device.appName)?.name || "TON";
  return <section className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5" aria-labelledby="ton-wallet-title" data-ton-wallet>
    <div className="flex items-center gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted"><Wallet aria-hidden="true" className="size-6" /></span>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="ton-wallet-title" className="font-heading text-xl leading-7 font-semibold">Кошелёк TON</h2>
        <span className="text-xs text-muted-foreground">{wallet ? `${walletName} · ${wallet.account.chain === CHAIN.MAINNET ? "Основная сеть" : "Тестовая сеть"}` : "Tonkeeper, MyTonWallet и Wallet в Telegram"}</span>
      </div>
    </div>
    {wallet ? <>
      <p className="break-all" aria-label="Адрес кошелька TON">{address}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(address); toast.success("Адрес скопирован"); }
          catch { setError("Не удалось скопировать адрес. Выделите его и скопируйте вручную."); }
        }}><Copy aria-hidden="true" />Копировать</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={disconnect}>{busy ? <Spinner /> : <Unplug aria-hidden="true" />}Отключить</Button>
      </div>
    </> : <>
      <p>Подключите свой кошелёк. Криптовалюта остаётся у вас, а подключение сохраняется на этом устройстве.</p>
      <Button ref={connectButton} type="button" className="w-full sm:w-auto sm:self-start" disabled={!ready || busy} onClick={() => { setError(""); setOpen(true); }}>
        {!ready && !error ? <Spinner /> : <Wallet aria-hidden="true" />}{!ready && !error ? "Проверяем подключение…" : "Подключить кошелёк"}
      </Button>
    </>}
    {error && !open && <Alert variant="destructive"><AlertDescription className="flex flex-col gap-2"><span>{error}</span>{!ready && <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Повторить</Button>}</AlertDescription></Alert>}
    <Dialog open={open} onOpenChange={(value) => { if (!value) cancelPending(); setOpen(value); }}>
      <DialogContent finalFocus={connectButton} className="not-typeset rollapp-body max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{selected ? selected.name : "Подключить кошелёк TON"}</DialogTitle>
          <DialogDescription>{selected ? "Подтвердите подключение в своём кошельке." : "Выберите кошелёк, которым пользуетесь."}</DialogDescription>
        </DialogHeader>
        {selected ? <div className="flex min-w-0 flex-col items-center gap-4">
          {link ? <>
            {qr ? <img src={qr} width="288" height="288" className="h-auto max-w-full rounded-xl" alt="QR-код для подключения кошелька к РОЛЛАПП" /> : <Spinner />}
            <p className="text-center">Откройте кошелёк или отсканируйте QR-код в приложении кошелька.</p>
            <Button nativeButton={false} render={<a href={link} onClick={openWallet} target="_blank" rel="noopener noreferrer" />} className="w-full"><ArrowUpRight aria-hidden="true" />Открыть кошелёк</Button>
          </> : <p className="flex items-center gap-2" role="status"><Spinner />{selected.injected || selected.embedded ? "Ожидаем подтверждения в кошельке" : "Проверяем подключение…"}</p>}
          <Button type="button" variant="ghost" className="w-full" onClick={cancelPending}><ArrowLeft aria-hidden="true" />Выбрать другой кошелёк</Button>
        </div> : <div className="flex flex-col gap-2">
          {wallets.map((item) => <Button key={item.appName} type="button" variant="outline" className="h-auto min-h-16 justify-start gap-3 py-3" onClick={() => connect(item)}>
            <img src={item.imageUrl} className="size-8 rounded-lg" alt="" /><span>{item.name}</span><ArrowUpRight className="ml-auto" aria-hidden="true" />
          </Button>)}
          {!wallets.length && <p>Нет доступных кошельков. Закройте окно и обновите страницу.</p>}
        </div>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      </DialogContent>
    </Dialog>
  </section>;
}
