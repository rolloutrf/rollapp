// Explicit sandbox provider. No payment credentials, network or wallet writes.
const prefixFor = (ownerId) => `rollapp:virtual-card-sandbox:${ownerId}:`;
const keyFor = (ownerId, fundraiserId) => `${prefixFor(ownerId)}${fundraiserId}`;
export function readVirtualCard(storage, ownerId, fundraiserId) {
  const raw = storage.getItem(keyFor(ownerId, fundraiserId));
  if (!raw) return null;
  const card = JSON.parse(raw);
  if (card?.version !== 1 || card.ownerId !== ownerId || card.fundraiserId !== fundraiserId
    || (card.groupTitle !== undefined && typeof card.groupTitle !== "string")
    || !Number.isSafeInteger(card.initialBalance) || card.initialBalance < 0
    || !Number.isSafeInteger(card.balance) || card.balance < 0 || card.balance > card.initialBalance
    || !Array.isArray(card.purchases) || typeof card.id !== "string") {
    throw new Error("Не удалось прочитать тестовую карту. Сохранённые данные повреждены.");
  }
  const ids = new Set();
  let spent = 0;
  for (const purchase of card.purchases) {
    if (!purchase || typeof purchase.id !== "string" || !purchase.id || ids.has(purchase.id)
      || typeof purchase.merchant !== "string" || !purchase.merchant.trim() || purchase.merchant.length > 100
      || !Number.isSafeInteger(purchase.amount) || purchase.amount < 1) {
      throw new Error("История тестовой карты повреждена.");
    }
    ids.add(purchase.id);
    spent += purchase.amount;
    if (!Number.isSafeInteger(spent)) throw new Error("История тестовой карты повреждена.");
  }
  if (spent !== card.initialBalance - card.balance) throw new Error("Баланс тестовой карты не совпадает с историей.");
  return card;
}

export function listVirtualCards(storage, ownerId) {
  const prefix = prefixFor(ownerId);
  const cards = [];
  let hasUnreadableCards = false;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const card = readVirtualCard(storage, ownerId, key.slice(prefix.length));
      if (card) cards.push(card);
    } catch {
      hasUnreadableCards = true;
    }
  }
  return { cards, hasUnreadableCards };
}

export function syncVirtualCard(storage, { ownerId, fundraiser, groupTitle }) {
  const card = readVirtualCard(storage, ownerId, fundraiser.id);
  if (!card) return null;
  // A newer read of the collection may include more contributions. Preserve
  // simulated spending and never lower the funded amount from a stale read.
  const additional = Math.max(0, fundraiser.raised - card.initialBalance);
  const title = groupTitle ?? card.groupTitle;
  if (!additional && title === card.groupTitle) return card;
  const next = { ...card, groupTitle: title, initialBalance: card.initialBalance + additional, balance: card.balance + additional };
  storage.setItem(keyFor(ownerId, fundraiser.id), JSON.stringify(next));
  return next;
}

export function issueVirtualCard(storage, { ownerId, fundraiser, groupTitle, isOwner }, uuid = () => crypto.randomUUID()) {
  if (!isOwner || !ownerId || ownerId === "guest"
    || typeof fundraiser?.id !== "string" || !fundraiser.id
    || !Number.isSafeInteger(fundraiser.raised) || fundraiser.raised < 0) {
    throw new Error("Выпуск доступен владельцу существующего сбора.");
  }
  const previous = syncVirtualCard(storage, { ownerId, fundraiser, groupTitle });
  if (previous) return previous;
  const card = { version: 1, id: `DEMO-${uuid()}`, ownerId, fundraiserId: fundraiser.id, groupTitle,
    initialBalance: fundraiser.raised, balance: fundraiser.raised, purchases: [] };
  storage.setItem(keyFor(ownerId, fundraiser.id), JSON.stringify(card));
  return card;
}
export function purchaseWithVirtualCard(storage, { ownerId, fundraiserId, merchant, amount, idempotencyKey }) {
  const card = readVirtualCard(storage, ownerId, fundraiserId);
  if (!card) throw new Error("Сначала выпустите тестовую карту.");
  const previous = card.purchases.find(purchase => purchase.id === idempotencyKey);
  if (previous) {
    if (previous.amount !== amount || previous.merchant !== merchant.trim()) throw new Error("Запрос уже использован для другой покупки.");
    return card;
  }
  if (!idempotencyKey || !merchant.trim() || merchant.trim().length > 100 || !Number.isSafeInteger(amount) || amount < 1) throw new Error("Укажите магазин и целую положительную сумму.");
  if (amount > card.balance) throw new Error("Недостаточно тестовых средств на карте.");
  const next = { ...card, balance: card.balance - amount,
    purchases: [{ id: idempotencyKey, merchant: merchant.trim(), amount }, ...card.purchases] };
  storage.setItem(keyFor(ownerId, fundraiserId), JSON.stringify(next));
  return next;
}
