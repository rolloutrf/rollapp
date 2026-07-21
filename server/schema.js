import { randomUUID } from "node:crypto";
import { hashPassword } from "./security.js";
import { isMemoryDatabase, query, transaction } from "./db.js";

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    birthday DATE,
    avatar_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wishlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    privacy TEXT NOT NULL DEFAULT 'public',
    occasion_date DATE,
    color TEXT NOT NULL DEFAULT 'coral',
    share_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wishes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    price NUMERIC(12, 2),
    currency TEXT NOT NULL DEFAULT 'RUB',
    priority INTEGER NOT NULL DEFAULT 2,
    privacy TEXT NOT NULL DEFAULT 'inherit',
    allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wishlist_wishes (
    wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
    PRIMARY KEY (wishlist_id, wish_id)
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'reserved',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (wish_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    href TEXT NOT NULL DEFAULT '',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    image_url TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    price NUMERIC(12, 2),
    currency TEXT NOT NULL DEFAULT 'RUB',
    badge TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS rollapp_data_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);
  CREATE INDEX IF NOT EXISTS idx_wishes_user ON wishes(user_id);
  CREATE INDEX IF NOT EXISTS idx_reservations_wish ON reservations(wish_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
`;

const ideaRows = [
  ["idea-film", "Плёночная камера", "Чтобы лето осталось не только в телефоне", "Впечатления", "/art/camera.svg", "https://market.yandex.ru/search?text=пленочная%20камера", 8990, "RUB", "выбор редакции"],
  ["idea-ceramics", "Мастер-класс по керамике", "Сделать чашку, которую невозможно купить", "Впечатления", "/art/pottery.svg", "", 4500, "RUB", "для двоих"],
  ["idea-headphones", "Виниловый проигрыватель", "Ритуал для вечеров без уведомлений", "Техника", "/art/vinyl.svg", "", 21990, "RUB", "мечта"],
  ["idea-blanket", "Шерстяной плед", "Тактильный уют для длинных выходных", "Дом", "/art/cozy.svg", "", 6990, "RUB", "уют"],
  ["idea-book", "Альбом по архитектуре", "Большая красивая книга для кофейного столика", "Книги", "/art/book.svg", "", 3490, "RUB", "новинка"],
  ["idea-coffee", "Набор спешелти-кофе", "Путешествие по вкусам на шесть воскресений", "Гурманам", "/art/coffee.svg", "", 2890, "RUB", "локальный бренд"],
  ["idea-bag", "Сумка ручной работы", "Вещь с характером и красивой историей", "Стиль", "/art/style.svg", "", 12900, "RUB", "малый бизнес"],
  ["idea-plant", "Редкое комнатное растение", "Живой арт-объект, который становится больше", "Дом", "/art/plant.svg", "", 3200, "RUB", "зелёный подарок"],
  ["idea-sneakers", "Кроссовки для долгих прогулок", "Новый маршрут начинается с удобной пары", "Стиль", "/art/style.svg", "", 13990, "RUB", "популярное"],
  ["idea-projector", "Карманный проектор", "Кинотеатр на белой стене где угодно", "Техника", "/art/tech.svg", "", 28990, "RUB", "вау"],
  ["idea-picnic", "Корзина для пикника", "Повод собрать любимых в парке", "Впечатления", "/art/gift.svg", "", 7490, "RUB", "на компанию"],
  ["idea-perfume", "Авторский аромат", "Запах как личная подпись", "Красота", "/art/style.svg", "", 9900, "RUB", "особенное"]
];

const dataMigrations = [
  {
    id: "2026-07-21-koloskof-profile-parity",
    requireMatch: true,
    run: (client) => client.query(
      `UPDATE users
       SET name = CASE WHEN name = 'Mikhail Koloskov' THEN 'Михаил Колосков' ELSE name END,
           avatar_url = CASE
             WHEN avatar_url = '' OR avatar_url IN ('https://колосков.рф', 'https://xn--b1apadobbw.xn--p1ai')
             THEN '/avatars/koloskof.jpeg'
             ELSE avatar_url
           END
       WHERE username = 'koloskof'`,
    ),
  },
];

async function runDataMigrations(client) {
  for (const migration of dataMigrations) {
    const applied = await client.query("SELECT 1 FROM rollapp_data_migrations WHERE id = $1", [migration.id]);
    if (applied.rowCount) continue;
    const result = await migration.run(client);
    if (migration.requireMatch && !result.rowCount) continue;
    await client.query("INSERT INTO rollapp_data_migrations (id) VALUES ($1)", [migration.id]);
  }
}

async function insertIdeas(client) {
  for (const row of ideaRows) {
    await client.query(
      `INSERT INTO ideas (id, title, description, category, image_url, url, price, currency, badge)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      row,
    );
  }
}

async function seedDemo(client) {
  const existing = await client.query("SELECT id FROM users WHERE email = $1", ["demo@rollapp.test"]);
  if (existing.rowCount) return;

  const passwordHash = await hashPassword("demo1234");
  const people = [
    { id: randomUUID(), email: "demo@rollapp.test", username: "alisa", name: "Алиса Морозова", bio: "Собираю поводы радоваться и красивые вещи с историей.", birthday: "1996-08-14", avatar: "" },
    { id: randomUUID(), email: "max@rollapp.test", username: "max", name: "Макс Ветров", bio: "Музыка, горы и хороший кофе.", birthday: "1994-09-03", avatar: "" },
    { id: randomUUID(), email: "sonya@rollapp.test", username: "sonya", name: "Соня Левина", bio: "Делаю дом уютнее, а выходные — длиннее.", birthday: "1997-11-21", avatar: "" },
    { id: randomUUID(), email: "lev@rollapp.test", username: "lev", name: "Лев Орлов", bio: "Не дарите носки. Если только очень красивые.", birthday: "1993-12-07", avatar: "" }
  ];

  for (const person of people) {
    await client.query(
      `INSERT INTO users (id,email,username,name,password_hash,bio,birthday,avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [person.id, person.email, person.username, person.name, passwordHash, person.bio, person.birthday, person.avatar],
    );
  }

  const [alisa, max, sonya, lev] = people;
  const lists = [
    [randomUUID(), alisa.id, "День рождения", "То, чему я точно обрадуюсь в августе", "public", "2026-08-14", "coral", "alisa-birthday"],
    [randomUUID(), alisa.id, "Когда-нибудь", "Большие и маленькие мечты без дедлайна", "public", null, "blue", "alisa-someday"],
    [randomUUID(), max.id, "Для музыки и дорог", "Подарки, которые поедут со мной", "public", null, "lime", "max-road"],
    [randomUUID(), sonya.id, "Тёплый дом", "Красивые повседневные вещи", "public", null, "sun", "sonya-home"],
    [randomUUID(), lev.id, "Новый год", "Можно бронировать, я не подглядываю", "public", "2026-12-31", "ink", "lev-new-year"]
  ];
  for (const list of lists) {
    await client.query(`INSERT INTO wishlists (id,user_id,title,description,privacy,occasion_date,color,share_token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, list);
  }

  const wishRows = [
    ["demo-wish-camera", alisa.id, "Компактная плёночная камера", "Хочу снимать друзей без сотни дублей. Подойдёт рабочая б/у.", "", "/art/camera.svg", 8990, "RUB", 3, "inherit", false, "active", lists[0][0]],
    ["demo-wish-ceramics", alisa.id, "Мастер-класс по керамике", "Лучше сертификат на двоих — пойдём вместе.", "", "/art/pottery.svg", 4500, "RUB", 2, "inherit", true, "active", lists[0][0]],
    ["demo-wish-player", alisa.id, "Виниловый проигрыватель", "Минималистичный, с Bluetooth и прозрачной крышкой.", "", "/art/vinyl.svg", 21990, "RUB", 3, "inherit", false, "active", lists[1][0]],
    ["demo-wish-book", alisa.id, "Альбом про Баухаус", "Любое красивое издание на русском или английском.", "", "/art/book.svg", 3490, "RUB", 1, "inherit", false, "active", lists[1][0]],
    [randomUUID(), max.id, "Хорошие походные наушники", "С шумоподавлением и долгой батареей.", "", "/art/tech.svg", 17990, "RUB", 3, "inherit", false, "active", lists[2][0]],
    [randomUUID(), max.id, "Термос цвета хвои", "0,7–1 литр, без кружки сверху.", "", "/art/thermos.svg", 4200, "RUB", 2, "inherit", false, "active", lists[2][0]],
    [randomUUID(), sonya.id, "Льняное постельное бельё", "Натуральный небелёный оттенок, размер евро.", "", "/art/cozy.svg", 14900, "RUB", 3, "inherit", false, "active", lists[3][0]],
    [randomUUID(), sonya.id, "Большая монстера", "Можно совсем маленькую — выращу.", "", "/art/plant.svg", 3200, "RUB", 1, "inherit", true, "active", lists[3][0]],
    [randomUUID(), lev.id, "Красивые шерстяные носки", "Ладно, всё-таки носки. Яркие и очень тёплые.", "", "/art/style.svg", 1600, "RUB", 2, "inherit", true, "active", lists[4][0]]
  ];

  for (const wish of wishRows) {
    await client.query(
      `INSERT INTO wishes (id,user_id,title,description,url,image_url,price,currency,priority,privacy,allow_multiple,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      wish.slice(0, 12),
    );
    await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [wish[12], wish[0]]);
  }

  await client.query("INSERT INTO follows (follower_id,following_id) VALUES ($1,$2),($1,$3),($2,$1),($3,$1)", [alisa.id, max.id, sonya.id]);
}

export async function initializeDatabase() {
  await query(schema);
  await transaction(async (client) => {
    await insertIdeas(client);
    await runDataMigrations(client);
    if (isMemoryDatabase || process.env.SEED_DEMO === "true") {
      await seedDemo(client);
    }
  });
}
