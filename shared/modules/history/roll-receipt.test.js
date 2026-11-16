import assert from "node:assert/strict";
import { test } from "node:test";
import { rollReceiptFields, rollReceiptText } from "./roll-receipt.js";

test("receipt text preserves the full amount and one receipt line per field", () => {
  const receipt = {
    id: "transfer-record", kind: "transfer", purpose: "personal_offer_refund", status: "recorded",
    amount: "9007199254741003", direction: "incoming", createdAt: "2026-11-15T22:30:00Z",
    participant: { name: "Имя\nНомер: другой", username: "sender" },
    subject: "Счёт\u202eна консультацию", orderId: "original-order",
  };
  assert.equal(rollReceiptFields(receipt).find(([label]) => label === "Операция")[1], "Возврат по персональному счёту");
  const exportText = rollReceiptText(receipt);
  assert.match(exportText, /9[^\d]007[^\d]199[^\d]254[^\d]741[^\d]003 ролла/u);
  assert.match(exportText, /Дата и время · Москва: 16 нояб\. 2026 г\., 01:30:00/u);
  assert.match(exportText, /Номер заказа: original-order/u);
  assert.equal(exportText.split("\n").filter((line) => line.startsWith("Номер:")).length, 1);
  assert(!exportText.includes("\u202e"));
});
