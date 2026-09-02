import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { api } from "@/api.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketplaceLogo } from "@/components/marketplace-logo.jsx";
import { marketplaceOfferMatchesWish, marketplaceOffersForWish, mergeMarketplaceOffers } from "@/lib/marketplace-offers.js";

const MARKETPLACE_MARK_CLASSES = {
  ozon: "bg-sky-500/15 text-sky-400",
  wildberries: "bg-fuchsia-500/15 text-fuchsia-400",
  "yandex-market": "bg-yellow-400/15 text-yellow-300",
  megamarket: "bg-blue-500/15 text-blue-400",
  dns: "bg-orange-500/15 text-orange-400",
  amazon: "bg-amber-500/15 text-amber-300",
  aliexpress: "bg-red-500/15 text-red-400",
  avito: "bg-violet-500/15 text-violet-400",
  mvideo: "bg-red-500/15 text-red-400",
  samokat: "bg-[#ef425c] text-white",
  lavka: "bg-[#ffd635] text-black",
  lenta: "bg-[#123b8e] text-[#ffd53d]",
  vkusvill: "bg-[#0c9f36] text-white",
  "auto-ru": "bg-[#ff3b30] text-white",
  "avito-auto": "bg-[#00aaff] text-white",
  drom: "bg-[#d71920] text-white",
  source: "bg-muted text-muted-foreground",
};

function marketplaceMark(offer) {
  if (offer.mark) return offer.mark;
  if (offer.marketplaceId === "wildberries") return "WB";
  if (offer.marketplaceId === "yandex-market") return "Я";
  if (offer.marketplaceId === "dns") return "DNS";
  if (offer.marketplaceId === "auto-ru") return "A";
  if (offer.marketplaceId === "avito-auto") return "A";
  if (offer.marketplaceId === "drom") return "D";
  return String(offer.marketplace || "М").slice(0, 1).toUpperCase();
}

function streamMessage(block) {
  let event = "message";
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

async function readOfferStream(response, onMessage) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error || "Не удалось запустить поиск предложений");
    error.code = payload.code || "";
    error.status = response.status;
    error.retryAfterSeconds = Number(payload.retryAfterSeconds || response.headers.get("Retry-After")) || 0;
    throw error;
  }
  if (!response.body) throw new Error("Браузер не поддерживает потоковое обновление");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const message = streamMessage(block);
      if (message) onMessage(message);
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const message = streamMessage(buffer);
    if (message) onMessage(message);
  }
}

function retryAfterLabel(seconds) {
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} мин`;
  return `${Math.max(1, seconds)} сек`;
}

export function MarketplaceOffers({ wish, owner = false, formatPrice }) {
  const savedOffers = useMemo(() => marketplaceOffersForWish(wish), [wish]);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const refreshControllerRef = useRef(null);

  useEffect(() => {
    if (!owner) return undefined;
    let active = true;
    api.get(`/wishes/${wish.id}/marketplace-offers`).then((payload) => {
      if (!active) return;
      setSnapshot(payload.snapshot || null);
    }).catch((loadError) => {
      if (active) setError(loadError.message || "Не удалось загрузить предложения");
    });
    return () => {
      active = false;
      refreshControllerRef.current?.abort();
    };
  }, [owner, wish.id]);

  useEffect(() => {
    if (!retryAt) return undefined;
    const updateClock = () => {
      const currentTime = Date.now();
      setClock(currentTime);
      if (currentTime >= retryAt) {
        setRetryAt(0);
        setError("");
        setErrorCode("");
      }
    };
    updateClock();
    const timer = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const refresh = async () => {
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    setLoading(true);
    setError("");
    setErrorCode("");
    try {
      const response = await fetch(`/api/wishes/${encodeURIComponent(wish.id)}/marketplace-offers/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: controller.signal,
      });
      let completed = false;
      await readOfferStream(response, ({ event, data }) => {
        if (event === "done") {
          completed = true;
          setSnapshot(data.snapshot || null);
          setRetryAt(0);
        }
        if (event === "error") {
          const streamError = new Error(data.error || "Не удалось обновить предложения");
          streamError.code = data.code || "";
          throw streamError;
        }
      });
      if (!completed) throw new Error("Поиск завершился без списка предложений");
    } catch (refreshError) {
      if (refreshError.name !== "AbortError") {
        setError(refreshError.message || "Не удалось обновить предложения");
        setErrorCode(refreshError.code || "");
        if (refreshError.status === 429 && refreshError.retryAfterSeconds > 0) {
          setRetryAt(Date.now() + refreshError.retryAfterSeconds * 1_000);
          setClock(Date.now());
        }
      }
    } finally {
      if (refreshControllerRef.current === controller) refreshControllerRef.current = null;
      setLoading(false);
    }
  };

  const aiOffers = (Array.isArray(snapshot?.offers) ? snapshot.offers : [])
    .filter((offer) => marketplaceOfferMatchesWish(wish, offer));
  const offers = mergeMarketplaceOffers(aiOffers, savedOffers);
  if (!offers.length && !owner) return null;
  const bestLiveOfferIndex = offers.findIndex((offer) => !offer.source);
  const retrySeconds = retryAt ? Math.max(0, Math.ceil((retryAt - clock) / 1_000)) : 0;
  const visibleError = errorCode === "marketplace_offers_rate_limited" && retrySeconds > 0
    ? `Для этого товара поиск запускался слишком часто. Повторить можно через ${retryAfterLabel(retrySeconds)}.`
    : error;

  return (
    <section className="mx-auto grid min-w-0 w-full max-w-md grid-cols-1 gap-3" aria-label="Предложения">

      {visibleError && <p className={`text-sm ${errorCode === "marketplace_offers_not_found" ? "text-muted-foreground" : "text-destructive"}`} role={errorCode === "marketplace_offers_not_found" ? "status" : "alert"}>{visibleError}</p>}
      {offers.length > 0 ? <div className="grid min-w-0 grid-cols-1 gap-2" role="list">
        {offers.map((offer, index) => (
          <a
            key={offer.id || `${offer.marketplaceId}:${offer.url}`}
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            role="listitem"
            className="group flex min-h-16 min-w-0 w-full max-w-full items-center gap-2.5 rounded-2xl border bg-card px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`${offer.exact ? "Открыть предложение" : "Найти товар"} на ${offer.marketplace}`}
          >
            <MarketplaceLogo
              marketplaceId={offer.marketplaceId}
              fallback={marketplaceMark(offer)}
              fallbackClassName={MARKETPLACE_MARK_CLASSES[offer.marketplaceId] || MARKETPLACE_MARK_CLASSES.source}
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <strong className="truncate text-sm font-semibold">{offer.marketplace}</strong>
                {aiOffers.length > 0 && (offer.source || index === bestLiveOfferIndex) && <Badge variant="secondary" className="shrink-0">{offer.source ? "Исходная ссылка" : "Лучшее"}</Badge>}
              </span>
              <small className="block truncate text-sm text-muted-foreground">
                {aiOffers.length ? offer.title : "Сохранённая карточка"}
              </small>
              {aiOffers.length > 0 && (offer.delivery || offer.seller) && <small className="block truncate text-muted-foreground">{[offer.seller, offer.delivery].filter(Boolean).join(" · ")}</small>}
            </span>
            <span className="shrink-0 text-right">
              <strong className="block whitespace-nowrap text-sm font-semibold tabular-nums">
                {offer.price == null ? "Смотреть" : formatPrice(offer.price, offer.currency)}
              </strong>
              <small className="text-muted-foreground">{offer.price == null ? "цены" : offer.available === true ? "в наличии" : "наличие?"}</small>
            </span>
            <ExternalLink className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
          </a>
        ))}
      </div> : <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">Конкретные предложения пока не найдены.</p>}

      {owner && <div className="flex">
        <Button className="w-full" type="button" size="sm" disabled={loading || retrySeconds > 0} aria-busy={loading || undefined} onClick={refresh}>
          {loading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {loading ? "Ищем" : retrySeconds > 0 ? `Через ${retryAfterLabel(retrySeconds)}` : aiOffers.length ? "Обновить" : "Найти лучшие"}
        </Button>
      </div>}

    </section>
  );
}
