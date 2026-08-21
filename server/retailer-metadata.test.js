import assert from "node:assert/strict";
import test from "node:test";
import { MetadataFetchError } from "./metadata-fetch.js";
import { resolveRetailerMetadata } from "./retailer-metadata.js";

test("prefers Lavka JSON-LD product data over its smaller social card", async () => {
  const sourceUrl = "https://lavka.yandex.ru/good/petrushka-50-gram";
  const html = `
    <meta property="og:title" content="Петрушка, 50 г — купить с доставкой из Яндекс Лавки">
    <meta property="og:image" content="https://yastatic.net/avatars/get-grocery-goods/2998517/petrushka/300x300?webp=true">
    <script>var handledServerErrors = ["Forbidden"];</script>
    <script type="application/ld+json">
      {
        "@type": "Product",
        "name": "Петрушка",
        "weight": { "@type": "QuantitativeValue", "value": "50 г" },
        "description": "Свежая зелень",
        "image": "https://yastatic.net/avatars/get-grocery-goods/2998517/petrushka/500x500?webp=true",
        "offers": { "@type": "Offer", "price": 48, "priceCurrency": "RUB" }
      }
    </script>`;

  let fetchOptions;
  const result = await resolveRetailerMetadata(sourceUrl, {
    fetchHtml: async (_value, options) => {
      fetchOptions = options;
      return { html, url: new URL(sourceUrl) };
    },
  });

  assert.deepEqual(fetchOptions, { timeoutMs: 7_000, maxBytes: 800_000 });
  assert.deepEqual(result, {
    title: "Петрушка, 50 г",
    description: "Свежая зелень",
    imageUrl: "https://yastatic.net/avatars/get-grocery-goods/2998517/petrushka/500x500?webp=true",
    price: 48,
    currency: "RUB",
    kind: "retailer",
    previewFallback: false,
  });
});

test("parses Lenta's live Product JSON-LD including its remote image and offer", async () => {
  const sourceUrl = "https://lenta.com/product/desert-kokosovyjj-170g-709085/";
  const html = `
    <script type="application/ld+json">
      {
        "@context": "http://schema.org",
        "@type": "Product",
        "name": "Десерт кокосовый G-BALANCE с йогуртовой закваской, 170г",
        "image": "https://cdn.api.lenta.com/resample/webp/900x900/photo/709085/catalog-image/ffcd917d-2e02-425a-8411-b69275ab53e3.png",
        "url": "https://lenta.com/product/desert-kokosovyjj-s-jjogurtovojj-zakvaskojj-rossiya-170g-709085/",
        "description": "Десерт кокосовый G-BALANCE с йогуртовой закваской – это прекрасная воздушная, нежная структура.",
        "sku": "709085",
        "brand": { "@type": "Brand", "name": "G-BALANCE" },
        "offers": {
          "@type": "Offer",
          "priceCurrency": "RUB",
          "price": "124.99",
          "availability": "http://schema.org/OutOfStock"
        }
      }
    </script>`;

  let fetchedUrl;
  const result = await resolveRetailerMetadata(sourceUrl, {
    fetchHtml: async (value) => {
      fetchedUrl = value.href;
      return { html, url: new URL(sourceUrl) };
    },
  });

  assert.equal(fetchedUrl, sourceUrl.replace(/\/$/, ""));
  assert.deepEqual(result, {
    title: "Десерт кокосовый G-BALANCE с йогуртовой закваской, 170г",
    description: "Десерт кокосовый G-BALANCE с йогуртовой закваской – это прекрасная воздушная, нежная структура.",
    imageUrl: "https://cdn.api.lenta.com/resample/webp/900x900/photo/709085/catalog-image/ffcd917d-2e02-425a-8411-b69275ab53e3.png",
    price: 124.99,
    currency: "RUB",
    kind: "retailer",
    previewFallback: false,
  });
});

test("renders Lenta after Qrator blocks the direct request and reads Product JSON-LD from the body", async () => {
  const sourceUrl = "https://lenta.com/product/moloko-ultrapasterizovannoe-32-bez-zmzh-rossiya-1000ml-888521/";
  const canonicalUrl = "https://lenta.com/product/moloko-ultrapasterizovannoe-lenta-32-bez-zmzh-1000g-888521/";
  const imageUrl = "https://cdn.api.lenta.com/resample/webp/900x900/photo/888521/catalog-image/d82e2f3b-b13a-41b3-a190-5661f3308276.png";
  const html = `
    <head><title>ЛЕНТА</title></head>
    <body>
      <lu-product-ld-json>
        <script type="application/ld+json">
          {
            "@context": "http://schema.org",
            "@type": "Product",
            "name": "Молоко ультрапастеризованное ЛЕНТА 3,2%, без змж, 1000г",
            "description": "Молоко с приятным, слегка сладковатым вкусом.",
            "image": "${imageUrl}",
            "sku": "888521",
            "offers": { "@type": "Offer", "price": "89.99", "priceCurrency": "RUB" }
          }
        </script>
      </lu-product-ld-json>
    </body>`;
  let renderCall;

  const result = await resolveRetailerMetadata(sourceUrl, {
    fetchHtml: async () => ({
      html: '<script src="/__qrator/qauth.js"></script>',
      url: new URL(sourceUrl),
    }),
    renderLenta: async (value, options) => {
      renderCall = { value: value.href, options };
      return { html, url: new URL(canonicalUrl) };
    },
  });

  assert.deepEqual(renderCall, { value: sourceUrl.replace(/\/$/, ""), options: { timeoutMs: 20_000 } });
  assert.deepEqual(result, {
    title: "Молоко ультрапастеризованное ЛЕНТА 3,2%, без змж, 1000г",
    description: "Молоко с приятным, слегка сладковатым вкусом.",
    imageUrl,
    price: 89.99,
    currency: "RUB",
    kind: "retailer",
    previewFallback: false,
  });
});

test("does not start a browser during background retailer backfill", async () => {
  let renderCalls = 0;
  const result = await resolveRetailerMetadata(
    "https://lenta.com/product/milk-888521/",
    {
      allowBrowser: false,
      fetchHtml: async () => { throw new MetadataFetchError("blocked", { code: "upstream_status" }); },
      renderLenta: async () => {
        renderCalls += 1;
        throw new Error("must not run");
      },
    },
  );

  assert.equal(renderCalls, 0);
  assert.equal(result.previewFallback, true);
  assert.equal(result.imageUrl, "/retailer-previews/lenta.svg");
});

test("rejects retailer shells, untrusted images and redirects to another product", async () => {
  const lavkaUrl = "https://lavka.yandex.ru/good/petrushka-50-gram";
  const shell = await resolveRetailerMetadata(lavkaUrl, {
    fetchHtml: async () => ({
      html: '<meta property="og:title" content="Петрушка"><meta property="og:image" content="https://yastatic.net/avatars/get-grocery-goods/logo/500x500">',
      url: new URL(lavkaUrl),
    }),
  });
  assert.equal(shell.previewFallback, true);

  const untrusted = await resolveRetailerMetadata(lavkaUrl, {
    fetchHtml: async () => ({
      html: '<script type="application/ld+json">{"@type":"Product","name":"Петрушка","image":"https://tracking.example/pixel.jpg"}</script>',
      url: new URL(lavkaUrl),
    }),
  });
  assert.equal(untrusted.previewFallback, true);

  const wrongStructuredProduct = await resolveRetailerMetadata(lavkaUrl, {
    fetchHtml: async () => ({
      html: `<script type="application/ld+json">{
        "@type":"Product","name":"Укроп","url":"https://lavka.yandex.ru/good/dill-50-gram",
        "image":"https://yastatic.net/avatars/get-grocery-goods/2998517/dill/500x500?webp=true"
      }</script>`,
      url: new URL(lavkaUrl),
    }),
  });
  assert.equal(wrongStructuredProduct.previewFallback, true);

  const lentaUrl = "https://lenta.com/product/milk-888521/";
  let renderCalls = 0;
  const redirected = await resolveRetailerMetadata(lentaUrl, {
    fetchHtml: async () => ({
      html: '<script type="application/ld+json">{"@type":"Product","name":"Other","image":"https://cdn.api.lenta.com/resample/webp/900x900/photo/777777/catalog-image/image.png"}</script>',
      url: new URL("https://lenta.com/product/other-777777/"),
    }),
    renderLenta: async () => {
      renderCalls += 1;
      throw new MetadataFetchError("blocked");
    },
  });
  assert.equal(renderCalls, 1);
  assert.equal(redirected.previewFallback, true);
});

test("accepts a valid Product even when an unrelated script mentions showcaptcha", async () => {
  const sourceUrl = "https://lavka.yandex.ru/good/onion-1-kilogram";
  const imageUrl = "https://yastatic.net/avatars/get-grocery-goods/2998517/onion/500x500?webp=true";
  const result = await resolveRetailerMetadata(sourceUrl, {
    fetchHtml: async () => ({
      html: `
        <script>window.routes = ["showcaptcha"];</script>
        <script type="application/ld+json">{
          "@type":"Product","name":"Лук","weight":{"value":"1 кг"},
          "image":"${imageUrl}","offers":{"price":80,"priceCurrency":"RUB"}
        }</script>`,
      url: new URL(sourceUrl),
    }),
  });
  assert.equal(result.previewFallback, false);
  assert.equal(result.title, "Лук, 1 кг");
  assert.equal(result.imageUrl, imageUrl);
});

test("upgrades retailer links before fetching and rejects an HTTPS downgrade", async () => {
  const httpUrl = "http://lavka.yandex.ru/good/onion-1-kilogram?utm_source=share";
  const imageUrl = "https://yastatic.net/avatars/get-grocery-goods/2998517/onion/500x500?webp=true";
  const html = `<script type="application/ld+json">{
    "@type":"Product","name":"Лук","image":"${imageUrl}"
  }</script>`;
  let fetchedUrl;
  const result = await resolveRetailerMetadata(httpUrl, {
    fetchHtml: async (value) => {
      fetchedUrl = value.href;
      return { html, url: new URL("https://lavka.yandex.ru/good/onion-1-kilogram") };
    },
  });
  assert.equal(fetchedUrl, "https://lavka.yandex.ru/good/onion-1-kilogram");
  assert.equal(result.previewFallback, false);

  const downgraded = await resolveRetailerMetadata(httpUrl, {
    fetchHtml: async () => ({
      html,
      url: new URL("http://lavka.yandex.ru/good/onion-1-kilogram"),
    }),
  });
  assert.equal(downgraded.previewFallback, true);
});

test("combines Samokat's live Open Graph card with its Product offer in JSON-LD", async () => {
  const sourceUrl = "https://samokat.ru/product/ketchup-heinz-320-g";
  const description = "Томатный кетчуп с добавлением пряностей и ароматных трав. Без крахмала, искусственных ароматизаторов и красителей.";
  const imageUrl = "https://damcdn.samokat.ru/dam-storage-ext-env-prod/2025/12/315c7f86-fa8c-4a6c-ab18-1a44a8a6e20c";
  const html = `
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Самокат">
    <meta property="og:title" content="Кетчуп Heinz&#10;320&nbsp;г">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": "https://samokat.ru/#organization",
            "name": "Самокат",
            "url": "https://samokat.ru",
            "logo": "https://samokat.ru/images/logo.svg"
          },
          {
            "@type": "Product",
            "@id": "https://samokat.ru/product/ketchup-heinz-320-g#product",
            "name": "Кетчуп Heinz, 320 г",
            "sku": "1b42f33f-eef4-11eb-a0ee-ec0d9a21b021",
            "image": ["${imageUrl}"],
            "description": "${description}",
            "brand": { "@type": "Brand", "name": "Heinz" },
            "offers": {
              "@type": "Offer",
              "url": "https://samokat.ru/product/ketchup-heinz-320-g",
              "price": "145.00",
              "priceCurrency": "RUB",
              "availability": "https://schema.org/InStock",
              "itemCondition": "https://schema.org/NewCondition",
              "seller": { "@type": "Organization", "name": "Самокат" }
            }
          }
        ]
      }
    </script>`;

  const result = await resolveRetailerMetadata(sourceUrl, {
    fetchHtml: async () => ({ html, url: new URL(sourceUrl) }),
  });

  assert.deepEqual(result, {
    title: "Кетчуп Heinz 320 г",
    description,
    imageUrl,
    price: 145,
    currency: "RUB",
    kind: "retailer",
    previewFallback: false,
  });
});

test("renders Samokat in a browser after Servicepipe blocks the direct request", async () => {
  const sourceUrl = "https://samokat.ru/product/repchatyy-luk-otbornyy-500-g";
  const description = "Отборный репчатый лук. Имеет сочную мякоть и пикантный вкус с горчинкой. Подходит для салатов, супов, вторых блюд.";
  const imageUrl = "https://damcdn.samokat.ru/dam-storage-ext-env-prod/2026/01/444075cb-350e-412f-8ece-ce84d18716f3";
  const html = `
    <head>
      <meta property="og:title" content="Репчатый лук, отборный&#10;500&nbsp;г">
      <meta property="og:description" content="${description}">
      <meta property="og:image" content="${imageUrl}">
      <script src="https://servicepipe.tech/static/check.js"></script>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Репчатый лук, отборный, 500 г",
          "image": ["${imageUrl}"],
          "description": "${description}",
          "offers": { "@type": "Offer", "price": "79.00", "priceCurrency": "RUB" }
        }
      </script>
    </head>`;
  let renderCall;

  const result = await resolveRetailerMetadata(sourceUrl, {
    fetchHtml: async () => { throw new MetadataFetchError("blocked", { code: "upstream_status" }); },
    renderSamokat: async (value, options) => {
      renderCall = { value: value.href, options };
      return { html, url: new URL(sourceUrl) };
    },
    renderTimeoutMs: 9_000,
  });

  assert.deepEqual(renderCall, { value: sourceUrl, options: { timeoutMs: 9_000 } });
  assert.deepEqual(result, {
    title: "Репчатый лук, отборный 500 г",
    description,
    imageUrl,
    price: 79,
    currency: "RUB",
    kind: "retailer",
    previewFallback: false,
  });
});

test("rejects non-product Samokat images returned by a renderer", async () => {
  const sourceUrl = "https://samokat.ru/product/onion";
  const result = await resolveRetailerMetadata(sourceUrl, {
    fetchHtml: async () => { throw new MetadataFetchError("blocked"); },
    renderSamokat: async () => ({
      html: `
        <meta property="og:title" content="Самокат — доставка">
        <meta property="og:image" content="https://samokat.ru/images/logo.svg">
        <script type="application/ld+json">{"@type":"Product","name":"Onion"}</script>`,
      url: new URL(sourceUrl),
    }),
  });

  assert.equal(result.imageUrl, "/retailer-previews/samokat.svg");
  assert.equal(result.previewFallback, true);
  assert.equal(result.title, "");
});

test("does not accept a Samokat block page with a trusted-looking DAM image", async () => {
  const sourceUrl = "https://samokat.ru/product/onion";
  let renderCalls = 0;
  const result = await resolveRetailerMetadata(sourceUrl, {
    fetchHtml: async () => ({
      html: `
        <title>Forbidden</title>
        <meta property="og:title" content="Forbidden">
        <meta property="og:image" content="https://damcdn.samokat.ru/dam-storage-ext-env-prod/fake-image">`,
      url: new URL(sourceUrl),
    }),
    renderSamokat: async () => {
      renderCalls += 1;
      throw new MetadataFetchError("render blocked");
    },
  });

  assert.equal(renderCalls, 1);
  assert.equal(result.imageUrl, "/retailer-previews/samokat.svg");
  assert.equal(result.previewFallback, true);
  assert.equal(result.title, "");
});

test("parses a Bushe SSR product card and unwraps the Next image URL", async () => {
  const sourceUrl = "https://bushe.ru/products/xleb-laplandskii-320-g-a4fb88?pointId=5";
  const html = `
    <div class="ProductContent_top__zF0Zl">
      <h3 class="text ProductContent_title__nlvs5">Лапландский </h3>
      <span class="ProductContent_weight__Xq0wy">320<!-- --> г</span>
    </div>
    <p class="ProductContent_description__jVcgh">Ржано-пшеничный хлеб со шротом</p>
    <div id="auth-captcha-container" style="display:none"></div>
    <div class="DetailProduct_gallery__dYf4g">
      <span><img alt="slide" src="/_next/image?url=https%3A%2F%2Fbushe.ru%2Ffiles%2Fbread.jpg&amp;w=3840&amp;q=75"></span>
    </div>
    <script>self.__next_f.push([1,"\\\"product\\\":{\\\"id\\\":1075,\\\"name\\\":\\\"Хлеб Лапландский 320 г\\\",\\\"slug\\\":\\\"bread\\\",\\\"prices\\\":{\\\"deliveryPrice\\\":125,\\\"price\\\":125}"])</script>`;

  let fetchedBusheUrl;
  const result = await resolveRetailerMetadata(sourceUrl, {
    fetchHtml: async (value) => {
      fetchedBusheUrl = value.href;
      return { html, url: new URL(sourceUrl) };
    },
  });

  assert.equal(fetchedBusheUrl, sourceUrl);
  assert.equal(result.title, "Хлеб Лапландский 320 г");
  assert.equal(result.description, "Ржано-пшеничный хлеб со шротом");
  assert.equal(result.imageUrl, "https://bushe.ru/files/bread.jpg");
  assert.equal(result.price, 125);
  assert.equal(result.currency, "RUB");
  assert.equal(result.previewFallback, false);
});

test("returns a branded preview when a retailer blocks server metadata", async () => {
  const cases = [
    ["https://lenta.com/product/coffee/", "/retailer-previews/lenta.svg"],
    ["https://samokat.ru/product/coffee/", "/retailer-previews/samokat.svg"],
  ];

  for (const [url, imageUrl] of cases) {
    const result = await resolveRetailerMetadata(url, {
      fetchHtml: async () => { throw new MetadataFetchError("blocked", { code: "upstream_status" }); },
      renderSamokat: async () => { throw new MetadataFetchError("render blocked"); },
    });
    assert.equal(result.imageUrl, imageUrl, url);
    assert.equal(result.previewFallback, true, url);
    assert.equal(result.title, "", url);
  }
});

test("does not save challenge pages or a generic Bushe social card as product metadata", async () => {
  const samokat = await resolveRetailerMetadata("https://samokat.ru/product/coffee/", {
    fetchHtml: async () => ({
      html: "<title>Forbidden</title><p>If you are not a bot, enable JavaScript</p>",
      url: new URL("https://samokat.ru/product/coffee/"),
    }),
    renderSamokat: async () => { throw new MetadataFetchError("render blocked"); },
  });
  assert.equal(samokat.imageUrl, "/retailer-previews/samokat.svg");
  assert.equal(samokat.previewFallback, true);

  const bushe = await resolveRetailerMetadata("https://bushe.ru/products/old-bread", {
    fetchHtml: async () => ({
      html: '<meta property="og:title" content="БУШЕ — Сеть кафе и кондитерских"><meta property="og:image" content="/graph.png">',
      url: new URL("https://bushe.ru/products/old-bread"),
    }),
  });
  assert.equal(bushe.imageUrl, "/retailer-previews/bushe.svg");
  assert.equal(bushe.previewFallback, true);
  assert.equal(bushe.title, "");
});

test("leaves unsupported and lookalike URLs to the generic metadata pipeline", async () => {
  let called = false;
  const result = await resolveRetailerMetadata("https://samokat.ru.evil.example/product/coffee/", {
    fetchHtml: async () => { called = true; },
  });
  assert.equal(result, null);
  assert.equal(called, false);
});
