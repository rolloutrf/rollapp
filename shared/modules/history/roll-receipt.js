import { formatRolls } from "../payments/rolls.js";

export const ROLL_RECEIPT_KINDS = {
  transfer: "Перевод",
  welcome: "Приветственное начисление",
  wish_reward: "Награда за желание",
  manual_grant: "Начисление роллов",
  stars_topup: "Пополнение через Telegram Stars",
  ton_topup: "Пополнение за TON",
  purchase: "Покупка",
  refund: "Возврат",
  gift_topup: "Пополнение подарочной карты",
  need_reserve: "Резерв награды за потребность",
  need_refund: "Возврат резерва награды",
  need_reward: "Награда за потребность",
  market_reserve: "Резерв покупки",
  market_refund: "Возврат резерва покупки",
  market_sale: "Расчёт с продавцом",
  order: "Заказ",
};

const statuses = {
  recorded: "Проведено", placed: "Оплачен", reserved: "В резерве", fulfilled: "На проверке",
  disputed: "Открыт спор", released: "Расчёт завершён", refunded: "Роллы возвращены",
};
const purposes = { personal_offer_payment: "Оплата персонального счёта", personal_offer_refund: "Возврат по персональному счёту" };
const sources = { wallet: "Кошелёк роллов", gift: "Подарочная карта" };
const participantLabels = { incoming: "Отправитель", outgoing: "Получатель", buyer: "Продавец", seller: "Покупатель" };
const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Moscow" });

export function rollReceiptFields(receipt) {
  const participant = receipt.participant;
  const relatedOrder = receipt.orderId && receipt.orderId !== receipt.id ? receipt.orderId : null;
  return [
    ["Номер", receipt.id],
    ["Операция", purposes[receipt.purpose] ?? ROLL_RECEIPT_KINDS[receipt.kind]],
    ["Статус", statuses[receipt.status]],
    ["Дата и время · Москва", dateTime.format(new Date(receipt.createdAt))],
    ["Движение", receipt.direction === "incoming" ? "Зачисление" : receipt.direction === "outgoing" ? "Списание" : null],
    [participantLabels[receipt.role ?? receipt.direction], participant ? [participant.name, participant.username ? `@${participant.username}` : null].filter(Boolean).join(" · ") : null],
    ["Назначение", receipt.subject],
    ["Источник оплаты", sources[receipt.source]],
    ["Оплачено", receipt.paidWith],
    ["Номер заказа", relatedOrder],
    ["Дата расчёта · Москва", receipt.closedAt ? dateTime.format(new Date(receipt.closedAt)) : null],
  ].filter(([, value]) => value);
}

function singleLine(value) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/gu, " ").trim();
}

export function rollReceiptText(receipt) {
  const heading = ["Квитанция Rollapp", `Сумма: ${formatRolls(BigInt(receipt.amount))}`];
  const fields = rollReceiptFields(receipt).map(([label, value]) => `${label}: ${singleLine(value)}`);
  return [...heading, ...fields, ""].join("\n");
}
