import assert from "node:assert/strict";
import test from "node:test";
import { parseBankHistory, parseBankHistoryRows, parsePurchaseHistory } from "./purchase-history.js";

test("T-Bank CSV keeps debit context separate from product names and prices", () => {
  const csv = [
    "Дата операции;Дата платежа;Номер карты;Статус;Сумма операции;Валюта операции;Сумма платежа;Валюта платежа;Кэшбэк;Категория;MCC;Описание",
    '09.11.2026 10:20:00;09.11.2026;*1234;OK;-1 234,50;RUB;-1234,50;RUB;12;Супермаркеты;5411;"Магазин ""Север""; Москва"',
    "08.11.2026;08.11.2026;*1234;OK;-60;EUR;-5300;RUB;0;Одежда;5651;Бутик",
    "07.11.2026;07.11.2026;*1234;OK;500;RUB;500;RUB;0;Пополнения;6012;Пополнение",
    "06.11.2026;06.11.2026;*1234;OK;-300;RUB;-300;RUB;0;Переводы;4829;Перевод",
    "05.11.2026;05.11.2026;*1234;FAILED;-150;RUB;-150;RUB;0;Супермаркеты;5411;Отказ",
    "04.11.2026;04.11.2026;*1234;OK;49;RUB;49;RUB;0;Супермаркеты;5411;Возврат",
    "03.11.2026;03.11.2026;*1234;OK;-150;RUB;-150;RUB;0;Наличные;6011;Т-Банк",
  ].join("\r\n");
  assert.deepEqual(parseBankHistory(csv).items, [
    { title: "", price: null, currency: "RUB", operation: { description: 'Магазин "Север"; Москва', date: "09.11.2026 10:20:00", amount: 1234.5, currency: "RUB" } },
    { title: "", price: null, currency: "EUR", operation: { description: "Бутик", date: "08.11.2026", amount: 60, currency: "EUR" } },
  ]);
  assert.throws(() => parseBankHistory("Товар;Цена\nЧай;50"), /колонки даты/);
});

test("bank spreadsheets accept typed Excel dates, explicit debit and an optional product column", () => {
  const parsed = parseBankHistoryRows([
    ["Выписка"],
    ["Дата операции", "Списание", "Описание", "Товар", "Цена за единицу", "Валюта"],
    [new Date("2026-11-09"), 380, "Магазин", "Чай", 190, "RUB"],
    [new Date("2026-11-09"), null, "Денежный перевод", "Чай", 190, "RUB"],
  ]);
  assert.deepEqual(parsed.items, [{
    title: "Чай", price: 190, currency: "RUB",
    operation: { description: "Магазин", date: "2026-11-09", amount: 380, currency: "RUB" },
  }]);
});

test("text PDF rows require a signed debit and preserve only review context", () => {
  const pdf = [
    "Выписка по операциям",
    "09.11.2026 11:20 09.11.2026 11:21 -1 295.50 RUB -1 295.50 RUB *4455 Книжный магазин",
    "09.11.2026 Перевод по СБП -19.00 RUB",
    "09.11.2026 Пополнение +5000 RUB",
    "09.11.2026 Ресторан 1200 RUB",
  ].join("\n");
  assert.deepEqual(parseBankHistory(pdf, "pdf").items, [{
    title: "", price: null, currency: "RUB",
    operation: { description: "Книжный магазин", date: "09.11.2026", amount: 1295.5, currency: "RUB" },
  }]);
});

test("receipt extraction keeps unit prices, drops totals and canceled documents, and merges repeated products", () => {
  const receipt = [
    "Кассовый чек",
    "1. Чай зелёный",
    "2 шт x 140,50 ₽ = 281 ₽",
    "Шоколад — 199 ₽",
    "Скидка 30 ₽",
    "ИТОГО: 450 ₽",
    "Заказ № 111 отменён",
    "Отменённый товар — 150 ₽",
    "Заказ № 222",
    "ЧАЙ  ЗЕЛЁНЫЙ — 154 ₽",
    "Книга — 1 400 ₽",
  ].join("\n");
  assert.deepEqual(parsePurchaseHistory(receipt), {
    items: [
      { title: "Чай зелёный", price: 140.5, currency: "RUB" },
      { title: "Шоколад", price: 199, currency: "RUB" },
      { title: "Книга", price: 1400, currency: "RUB" },
    ],
    duplicates: 1,
  });
});

test("fiscal JSON and order exports preserve item boundaries and don't import refunds", () => {
  const exported = [
    { document: { receipt: { operationType: 1, totalSum: 59900, items: [{ name: "Кофе", price: 29950, quantity: 2, sum: 59900 }] } } },
    { document: { receipt: { operationType: 2, totalSum: 45900, items: [{ name: "Книга", price: 45900 }] } } },
    { orders: [
      { status: "cancelled", items: [{ productName: "Ноутбук" }] },
      { status: "Отменён", items: [{ productName: "Зонт" }] },
    ] },
  ];
  assert.deepEqual(parsePurchaseHistory(JSON.stringify(exported)).items, [{ title: "Кофе", price: 299.5, currency: "RUB" }]);
  assert.deepEqual(parsePurchaseHistory('Товар;Количество;Сумма;Валюта\n"Чай; зелёный";3;450;RUB\nБлокнот;1;;\n', "csv").items, [
    { title: "Чай; зелёный", price: 150, currency: "RUB" },
    { title: "Блокнот", price: null, currency: "RUB" },
  ]);
});
