import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatTon, TON_TESTNET } from "../../shared/ton.js";

export function TonBalance({ address, chain }) {
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    let controller;
    async function update() {
      if (document.visibilityState === "hidden") return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const signal = AbortSignal.any([current.signal, AbortSignal.timeout(8_000)]);
      setLoading(true);
      try {
        const search = new URLSearchParams({ address, chain });
        const response = await fetch(`/api/ton-connect/balance?${search}`, { credentials: "include", signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Не удалось получить баланс TON.");
        if (data.address !== address.toLowerCase() || data.chain !== chain) throw new Error("Не удалось проверить баланс этого кошелька.");
        formatTon(data.nanotons);
        if (active && controller === current && !current.signal.aborted) { setBalance(data); setError(""); }
      } catch (cause) {
        if (active && controller === current && !current.signal.aborted) setError(signal.aborted || cause instanceof TypeError ? "Не удалось связаться с сетью TON. Попробуйте обновить баланс." : cause.message || "Не удалось обновить баланс TON.");
      } finally { if (active && controller === current && !current.signal.aborted) setLoading(false); }
    }
    update();
    const timer = setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => { active = false; controller?.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [address, chain, refresh]);
  return <div className="flex flex-col gap-2" aria-label="Баланс TON">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1" aria-live="polite">
        <span className="text-xs text-muted-foreground">{chain === TON_TESTNET ? "Баланс в тестовой сети" : "Баланс кошелька"}</span>
        <p className="break-all font-heading text-3xl leading-9 font-semibold">{balance ? `${formatTon(balance.nanotons)} TON` : loading ? <span className="flex items-center gap-2"><Spinner />Загрузка…</span> : "Баланс недоступен"}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label="Обновить баланс TON" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
        {loading ? <Spinner /> : <RefreshCw aria-hidden="true" />}
      </Button>
    </div>
    {error && <p role="alert" className="text-destructive">{error}{balance ? " Показан предыдущий баланс." : ""}</p>}
    {balance && <span className="text-xs text-muted-foreground">Обновлено в {new Date(balance.fetchedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>}
  </div>;
}
