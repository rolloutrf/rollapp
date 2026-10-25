import { useEffect, useRef, useState } from "react";
import { FileCheck } from "lucide-react";
import { tonCardRequest } from "@/lib/ton-card-api";
import { ControlBar } from "@/components/control-bar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SignedCardVerifier({ profile, onUpdate }) {
  const input = useRef(null), request = useRef(null), epoch = useRef(0);
  const [state, setState] = useState({ busy: false, error: "", verified: null, bundle: null, registration: null });
  useEffect(() => () => { epoch.current++; request.current?.abort(); }, []);
  async function verifyFile(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const version = ++epoch.current; request.current?.abort(); request.current = new AbortController();
    setState({ busy: true, error: "", verified: null, bundle: null, registration: null });
    try {
      if (file.size > 65536) throw Error("Файл должен быть не больше 64 КБ");
      let bundle;
      try { bundle = JSON.parse(await file.text()); } catch { throw Error("Не удалось прочитать JSON визитки"); }
      const verified = await tonCardRequest("verify", { bundle }, { signal: AbortSignal.any([request.current.signal, AbortSignal.timeout(15000)]) });
      if (version === epoch.current) setState({ busy: false, error: "", verified, bundle, registration: null });
    } catch (error) { if (version === epoch.current) setState({ busy: false, error: error.message || "Подпись не прошла проверку", verified: null, bundle: null, registration: null }); }
  }
  async function checkRegistry() {
    const version = ++epoch.current; request.current?.abort(); request.current = new AbortController();
    setState((value) => ({ ...value, busy: true, error: "" }));
    try {
      const registration = await tonCardRequest("registry/check", { address: state.verified.registry.address, bundle: state.bundle }, { signal: AbortSignal.any([request.current.signal, AbortSignal.timeout(20000)]) });
      if (version === epoch.current) setState((value) => ({ ...value, busy: false, registration }));
    } catch (error) { if (version === epoch.current) setState((value) => ({ ...value, busy: false, registration: null, error: error.message })); }
  }
  return <section className="flex min-w-0 flex-col gap-2 border-t pt-4" aria-label="Проверка подписанной визитки">
    <Input ref={input} hidden type="file" accept=".json,application/json" aria-label="Файл подписанной визитки" onChange={verifyFile} />
    <ControlBar className="flex flex-col gap-2"><Button type="button" variant="outline" disabled={state.busy} onClick={() => input.current?.click()}><FileCheck aria-hidden="true" />Проверить файл</Button></ControlBar>
    {state.busy && <p role="status">Проверяем подпись…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.verified && <div className="flex min-w-0 flex-col gap-2 break-words">
      <p role="status">Подпись файла действительна · версия {state.verified.revision} · TON Testnet</p>
      <strong>{state.verified.card.name}</strong>
      <p className="break-all">Кошелёк: {state.verified.address}</p><p className="break-all">Домен подписи: {state.verified.domain}</p>
      <p className="text-muted-foreground">Подпись подтверждает контроль кошелька на момент подписания. Личность человека и текущее состояние реестра проверяются отдельно.</p>
      {state.verified.registry && <ControlBar className="flex flex-col gap-2"><Button type="button" variant="outline" disabled={state.busy} onClick={checkRegistry}>Проверить реестр Testnet</Button></ControlBar>}
      {state.registration && <p role="status">{state.registration.active && state.registration.matches ? "Файл совпадает с текущей записью в TON Testnet." : "Файл не подтверждён текущей записью в TON Testnet."}</p>}
      {onUpdate && state.verified.card.username === profile.username && <ControlBar className="flex flex-col gap-2"><Button type="button" variant="outline" disabled={state.busy} onClick={() => onUpdate(state.bundle)}>Подписать обновление</Button></ControlBar>}
    </div>}
  </section>;
}
