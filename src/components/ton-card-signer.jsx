import { useEffect, useRef, useState } from "react";
import TonConnect from "@tonconnect/sdk";
import QRCode from "qrcode";
import { ArrowUpRight, Download, Wallet } from "lucide-react";
import { CONTACT_CARD_NETWORK, signedContactCardDownload } from "../../shared/ton-contact-card.js";
import { loadTonConfig } from "@/lib/ton-connect";
import { downloadContactFile, tonCardRequest } from "@/lib/ton-card-api";
import { ControlBar } from "@/components/control-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// Isolated, volatile bridge storage: never overwrite the payment wallet's
// persisted TON Connect session, and never restore a proof from an old window.
function bridgeStorage() {
  const values = new Map();
  return { async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); }, async removeItem(key) { values.delete(key); }, clear() { values.clear(); } };
}
function errorText(error) {
  if (error?.name === "UserRejectsError") return "Действие отменено в кошельке. Можно повторить.";
  return error?.message || "Не удалось выполнить действие. Попробуйте снова.";
}

export default function TonCardSigner({ profile, previous = null }) {
  const operation = useRef(null), lifecycle = useRef(null), runtime = useRef(null), generation = useRef(0), connectIntent = useRef(null), connectedWallet = useRef(null), challenge = useRef(null);
  const [state, setState] = useState({ loading: true, wallets: [], wallet: null, verified: null, link: "", qr: "", error: "", busy: false, signed: null, prepared: null, submitted: false, registration: null });
  const [recovery, setRecovery] = useState("");
  const [retry, setRetry] = useState(0);
  const update = (patch) => setState((value) => ({ ...value, ...patch }));
  useEffect(() => {
    const controller = new AbortController(), storage = bridgeStorage(); lifecycle.current = controller;
    let connector, unsubscribe, active = true;
    update({ loading: true, wallet: null, verified: null, signed: null, prepared: null, registration: null, submitted: false, error: "", link: "", qr: "", busy: false });
    async function initialize() {
      const config = await loadTonConfig({ signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      if (!active) return;
      connector = new TonConnect({ manifestUrl: config.manifestUrl, walletsListSource: new URL("/tonconnect-wallets.json", location.origin).href, storage, analytics: { mode: "off" }, disableAutoPauseConnection: true });
      runtime.current = connector;
      unsubscribe = connector.onStatusChange(async (wallet) => {
        if (!active) return;
        operation.current = null;
        const version = ++generation.current;
        connectedWallet.current = wallet;
        update({ wallet, verified: null, signed: null, prepared: null, registration: null, submitted: false, link: "", qr: "", error: "", busy: Boolean(wallet) });
        if (!wallet) { connectIntent.current?.abort(); update({ busy: false }); return; }
        try {
          if (wallet.account.chain !== CONTACT_CARD_NETWORK) throw Error("Переключите кошелёк на TON Testnet и подключитесь заново.");
          const request = challenge.current;
          if (!request || !wallet.connectItems?.tonProof?.proof) throw Error("Кошелёк не предоставил новое подтверждение TON Proof. Подключитесь заново.");
          if (request.claim.card.name !== profile.name || request.claim.card.username !== profile.username) throw Error("Профиль изменился. Закройте подпись и откройте заново.");
          const account = wallet.account;
          const verified = await tonCardRequest("proof", { challengeId: request.challengeId, network: account.chain,
            wallet: { address: account.address, stateInit: account.walletStateInit, ...(account.publicKey ? { publicKey: account.publicKey } : {}) }, proof: wallet.connectItems.tonProof.proof }, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
          if (active && generation.current === version) update({ verified, busy: false });
        } catch (error) { if (active && generation.current === version) update({ error: errorText(error), busy: false }); }
      }, (error) => { if (active) { operation.current = null; generation.current++; update({ error: errorText(error), busy: false, verified: null, signed: null, prepared: null }); } });
      const wallets = (await connector.getWallets()).filter((wallet) => ["tonkeeper", "mytonwallet"].includes(wallet.appName) && wallet.bridgeUrl && wallet.universalLink);
      if (active) update({ wallets, loading: false });
    }
    initialize().catch((error) => { if (active) update({ error: errorText(error), loading: false }); });
    return () => {
      active = false; operation.current = null; generation.current++; controller.abort(); connectIntent.current?.abort(); challenge.current = null; connectedWallet.current = null;
      unsubscribe?.(); connector?.pauseConnection(); storage.clear();
      if (runtime.current === connector) runtime.current = null;
    };
  }, [profile.name, profile.username, previous, retry]);

  async function connect(wallet) {
    const version = ++generation.current;
    connectIntent.current?.abort();
    const controller = new AbortController(); connectIntent.current = controller;
    const signal = AbortSignal.any([controller.signal, lifecycle.current.signal, AbortSignal.timeout(120000)]);
    signal.addEventListener("abort", () => {
      if (!lifecycle.current.signal.aborted && generation.current === version) {
        generation.current++; challenge.current = null;
        update({ busy: false, link: "", qr: "", error: "Время подключения истекло. Можно попробовать заново." });
      }
    }, { once: true });
    update({ busy: true, error: "", qr: "", link: "", verified: null, signed: null, prepared: null, registration: null });
    try {
      const request = await tonCardRequest("challenge", { previous }, { signal });
      if (signal.aborted || generation.current !== version) return;
      challenge.current = request;
      // SDK 4: proof is the second argument, lifecycle options are the third.
      const link = runtime.current.connect({ bridgeUrl: wallet.bridgeUrl, universalLink: wallet.universalLink }, { tonProof: request.payload }, { signal, openingDeadlineMS: 30000 });
      if (link) {
        update({ link });
        const qr = await QRCode.toDataURL(link, { width: 320, margin: 4, errorCorrectionLevel: "M" });
        if (!signal.aborted && generation.current === version) update({ qr });
      }
    } catch (error) { if (!lifecycle.current.signal.aborted && generation.current === version) update({ error: errorText(error), busy: false, link: "", qr: "" }); }
  }
  async function run(action) {
    if (operation.current) return;
    const token = {}; operation.current = token;
    const version = generation.current;
    update({ error: "", busy: true });
    try {
      const patch = await action();
      if (!lifecycle.current.signal.aborted && generation.current === version) update({ ...patch, busy: false });
    } catch (error) { if (!lifecycle.current.signal.aborted && generation.current === version) update({ error: errorText(error), busy: false }); }
    finally { if (operation.current === token) operation.current = null; }
  }
  const signal = () => AbortSignal.any([lifecycle.current.signal, AbortSignal.timeout(15000)]);
  const assertWallet = (address) => {
    const current = connectedWallet.current;
    if (!current || current.account.chain !== CONTACT_CARD_NETWORK || current.account.address.toLowerCase() !== address.toLowerCase()) throw Error("Кошелёк изменился. Подключитесь заново.");
  };
  return <section className="flex min-w-0 flex-col gap-4 border-t pt-4" aria-label="Подпись TON Testnet">
    <strong>{previous ? `Обновление визитки · версия ${previous.claim.revision + 1}` : "Подпись TON Testnet"}</strong>
    <p className="text-muted-foreground">Кошелёк подпишет имя и ссылку. Подписанный JSON также содержит публичный адрес кошелька и подписи. Это подтверждает контроль кошелька, а не личность человека.</p>
    {state.loading && <p role="status" className="flex items-center gap-2"><Spinner />Проверяем подключение…</p>}
    <ControlBar className="flex flex-col gap-2">
      {!state.wallet && state.wallets.map((wallet) => <Button key={wallet.appName} type="button" variant="outline" disabled={state.busy} onClick={() => connect(wallet)}><Wallet aria-hidden="true" />{wallet.name}</Button>)}
      {state.wallet && <Button type="button" variant="outline" disabled={state.busy} onClick={() => run(async () => { await runtime.current.disconnect({ signal: signal() }); return { wallet: null, verified: null, signed: null, prepared: null, registration: null }; })}>Выбрать другой кошелёк</Button>}
      {(state.error || !state.wallets.length && !state.loading) && <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Повторить подключение</Button>}
    </ControlBar>
    {state.link && <div className="flex flex-col items-center gap-2">
      {state.qr && <img className="aspect-square w-[clamp(8rem,calc(var(--app-visual-height,100dvh)-16rem),16rem)] max-w-full rounded-xl" src={state.qr} alt="QR подключения Testnet-кошелька" />}
      <ControlBar className="flex w-full flex-col gap-2"><Button nativeButton={false} render={<a href={state.link} target="_blank" rel="noopener noreferrer" />}><ArrowUpRight aria-hidden="true" />Открыть кошелёк</Button><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Отменить подключение</Button></ControlBar>
      <p role="status">Подтвердите подключение в Testnet-кошельке.</p>
    </div>}
    {state.verified && <>
      <p className="break-all">Кошелёк подтверждён для этой подписи: {state.verified.address}</p>
      <ControlBar className="flex flex-col gap-2"><Button type="button" disabled={state.busy || Boolean(state.signed)} onClick={() => run(async () => {
        assertWallet(state.verified.address);
        const signedData = await runtime.current.signData(state.verified.signPayload, { signal: lifecycle.current.signal });
        assertWallet(state.verified.address);
        const signed = await tonCardRequest("signature", { ticket: state.verified.ticket, signedData }, { signal: signal() });
        return { signed, prepared: null, submitted: false, registration: null };
      })}>Подписать визитку</Button></ControlBar>
    </>}
    {state.signed && <>
      <p role="status">Подпись визитки проверена · версия {state.signed.claim.revision}.{!state.prepared && " Регистрация в блокчейне требует отдельной транзакции."}</p>
      <ControlBar className="flex flex-col gap-2"><Button type="button" disabled={state.busy} onClick={() => run(() => {
        const bundle = state.prepared ? { ...state.signed, registry: { address: state.prepared.address, network: CONTACT_CARD_NETWORK, codeHash: state.prepared.codeHash } } : state.signed;
        downloadContactFile(signedContactCardDownload(bundle)); return {};
      })}><Download aria-hidden="true" />Скачать подпись</Button></ControlBar>
      <label className="flex flex-col gap-2">Адрес кошелька восстановления Testnet<Input value={recovery} disabled={state.busy} autoComplete="off" spellCheck={false} placeholder="kQ… или 0:…" onChange={(event) => { setRecovery(event.target.value); update({ prepared: null, submitted: false, registration: null }); }} /></label>
      <p className="text-muted-foreground">Укажите отдельный кошелёк, которым вы управляете. Восстановление владельца потребует семи дней ожидания. Seed-фразы и приватные ключи не нужны.</p>
      <ControlBar className="flex flex-col gap-2"><Button type="button" variant="outline" disabled={state.busy || !recovery.trim()} onClick={() => run(async () => {
        assertWallet(state.signed.wallet.address);
        const prepared = await tonCardRequest("registry/prepare", { bundle: state.signed, recovery: recovery.trim() }, { signal: signal() });
        return { prepared, submitted: false, registration: null };
      })}>Подготовить запись</Button></ControlBar>
    </>}
    {state.prepared && <div className="flex min-w-0 flex-col gap-4">
      <p>TON Testnet · 0,05 тестового TON на баланс вашего реестра. Кошелёк отдельно покажет комиссию.</p>
      <dl className="flex min-w-0 flex-col gap-2 break-all"><div><dt>Адрес реестра</dt><dd>{state.prepared.address}</dd></div><div><dt>Владелец</dt><dd>{state.prepared.owner}</dd></div><div><dt>Восстановление</dt><dd>{state.prepared.recovery}</dd></div><div><dt>Хэш визитки</dt><dd>{state.prepared.hash}</dd></div><div><dt>Хэш кода контракта</dt><dd>{state.prepared.codeHash}</dd></div></dl>
      <ControlBar className="flex flex-col gap-2">
        <Button type="button" disabled={state.busy || state.submitted} onClick={() => run(async () => {
          assertWallet(state.prepared.owner);
          if (state.prepared.transaction.network !== CONTACT_CARD_NETWORK || state.prepared.transaction.from !== state.prepared.owner) throw Error("Транзакция не соответствует владельцу TON Testnet.");
          if (Date.now() / 1000 >= state.prepared.transaction.validUntil) throw Error("Транзакция устарела. Подготовьте запись ещё раз.");
          await runtime.current.sendTransaction(state.prepared.transaction, { signal: lifecycle.current.signal });
          return { submitted: true, registration: null };
        })}>Подтвердить в кошельке</Button>
        <Button type="button" variant="outline" disabled={state.busy} onClick={() => run(async () => ({ registration: await tonCardRequest("registry/check", { address: state.prepared.address, bundle: state.signed }, { signal: signal() }) }))}>Проверить запись в сети</Button>
      </ControlBar>
      {state.submitted && !state.registration?.matches && <p role="status">Кошелёк отправил запрос. Дождитесь обработки и проверьте запись в сети.</p>}
      {state.registration && <p role="status">{state.registration.active && state.registration.matches ? "Запись подтверждена в TON Testnet: владелец, версия, хэш и код совпадают." : "Запись этой версии пока не подтверждена в TON Testnet. Подождите и проверьте снова."}</p>}
    </div>}
    {state.error && <p role="alert">{state.error}</p>}
  </section>;
}
