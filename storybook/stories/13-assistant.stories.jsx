import { GiftSuggestionsPanel } from "@/modules/assistant/gift-suggestions.jsx";
import { MarketplaceOffers } from "@/modules/assistant/marketplace-offers.jsx";
import { formatMoney } from "@/modules/card/price.jsx";
import { Page, Scenario, owner, person, fixtureError, hold, noop } from "../support.jsx";
import { sampleWish } from "../samples.js";

export default { id: "rollapp-assistant", title: "РОЛЛАПП/Модули/13 Ассистент" };

function streamOffers(offers, state, signal) {
  return new Response(new ReadableStream({
    start(controller) {
      const encode = new TextEncoder();
      const event = (name, data) => controller.enqueue(encode.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
      const preview = setTimeout(() => event("offers", { offers }), 300);
      const complete = setTimeout(() => {
        if (state === "fallback") event("warning", { warning: "Нейропоиск не ответил вовремя. Доступны предложения магазинов.", code: "marketplace_ai_timeout" });
        event("done", { snapshot: { offers } });
        controller.close();
        signal?.removeEventListener("abort", stop);
      }, 850);
      function stop() {
        clearTimeout(preview);
        clearTimeout(complete);
        controller.close();
      }
      event("status", { message: "Ищем товар на маркетплейсах…" });
      if (signal?.aborted) stop();
      else signal?.addEventListener("abort", stop, { once: true });
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
}

function Offers({ state }) {
  const wish = { ...sampleWish, url: "https://ozon.ru/product/123/" };
  const offers = [
    { id: "offer-1", marketplaceId: "ozon", marketplace: "Ozon", title: wish.title, url: wish.url, price: 2400, currency: "RUB", exact: true },
    { id: "offer-2", marketplaceId: "yandex-market", marketplace: "Яндекс Маркет", title: wish.title, url: "https://market.yandex.ru/card/figurka/123", price: 2900, currency: "RUB", exact: true },
  ];
  const data = { aiConfigured: state !== "unconfigured", snapshot: state === "ready" ? { offers } : null };
  return <Scenario routes={{
    "GET /wishes/storybook-wish/marketplace-offers": state === "loading" ? hold : state === "error" ? () => { throw fixtureError("Не удалось загрузить предложения."); } : data,
    "FETCH POST /api/wishes/storybook-wish/marketplace-offers/refresh": (_, options) => streamOffers(offers, state, options.signal),
  }}><Page title="Предложения магазинов"><MarketplaceOffers wish={wish} owner formatPrice={formatMoney} /></Page></Scenario>;
}

export const GiftRecommendations = { name: "Кому ещё подарить", render: () => <Scenario><Page><GiftSuggestionsPanel onOpenWish={noop} items={[
  { wishId: sampleWish.id, title: sampleWish.title, imageUrl: sampleWish.imageUrl, participantCount: 4, participants: [owner, person] },
]} /></Page></Scenario> };
export const Results = { name: "Предложения с ценами", render: Offers, args: { state: "ready" } };
export const Empty = { ...Results, name: "Поиск ещё не запускался", args: { state: "empty" } };
export const Disabled = { ...Results, name: "Без подключения нейропоиска", args: { state: "unconfigured" } };
export const Loading = { ...Results, name: "Проверка снимка предложений", args: { state: "loading" } };
export const Error = { ...Results, name: "Ошибка чтения предложений", args: { state: "error" } };
export const Fallback = { ...Results, name: "Прямые предложения после таймаута нейропоиска", args: { state: "fallback" } };
