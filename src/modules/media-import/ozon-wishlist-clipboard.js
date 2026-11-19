const clipboardPrefix = "ROLLAPP_OZON_WISHLIST_V1\n";
const maxItems = 1000;

// The bookmark runs on Ozon, so its implementation must be self-contained.
async function copyOpenOzonWishlist(prefix, limit) {
  const listUrl = location.href;
  const list = new URL(listUrl);
  const listIds = list.searchParams.getAll("list");
  if (!["https://www.ozon.ru", "https://ozon.ru"].includes(list.origin)
    || !/^\/my\/favorites\/list\/?$/.test(list.pathname)
    || listIds.length !== 1 || !/^[\w-]{1,128}$/.test(listIds[0])) {
    alert("Войдите в Ozon и откройте нужный вишлист, затем снова нажмите закладку.");
    return;
  }
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    alert("Этот браузер не поддерживает копирование списка из закладки. Откройте список в Chrome или Comet.");
    return;
  }

  const listWidgets = '[data-widget="wishlist"], [data-widget="favoriteProducts"], [data-widget="favorites"]';
  const nonListWidgets = '[data-widget*="recommend" i], [data-widget*="similar" i], [data-widget*="popular" i]';
  const productLinks = 'a[href*="/product/"]';
  const initialTop = window.scrollY;
  const items = new Map();
  let stopped = false;
  const readCards = (anchors) => {
    for (const anchor of anchors) {
      if (!anchor.getClientRects().length || anchor.closest(nonListWidgets)) continue;
      const url = new URL(anchor.href, listUrl);
      const id = /^\/product\/(?:[^/]+-)?(\d{1,20})\/?$/.exec(url.pathname)?.[1];
      if (!id || url.origin !== list.origin) continue;
      const text = (anchor.innerText || anchor.textContent).trim();
      const image = anchor.querySelector("img");
      const imageUrl = image?.currentSrc || image?.src || "";
      const previous = items.get(id);
      const title = (anchor.getAttribute("title") || text).replace(/\0/g, "").trim().slice(0, 160);
      const alt = (image?.alt || "").replace(/\0/g, "").trim().slice(0, 160);
      items.set(id, {
        url: previous?.url || url.origin + url.pathname,
        title: previous?.title || title,
        alt: previous?.alt || alt,
        imageUrl: previous?.imageUrl || imageUrl.slice(0, 1000),
      });
    }
    if (items.size > limit) throw new Error(`В списке больше ${limit} товаров. Откройте список меньшего размера.`);
  };
  const makeClipboardContent = () => {
    const products = [...items.values()].map(({ url, title, alt, imageUrl }) => ({ url, title: title || alt, imageUrl }));
    if (products.some(({ title }) => !title)) throw new Error("Ozon не показал названия всех товаров. Дождитесь загрузки списка и повторите.");
    return new Blob([prefix, JSON.stringify(products)], { type: "text/plain" });
  };
  const gather = async () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      readCards([...document.querySelectorAll(productLinks)].filter((anchor) => range.intersectsNode(anchor)));
      if (items.size) return makeClipboardContent();
    }
    let reachedStart = false;
    let stable = 0;
    let previousSize = -1;
    let lastMoreButton;
    let lastMoreSize;
    const deadline = Date.now() + 20_000;
    while (!stopped && Date.now() < deadline) {
      if (location.href !== listUrl) throw new Error("Вишлист сменился. Запустите копирование из нужного списка.");
      const scopes = [...document.querySelectorAll(listWidgets)].filter((element) =>
        element.getClientRects().length && !element.closest(nonListWidgets));
      if (!reachedStart && scopes.length) {
        reachedStart = true;
        const top = window.scrollY + scopes[0].getBoundingClientRect().top;
        if (top < window.scrollY) {
          window.scrollTo({ top, behavior: "instant" });
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }
      }
      for (const scope of scopes) readCards(scope.querySelectorAll(productLinks));
      const end = scopes.at(-1);
      if (end && items.size) {
        const bottom = end.getBoundingClientRect().bottom <= innerHeight + 8;
        const loading = scopes.some((scope) => scope.querySelector('[aria-busy="true"]'));
        const more = [...end.querySelectorAll("button:not(:disabled)")].find((button) =>
          button.getClientRects().length && /^(?:показать|загрузить) ещ[её](?: товары)?$/i.test(button.innerText.trim()));
        stable = bottom && !loading && !more && previousSize === items.size ? stable + 1 : 0;
        if (stable >= 3) return makeClipboardContent();
        if (bottom && more && !loading && (lastMoreButton !== more || lastMoreSize !== items.size)) {
          lastMoreButton = more;
          lastMoreSize = items.size;
          more.click();
        }
        previousSize = items.size;
        window.scrollBy({ top: Math.max(300, innerHeight * 0.8), behavior: "instant" });
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(items.size
      ? "Список не успел загрузиться целиком. Прокрутите его до конца и нажмите закладку ещё раз."
      : "Не вижу карточек этого списка. Если они уже загружены, выделите их на странице Ozon и снова нажмите закладку.");
  };

  let message = "";
  try {
    const content = gather().catch((error) => {
      message = error.message;
      throw error;
    });
    void content.catch(() => {});
    // Start writing during the bookmark gesture; collection can finish after it.
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": content })]);
    alert(`Скопировано товаров: ${items.size}. В Rollapp нажмите «Импортировать из буфера».`);
  } catch {
    alert(message || "Браузер не разрешил скопировать список. Оставьте вкладку Ozon открытой и повторите.");
  } finally {
    stopped = true;
    if (location.href === listUrl) window.scrollTo({ top: initialTop, behavior: "instant" });
  }
}

export function ozonWishlistBookmark() {
  return `javascript:${encodeURIComponent(`void (${copyOpenOzonWishlist.toString()})(${JSON.stringify(clipboardPrefix)},${maxItems})`)}`;
}

const maxClipboardSize = 2_000_000;
const productPath = /^\/product\/(?:[^/]+-)?(\d{1,20})\/?$/;
const ozonOrigins = new Set(["https://www.ozon.ru", "https://ozon.ru"]);

function ozonProduct(value) {
  const url = typeof value === "string" && value.length <= 1000 && URL.parse(value);
  return url && ozonOrigins.has(url.origin) && !url.username && !url.password && productPath.test(url.pathname) ? url : null;
}

function readCopiedCards(html) {
  if (!html || html.length > maxClipboardSize) return [];
  // A template keeps markup inert. Only the four item fields are sent to Rollapp.
  const template = document.createElement("template");
  template.innerHTML = html;
  const cards = new Map();
  for (const anchor of template.content.querySelectorAll("a[href]")) {
    const url = ozonProduct(anchor.getAttribute("href"));
    if (!url) continue;
    const id = productPath.exec(url.pathname)[1];
    const image = anchor.querySelector("img");
    const title = anchor.textContent.trim().replace(/\0/g, "").slice(0, 160);
    const previous = cards.get(id);
    cards.set(id, {
      url: previous?.url || url.href,
      title: previous?.title || title,
      alt: previous?.alt || (image?.alt || "").replace(/\0/g, "").trim().slice(0, 160),
      imageUrl: previous?.imageUrl || image?.getAttribute("src") || "",
    });
    if (cards.size > maxItems) throw new Error("В выделении больше 1000 товаров. Скопируйте карточки по частям.");
  }
  return [...cards.values()].map(({ alt, title, ...card }) => ({ ...card, title: title || alt }));
}

export function parseOzonWishlistClipboard({ text, html }) {
  let items;
  if (typeof text === "string" && text.startsWith(clipboardPrefix) && text.length <= maxClipboardSize) {
    try {
      items = JSON.parse(text.slice(clipboardPrefix.length));
    } catch {
      throw new Error("Скопируйте список Ozon ещё раз.");
    }
  } else {
    items = readCopiedCards(html);
  }
  if (!Array.isArray(items) || !items.length || items.length > maxItems) {
    throw new Error("В буфере нет товаров Ozon. Скопируйте список закладкой или выделите и скопируйте карточки.");
  }
  return items.map((item) => {
    const { url, title, imageUrl } = item || {};
    const product = ozonProduct(url);
    if (!product
      || typeof title !== "string" || !title.trim() || title.length > 160 || title.includes("\0")) {
      throw new Error("Скопированный список содержит неполную карточку Ozon.");
    }
    const image = typeof imageUrl === "string" && imageUrl.length <= 1000 && URL.parse(imageUrl);
    const cleanImage = image?.protocol === "https:" && image.hostname.endsWith(".ozone.ru") && !image.username && !image.password && !image.port;
    return { url: product.origin + product.pathname, title: title.trim(), imageUrl: cleanImage ? image.origin + image.pathname : "" };
  });
}
