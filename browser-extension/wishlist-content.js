(() => {
  const maxItems = 1000;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const ownMarketList = /^\/wishlist\/[0-9a-f-]{36}\/?$/i;
  const favoriteContent = '[id^="/content/page/layout/content/content/lazyGenerator"]';
  const selectors = {
    "yandex-market": {
      product: /\/(?:card\/[^/]+|product--[^/]+)\/\d+\/?$/,
      title: '[data-auto="snippet-title"]',
      price: '[data-auto="snippet-price-current"]',
    },
    ozon: {
      product: /\/product\/(?:[^/]+-)?\d+\/?$/,
    },
    wb: {
      product: /\/catalog\/\d+\/detail\.aspx$/,
      title: '.product-card__name',
      price: '.price__lower-price',
    },
  };

  function sameSiteLink(anchor, pattern) {
    const url = URL.parse(anchor?.href);
    if (!url || url.origin !== location.origin || !pattern.test(url.pathname)) return null;
    return url.origin + url.pathname;
  }

  function linksWithin(scope, pattern) {
    return [...new Set([...scope.querySelectorAll("a[href]")].filter((a) => a.getClientRects().length).map((a) => sameSiteLink(a, pattern)).filter(Boolean))];
  }

  function firstMoney(value) {
    const amount = /(\d[\d\s]*(?:[,.]\d{1,2})?)\s*₽/.exec(value || "")?.[1];
    const price = Number(amount?.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(price) ? price : null;
  }

  function cardItem(card, titleNode, config) {
    const anchor = titleNode?.closest("a[href]") || [...card.querySelectorAll("a[href]")].find((a) => sameSiteLink(a, config.product));
    const url = sameSiteLink(anchor, config.product);
    const image = card.querySelector('img[src^="https:"]');
    const title = (titleNode?.getAttribute("title") || titleNode?.textContent || image?.alt || "").trim();
    if (!url || !title) return null;
    return { url, title: title.slice(0, 160), imageUrl: image?.currentSrc || image?.src || "", price: firstMoney(card.querySelector(config.price || "[data-price]")?.textContent) };
  }

  function yandexListIndex() {
    const create = [...document.querySelectorAll("button")]
      .find((node) => node.innerText.trim() === "Новый список или вишлист");
    if (!create) return null;
    const scope = create.closest('ul, [role="list"]') || create.parentElement?.parentElement;
    if (!scope) return null;
    const isBefore = (left, right) => Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
    const popular = [...scope.querySelectorAll("span, p, h2, h3, div")]
      .find((node) => node.textContent.trim() === "Популярные" && isBefore(create, node));
    const links = [...scope.querySelectorAll("a[href]")].filter((a) => isBefore(create, a) && (!popular || isBefore(a, popular)))
      .map((a) => sameSiteLink(a, ownMarketList)).filter(Boolean);
    return { scope, items: [], links };
  }

  function yandexRead(kind) {
    if (kind === "lists") return yandexListIndex();
    const config = selectors["yandex-market"];
    const layout = document.querySelector('[data-auto="wishlistLayout"]');
    const scope = kind === "list" ? layout : document.querySelector(favoriteContent);
    const cards = [...(scope?.querySelectorAll('[data-zone-name="productSnippet"]') || [])]
      .filter((card) => kind === "list" || card.querySelector('button[id^="wishlist-toggle-"][aria-label="Удалить из избранного"]'));
    const items = cards.map((card) => cardItem(card, card.querySelector(config.title), config));
    const empty = /в избранном пока (?:ничего нет|пусто)|в списке пока (?:ничего нет|пусто)|нет товаров в (?:списке|избранном)|список пуст/i.test(document.body.innerText);
    const expected = kind === "list" ? Number(/(?:^|[\s•])(\d+)\s*товар(?:а|ов)?(?![а-яё])/i.exec(layout?.innerText.split("\n").slice(0, 12).join("\n") || "")?.[1]) : null;
    return (cards.length || empty) && items.every(Boolean) ? { scope, items, links: [], expected, empty: empty && !cards.length } : null;
  }

  class MarketplaceAccessError extends Error {
    code = "marketplace_access_required";
  }

  function ozonRead(kind) {
    const config = selectors.ozon;
    const status = [...document.querySelectorAll('[data-widget="statusWidget"]')].map((node) => node.innerText).join("\n");
    const listIndex = kind === "collections" || kind === "lists";
    const loginButton = listIndex && [...document.querySelectorAll('[data-widget="buttonWidget"] button')]
      .some((button) => button.innerText.trim() === "Войти в аккаунт");
    if (loginButton || /войдите, чтобы|войти в аккаунт/i.test(status)) {
      throw new MarketplaceAccessError("Войдите в Ozon в этом браузере и повторите импорт.");
    }
    if (listIndex) {
      const links = linksWithin(document, /^\/(?:selections\/(?!list(?:\/|$))[^/]+|my\/favorites\/(?:lists\/[^/]+|(?!lists(?:\/|$))[^/]+))\/?$/);
      const empty = /(?:подборок|вишлистов) пока нет|нет (?:подборок|вишлистов)/i.test(status);
      return links.length || empty ? { items: [], links, empty: empty && !links.length } : null;
    }
    // Recommendation grids are separate Ozon widgets and must never supply imported cards.
    const grids = [...document.querySelectorAll(kind === "linked-list"
      ? '[data-widget="wishlist"], [data-widget="selectionProducts"]'
      : '[data-widget="favoriteProducts"], [data-widget="favorites"], [data-widget="wishlist"], [data-widget="selectionProducts"]')];
    const cards = grids.flatMap((grid) => [...grid.querySelectorAll('[data-index], [data-widget="tile"]')].filter((card) => !card.parentElement.closest('[data-index], [data-widget="tile"]')));
    const items = cards.map((card) => {
      const anchors = [...card.querySelectorAll('a[href*="/product/"]')];
      return cardItem(card, anchors.find((a) => a.textContent.trim()), config);
    });
    const empty = /в избранном пока пусто|в этом вишлисте пока нет|в подборке пока нет/i.test(status);
    return (cards.length || empty) && items.every(Boolean) ? { scope: grids.at(-1), items, links: [], empty: empty && !cards.length } : null;
  }

  function wbRead(kind) {
    const config = selectors.wb;
    const scope = document.querySelector(kind === "linked-list" && location.pathname.startsWith("/wishlist/")
      ? ".wishlist, .lk-wishlist, #wishlist, .favorites, .lk-favorites, #favorites"
      : ".favorites, .lk-favorites, #favorites");
    if (!scope) return null;
    const cards = [...scope.querySelectorAll(".product-card")];
    const items = cards.map((card) => cardItem(card, card.querySelector(config.title), config));
    const links = linksWithin(scope, /^\/lk\/favorites\/(?:list|folder)\/[^/]+\/?$/);
    const empty = /в избранном пока (?:пусто|ничего нет)|список пуст/i.test(scope.innerText);
    return (cards.length || empty || kind !== "linked-list" && links.length) && items.every(Boolean) ? { scope, items, links, empty: empty && !cards.length } : null;
  }

  const readers = { "yandex-market": yandexRead, ozon: ozonRead, wb: wbRead };

  function checkAccess() {
    const text = document.body.innerText;
    if (/captcha|showcaptcha|\/security\/login|\/auth\/login/.test(location.pathname)
      || /вы не робот|доступ ограничен/i.test(document.title)
      || /подтвердите, что запросы отправляли вы/i.test(text)) {
      throw new MarketplaceAccessError("Завершите вход или проверку на сайте магазина и повторите импорт.");
    }
  }

  async function collect(provider, kind, timeoutMs) {
    const reader = readers[provider];
    if (!reader) throw new Error("Неизвестный магазин.");
    const deadline = Date.now() + timeoutMs;
    const items = new Map();
    const links = new Set();
    let stable = 0;
    let lastSize = "";
    while (Date.now() < deadline) {
      checkAccess();
      const page = reader(kind);
      if (page) {
        for (const item of page.items) items.set(item.url, item);
        for (const link of page.links) links.add(link);
        if (items.size > maxItems || links.size > 100) throw new Error("В магазине слишком много позиций для одного импорта.");
        const scroll = document.scrollingElement;
        const atEnd = page.empty || (page.scope ? page.scope.getBoundingClientRect().bottom <= innerHeight + 8
          : scroll.scrollTop + innerHeight >= scroll.scrollHeight - 8);
        const size = `${items.size}/${links.size}/${scroll.scrollHeight}`;
        const loading = page.scope?.querySelector('[aria-busy="true"]');
        const more = [...(page.scope?.querySelectorAll("button:not(:disabled)") || [])].find((button) =>
          button.getClientRects().length && /^(?:показать|загрузить) ещ[её](?: товары)?$/i.test(button.innerText.trim()));
        if (atEnd && more && !loading && lastSize !== size) {
          more.click();
          stable = 0;
        }
        stable = atEnd && !loading && !more && lastSize === size ? stable + 1 : 0;
        lastSize = size;
        if (stable >= 3 && (!Number.isFinite(page.expected) || items.size === page.expected)) {
          return { items: [...items.values()], links: [...links] };
        }
        // Advance one viewport so intersection-based pagination is triggered before the footer.
        window.scrollBy({ top: Math.max(300, innerHeight * .85), behavior: "instant" });
      }
      await delay(300);
    }
    throw new Error("Не удалось прочитать список целиком. Откройте избранное в магазине и повторите импорт.");
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "ROLLAPP_COLLECT_WISHLIST") return false;
    if (message.kind === "linked-list" && message.linkedPage !== location.href) {
      sendResponse({ ok: false, error: "Страница списка сменилась во время импорта. Повторите обновление." });
      return false;
    }
    collect(message.provider, message.kind, message.timeoutMs)
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message, code: error.code }));
    return true;
  });
})();
