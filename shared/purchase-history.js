// Keep parsing in the browser; only the reviewed card fields need to reach Rollapp.
export const PURCHASE_HISTORY_MAX_CHARS = 250_000;
export const PURCHASE_HISTORY_MAX_ITEMS = 100;
export const PURCHASE_CURRENCIES = ["RUB", "USD", "EUR", "KZT", "BYN"];
export const PURCHASE_MAX_PRICE = 999_999_999;

export const purchaseTitleKey = (title) => title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
const clean = (value) => typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
const fieldKey = (value) => clean(value).toLowerCase().replace(/[\s_-]+/g, "");
const textMoney = String.raw`(?:₽|руб\.?|RUB|USD|EUR|KZT|BYN|\$|€|₸|Br)`;
const textNumber = String.raw`(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,]\d{1,2})?`;
const endingMoney = new RegExp(String.raw`^(.*?)\s+(${textNumber})\s*(${textMoney})$`, "iu");
const qtyTimesPrice = new RegExp(String.raw`^(\d+(?:[.,]\d+)?)\s*(?:шт\.?|кг|л|уп\.?|pcs)?\s*[×хx*]\s*(${textNumber})\s*(${textMoney})?(?:\s*=\s*${textNumber}\s*${textMoney}?)?$`, "iu");
const standaloneMoney = new RegExp(String.raw`^(${textNumber})\s*(${textMoney})$`, "iu");
const noise = /^(?:(?:итого|всего|итог|total|subtotal|доставка|скидка|оплата|наличными|безналичными|сдача|к\s+оплате|в\s+т[.\s]*ч[.\s]+ндс|ндс|округление|сервисный сбор|экономия|бонусы|предоплата)(?=$|[\s:–—-])|(?:кассовый чек|товарный чек|чек|заказ|order|квитанция|магазин|покупатель|клиент|адрес|кассир|телефон|email|инн|ккт|фн|фд|фп|рн ккт|дата|позиции|товары|наименование|количество|цена|сумма|способ оплаты|приход|расход)(?=$|\s*[:#№])|(?:кассовый чек|товарный чек|чек\s+(?:№|от)|заказ\s+(?:№|#|от|\d)|order\s*#|спасибо за покупку|ooo |ооо |ип |ул[.\s]|г\.\s))/iu;
const rejected = /^(?:возврат|отмен(?:а|[ёе]н(?:а|о|ы)?)|не\s+выкуплен|отказ|refund|return(?:ed)?|cancel(?:led|ed)?)(?=$|[^\p{L}])/iu;
const returnHeader = /^(?:(?:кассовый чек|чек|тип операции)[:\s]+)?(?:возврат\s+(?:прихода|покупки|товара)|отмена\s+заказа|refund\b)|^(?:заказ|order)(?=$|[^\p{L}]).*(?:отмен[её]н|возвращ[её]н|cancelled|canceled|refunded)/iu;

function number(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(Number(normalized)) ? Number(normalized) : null;
}

function currency(value) {
  const token = clean(value).toUpperCase();
  return ({ "₽": "RUB", "РУБ": "RUB", "РУБ.": "RUB", "$": "USD", "€": "EUR", "₸": "KZT", BR: "BYN" })[token]
    ?? (PURCHASE_CURRENCIES.includes(token) ? token : null);
}

function money(value) {
  if (typeof value !== "string") return { amount: number(value), currency: null };
  const match = value.trim().match(new RegExp(String.raw`^(${textMoney})?\s*(${textNumber})\s*(${textMoney})?$`, "iu"));
  return match ? { amount: number(match[2]), currency: currency(match[1] || match[3]) } : { amount: null, currency: null };
}

function card(title, price, code) {
  const name = clean(title);
  if (name.length < 1 || name.length > 160 || !/\p{L}/u.test(name) || noise.test(name) || rejected.test(name)) return null;
  return {
    title: name,
    price: price === null || !Number.isFinite(price) || price < 0 || price > PURCHASE_MAX_PRICE ? null : Math.round(price * 100) / 100,
    currency: code || "RUB",
  };
}

const fields = {
  title: ["товар", "названиетовара", "наименование", "наименованиетовара", "название", "позиция", "product", "productname", "item", "itemname", "title", "name"],
  price: ["ценазаединицу", "ценашт", "цена", "unitprice", "price"],
  total: ["суммапозиции", "сумма", "стоимость", "linetotal", "sum", "amount", "total"],
  quantity: ["количество", "колво", "quantity", "qty"],
  currency: ["валюта", "currency"],
  status: ["статус", "статусзаказа", "status", "orderstatus", "state"],
};
const getField = (entry, name) => fields[name].map((key) => entry[key]).find((value) => value != null && value !== "");

function fromRecord(record, fiscal = false) {
  const entry = Object.fromEntries(Object.entries(record).map(([key, value]) => [fieldKey(key), value]));
  if (rejected.test(clean(getField(entry, "status")))) return null;
  const unit = money(getField(entry, "price"));
  const total = money(getField(entry, "total"));
  const quantity = number(getField(entry, "quantity"));
  const explicitCurrency = getField(entry, "currency");
  const code = currency(explicitCurrency) || unit.currency || total.currency;
  const price = unit.amount ?? (total.amount !== null && quantity > 0 ? total.amount / quantity : null);
  return card(getField(entry, "title"), explicitCurrency && !code ? null : fiscal && price !== null ? price / 100 : price, code);
}

function jsonCards(document) {
  const out = [];
  function read(node, depth = 0, fiscal = false, line = false) {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) read(item, depth + 1, fiscal, line);
      return;
    }
    if (rejected.test(clean(node.status ?? node.orderStatus ?? node.state))
      || node.cancelled === true || node.canceled === true || node.refunded === true
      || (node.operationType != null && Number(node.operationType) !== 1)) return;

    const lineKeys = ["items", "products", "lineItems", "positions"];
    const envelopeKeys = ["document", "receipt", "receipts", "orders", "order", "data"];
    if (lineKeys.some((key) => Array.isArray(node[key]))) {
      // When both totals are present the receipt amounts are in kopecks.
      const fiscalReceipt = fiscal || (node.operationType != null && node.totalSum != null);
      const key = lineKeys.find((candidate) => Array.isArray(node[candidate]));
      read(node[key], depth + 1, fiscalReceipt, true);
    } else if (envelopeKeys.some((key) => node[key] && typeof node[key] === "object")) {
      for (const key of envelopeKeys) read(node[key], depth + 1, fiscal || (key === "receipt" && node[key]?.operationType != null));
    } else if (line || depth <= 1) {
      const item = fromRecord(node, fiscal);
      if (item) out.push(item);
    }
  }
  read(document);
  return out;
}

// CSV and TSV exports can contain separators, escaped quotes and newlines in a cell.
function tableRows(source, delimiter) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const pushCell = () => { row.push(cell.trim()); cell = ""; };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"' && (quoted || !cell.trim())) {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === delimiter || char === "\n")) {
      pushCell();
      if (char === "\n") { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error("В таблице не закрыты кавычки. Проверьте выгрузку и попробуйте снова.");
  pushCell();
  rows.push(row);
  return rows;
}

function delimitedCards(source) {
  const firstLine = source.split("\n", 1)[0];
  for (const delimiter of ["\t", ";", ","]) {
    if (!firstLine.includes(delimiter)) continue;
    const [head] = tableRows(firstLine, delimiter);
    const keys = head.map(fieldKey);
    if (!keys.some((key) => fields.title.includes(key))) continue;
    const [, ...rows] = tableRows(source, delimiter);
    return rows.flatMap((row) => {
      if (row.length !== head.length) return [];
      const item = fromRecord(Object.fromEntries(head.map((key, i) => [key, row[i]])));
      return item ? [item] : [];
    });
  }
  return null;
}

function textCards(source) {
  const items = [];
  const documentBlocks = [];
  let block = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (block.length && /^(?:кассовый чек|товарный чек|чек\s*№|заказ\s*[№#]|order\s*#)/iu.test(line)) {
      documentBlocks.push(block);
      block = [];
    }
    if (line) block.push(line);
  }
  documentBlocks.push(block);
  for (const lines of documentBlocks) {
    if (lines.some((line) => returnHeader.test(line) || /^статус[:\s]+(?:отмен|возврат)/iu.test(line))) continue;
    let pending = "";
    for (const raw of lines) {
      const line = raw.replace(/^(?:[-•*]\s+|\d+[.)]\s+)/u, "");
      const match = line.match(endingMoney);
      const inlineQuantity = match?.[1].match(/^(.*?)\s+\d+(?:[.,]\d+)?\s*(?:шт\.?|кг|л|уп\.?|pcs)?\s*[×хx*]$/iu);
      const quantity = line.match(qtyTimesPrice);
      const standalone = line.match(standaloneMoney);
      let item = null;
      if (quantity || standalone) {
        if (pending) item = quantity
          ? card(pending, number(quantity[2]), currency(quantity[3]))
          : card(pending, number(standalone[1]), currency(standalone[2]));
        pending = "";
      } else if (match) {
        item = card(inlineQuantity?.[1] ?? match[1].replace(/\s+[-–—:]$/, ""), number(match[2]), currency(match[3]));
        pending = "";
      } else {
        pending = card(line, null)?.title || "";
      }
      if (item) items.push(item);
    }
  }
  return items;
}

export function parsePurchaseHistory(input, format = "auto") {
  if (input.length > PURCHASE_HISTORY_MAX_CHARS) throw new Error("История слишком длинная. Разделите её на несколько частей.");
  const source = input.replace(/\r\n?/g, "\n").trim();
  let items;
  if (format === "json" || /^(?:\{|\[)/.test(source)) {
    let document;
    try { document = JSON.parse(source); }
    catch { throw new Error("Не удалось прочитать JSON. Проверьте выгрузку и попробуйте снова."); }
    items = jsonCards(document);
  } else {
    const table = delimitedCards(source);
    if ((format === "csv" || format === "tsv") && !table) throw new Error("В таблице нужна колонка «Товар» или «Наименование».");
    items = table ?? textCards(source);
  }

  const unique = new Map();
  let duplicates = 0;
  for (const item of items) {
    const key = purchaseTitleKey(item.title);
    const previous = unique.get(key);
    if (previous) duplicates++;
    if (!previous || (previous.price === null && item.price !== null)) unique.set(key, item);
  }
  if (unique.size > PURCHASE_HISTORY_MAX_ITEMS) throw new Error(`Найдено больше ${PURCHASE_HISTORY_MAX_ITEMS} товаров. Разделите историю на несколько частей.`);
  return { items: [...unique.values()], duplicates };
}

const bankFields = {
  date: ["датаоперации", "дататранзакции", "датапокупки", "дата", "transactiondate", "date"],
  amount: ["суммаоперации", "сумматранзакции", "суммаплатежа", "сумма", "transactionamount", "amount"],
  debit: ["суммасписания", "списание", "расход", "дебет", "debit"],
  currency: ["валютаоперации", "валютаплатежа", "валюта", "transactioncurrency", "currency"],
  description: ["описание", "описаниеоперации", "наименованиеоперации", "назначениеплатежа", "магазин", "merchant", "description"],
  type: ["типоперации", "операция", "operationtype", "type", "direction"],
  category: ["категория", "category"],
  status: fields.status,
  mcc: ["mcc", "мсс"],
  product: ["товар", "названиетовара", "наименованиетовара", "product", "productname", "itemname"],
};
const bankNonPurchase = /(?:перевод|пополнени|возврат|возмещени|внесени|поступлени|снятие|выдача наличных|комисси|к[еэ]шб[еэ]к|проценты по|погашени|сбп\s*перевод|cash\s*(?:back|withdrawal)|transfer|refund|deposit|top.up)/iu;
const failedStatus = /(?:отказ|отклон|отмен|ошибк|возврат|ожидан|обработ|fail|declin|pending|reject|cancel|refund)/iu;
const transferMcc = new Set(["4829", "6010", "6011", "6012", "6050", "6051", "6536", "6537", "6538", "6540"]);
const bankMaxRows = 1000;

function signedMoney(value) {
  const raw = typeof value === "number" ? String(value) : clean(value);
  const text = raw.replace(/[−–]/gu, "-");
  const negative = /^-/.test(text) || /^\(.*\)$/.test(text);
  const positive = /^\+/.test(text);
  const parsed = money(text.replace(/^(?:[+-]\s*|\()/u, "").replace(/\)$/u, ""));
  return { ...parsed, negative, positive };
}

function bankRecord(row) {
  const read = (field) => bankFields[field].map((key) => row[key]).find((value) => value != null && value !== "");
  const description = clean(read("description"));
  const type = clean(read("type"));
  const rawDate = read("date");
  const date = rawDate instanceof Date && Number.isFinite(rawDate.getTime())
    ? rawDate.toISOString().slice(0, 10) : clean(rawDate).slice(0, 24);
  const mcc = String(read("mcc") ?? "").trim();
  const category = clean(read("category"));
  if (!date || failedStatus.test(clean(read("status"))) || transferMcc.has(mcc)
    || [type, category, description].some((value) => bankNonPurchase.test(value))) return null;
  const debit = read("debit");
  const amount = signedMoney(debit ?? read("amount"));
  const explicitDebit = debit != null || /^(?:покупка|оплата|списание|purchase|payment|debit)(?=$|[^\p{L}])/iu.test(type);
  if (!amount.amount || amount.positive || (!amount.negative && !explicitDebit)) return null;
  const code = currency(read("currency")) || amount.currency || (read("currency") ? null : "RUB");
  const item = card(read("product"), null, code);
  if (!description && !item) return null;
  const details = fromRecord({ title: item?.title, unitPrice: row.ценазаединицу ?? row.unitprice ?? row.цена, currency: read("currency") });
  return {
    title: item?.title || "",
    price: details?.price ?? null,
    currency: details?.currency ?? code ?? "RUB",
    operation: { description: description.slice(0, 240), date, amount: amount.amount, currency: code },
  };
}

// Excel and CSV exports share the same column recognition. Only an explicit
// product column is treated as a product name; «Описание» is usually a merchant.
export function parseBankHistoryRows(rows) {
  const headerIndex = rows.slice(0, 20).findIndex((row) => {
    const keys = new Set(row.map(fieldKey));
    const has = (...types) => types.some((type) => bankFields[type].some((key) => keys.has(key)));
    return has("date") && has("description", "product") && has("amount", "debit");
  });
  if (headerIndex < 0) return null;
  const header = Array.from(rows[headerIndex], fieldKey);
  const items = [];
  for (const values of rows.slice(headerIndex + 1)) {
    const item = bankRecord(Object.fromEntries(header.map((key, i) => [key, values[i]])));
    if (item) items.push(item);
    if (items.length > bankMaxRows) throw new Error("В выгрузке больше 1000 покупок. Скачайте операции за более короткий период.");
  }
  return { items, duplicates: 0 };
}

export function parseBankHistory(input, format = "auto") {
  if (input.length > PURCHASE_HISTORY_MAX_CHARS) throw new Error("В выгрузке слишком много текста. Скачайте операции за более короткий период.");
  const source = input.replace(/\r\n?/g, "\n").trim();
  if (format !== "pdf") {
    let tableError;
    for (const delimiter of ["\t", ";", ","]) {
      if (!source.includes(delimiter)) continue;
      let rows;
      try { rows = tableRows(source, delimiter); } catch (error) { tableError = error; continue; }
      const result = parseBankHistoryRows(rows);
      if (result) return result;
    }
    if (tableError) throw tableError;
    throw new Error("Не удалось найти колонки даты, суммы и описания. Выберите экспорт из раздела «Операции» Т-Банка.");
  }
  // Text PDFs with dated operation rows and an explicitly signed debit.
  // Other layouts should use the spreadsheet export instead of guessing.
  const dateAtStart = /^(\d{2}\.\d{2}\.\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?(?:\s+\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)?\s+/u;
  const debitPattern = new RegExp(String.raw`(?:^|\s)([-−–]\s*${textNumber})\s*(${textMoney})(?=$|\s)`, "iu");
  const items = [];
  for (const line of source.split("\n")) {
    const date = line.trim().match(dateAtStart);
    if (!date) continue;
    const row = line.trim().slice(date[0].length);
    const debit = row.match(debitPattern);
    if (!debit) continue;
    const before = row.slice(0, debit.index).trim();
    const after = row.slice(debit.index + debit[0].length).trim()
      .replace(new RegExp(String.raw`^(?:[-−–]\s*${textNumber}\s*(?:${textMoney})\s*)+`, "iu"), "")
      .replace(/^(?:[*•]{1,}\s*\d{4}|\d{4})(?=\s|$)/u, "").trim();
    const description = /\p{L}/u.test(before) ? before : after;
    if (!/\p{L}/u.test(description)) continue;
    const item = bankRecord({
      дата: date[1], сумма: debit[1], валюта: debit[2], описание: description,
    });
    if (item) items.push(item);
    if (items.length > bankMaxRows) throw new Error("В выписке больше 1000 покупок. Скачайте операции за более короткий период.");
  }
  return { items, duplicates: 0 };
}
