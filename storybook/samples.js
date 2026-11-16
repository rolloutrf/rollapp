export const cities = [
  { code: "44", name: "Москва", label: "Москва, Москва" },
  { code: "137", name: "Санкт-Петербург", label: "Санкт-Петербург, Санкт-Петербург" },
];
export const points = [
  { code: "STORY1", cityCode: "44", city: "Москва", region: "Москва", address: "Улица Примерная, 7", workTime: "Пн–Сб 10:00–20:00", metro: "Тверская" },
  { code: "STORY2", cityCode: "44", city: "Москва", region: "Москва", address: "Улица Лесная, 19", workTime: "Ежедневно 09:00–21:00" },
  { code: "STORY3", cityCode: "137", city: "Санкт-Петербург", region: "Санкт-Петербург", address: "Улица Примерная, 3", workTime: "Пн–Пт 09:00–21:00" },
];
export const columns = [
  { id: "todo", title: "Запланировано", complete: false },
  { id: "progress", title: "В работе", complete: false },
  { id: "done", title: "Готово", complete: true },
];
export const tasks = [
  { id: "meeting", title: "Встреча с командой", dueOn: "2026-11-16", startTime: "09:00", durationMinutes: 60, columnId: "todo", completed: false, description: "Обсудить следующий выпуск." },
  { id: "overlap", title: "Согласовать макеты", dueOn: "2026-11-16", startTime: "09:30", durationMinutes: 30, columnId: "progress", completed: false },
  { id: "untimed", title: "Собрать материалы", dueOn: "2026-11-16", columnId: "todo", completed: false },
  { id: "recurrence", title: "Еженедельное планирование", dueOn: "2026-11-16", startTime: "14:00", durationMinutes: 30, recurrence: { frequency: "weekly", until: "2026-12-21" }, columnId: "todo", completed: false },
  { id: "finished", title: "Отправить итог встречи", dueOn: "2026-11-16", columnId: "done", completed: true },
];
export const sampleWish = {
  id: "storybook-wish", title: "Коллекционный синий кот", space: "products", status: "active",
  imageUrl: "/store/cats/blue-tired.webp", price: 2400, currency: "RUB",
  description: "Небольшая коллекционная фигурка для домашней полки.", listIds: [],
};
export const ledger = [
  { id: "welcome", kind: "welcome", direction: "incoming", amount: 500, createdAt: "2026-11-15T10:10:00Z" },
  { id: "buy", kind: "purchase", direction: "outgoing", amount: 150, productTitle: "Синий кот", createdAt: "2026-11-15T10:05:00Z" },
  { id: "refund", kind: "refund", direction: "incoming", amount: 150, productTitle: "Чёрный кот", createdAt: "2026-11-14T17:05:00Z" },
  { id: "reward", kind: "wish_reward", direction: "incoming", amount: 50, wishTitle: "Коллекционный синий кот", createdAt: "2026-11-14T10:10:00Z" },
  { id: "transfer", kind: "transfer", direction: "outgoing", amount: 200, person: { name: "Алексей Орлов", username: "storybook-member" }, createdAt: "2026-11-13T10:10:00Z" },
];
export const ledgerReceipts = Object.fromEntries(ledger.map(row => [
  `GET /rolls/receipts/${row.kind}/${row.id}`,
  { receipt: { ...row, status: "recorded", amount: String(row.amount), subject: row.productTitle || row.wishTitle, participant: row.person } },
]));
export const wallet = { balance: 750, availableBalance: 750, giftCardBalance: 250, reservedBalance: 100, transactions: ledger, nextOffset: null };
export const seller = { id: "storybook-shop", name: "Мастерская керамики", username: "storybook-shop", bio: "Фигурки, кружки и небольшие подарки." };
