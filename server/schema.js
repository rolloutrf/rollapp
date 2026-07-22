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
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  ALTER TABLE wishes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

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
    reference_id TEXT,
    read_at TIMESTAMPTZ,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_id TEXT;
  CREATE INDEX IF NOT EXISTS notifications_reference_idx ON notifications(reference_id);

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
  CREATE INDEX IF NOT EXISTS idx_wishes_user_sort ON wishes(user_id,status,sort_order);
  CREATE INDEX IF NOT EXISTS idx_reservations_wish ON reservations(wish_id);
  UPDATE reservations
  SET status='multiple'
  WHERE status='reserved' AND wish_id IN (SELECT id FROM wishes WHERE allow_multiple=TRUE);
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

const koloskofWishOrder = [
  "omw-wish-8269522345b446b528121881",
  "omw-wish-ad6934be2b75c92613954618",
  "omw-wish-996a511a3fccb28543201785",
  "omw-wish-576a525f1bccc27133133888",
  "omw-wish-c966726d3c2b80f866050341",
  "omw-wish-c56a58efe7dca97879563811",
  "omw-wish-236a58ef578201d768825741",
  "omw-wish-e2692c86e90f180657823317",
  "omw-wish-f3692c37b5540f2856497672",
  "omw-wish-f06a41361ed32d4648799440",
  "omw-wish-7d688504079daba451719954",
  "omw-wish-3a64bc19233c82c289936152",
  "omw-wish-9e6892e1397d9fd604116052",
  "omw-wish-df6a47b4c6247e2255327699",
  "omw-wish-9968ea86c285f1a001297830",
  "omw-wish-9f68f29d513e608155636572",
  "omw-wish-4c65880fcf069ac798897154",
  "omw-wish-5460b25235d5885147529245",
  "omw-wish-ef6a47589cedbc5380836946",
  "omw-wish-70688506b57d28a681210378",
  "omw-wish-7468962f1623767834158068",
  "omw-wish-8769ae8a6b91145322394605",
  "omw-wish-8a6a56987a131c8679284009",
  "omw-wish-5a6a418b2311b62663640170",
  "omw-wish-42693a4d470ec9c402826238",
  "omw-wish-2b695284e35b78a526290794",
  "omw-wish-686097ee8c6358a869985894",
  "omw-wish-c567af9dfd55751280066415",
  "omw-wish-6369470d0943ce8242818112",
  "omw-wish-5a662ec5f851b4c797618314",
  "omw-wish-8967a7227e51494822931472",
  "omw-wish-9169405c5c7daa5768139122",
  "omw-wish-de696b78b165112480502588",
  "omw-wish-6f693da29bded31551477624",
  "omw-wish-706a566668d3f15168150834",
  "omw-wish-6d69358d828cf3d467218995",
  "omw-wish-3d6920cf158dc02893626254",
  "omw-wish-7d6918cba202926926842874",
  "omw-wish-886918cb89f404f463596160",
  "omw-wish-d1688539a16a409122694209",
  "omw-wish-6668849c55260e5609571507",
  "omw-wish-5b68849bc647d4d006444463",
  "omw-wish-eb682429b7be5ac170873280",
  "omw-wish-e1681fceebadf02716945101",
  "omw-wish-ef67d91db225bfc369683753",
  "omw-wish-5467b6bff3d74bb666080913",
  "omw-wish-5967ae268c75a56188036034",
  "omw-wish-ba6783eca5ed152700179426",
  "omw-wish-886767333d448ad355801240",
  "omw-wish-316595b8fc46748002777712",
  "omw-wish-a9668a5ea7e589e348399688",
  "omw-wish-9b6595b769e872f274133604",
  "omw-wish-5c658a5e56322bd807879286",
  "omw-wish-da6585295ce8a5c283828019",
  "omw-wish-d5658528e83405c097734291",
  "omw-wish-7c64bc1d4f657a2275211949",
  "omw-wish-4964bc3c589e1be041981271",
  "omw-wish-cb67b21d91d564d128648374",
  "omw-wish-7662ddadd8a4bd5581334363",
  "omw-wish-f261817240300b7124991428",
  "omw-wish-236173c453ba0e9783362380",
  "omw-wish-cc617d32a6dc5e8486139180",
  "omw-wish-f160ee91f31995c604023678",
  "omw-wish-d6617ad670b3ff0557618682",
  "omw-wish-766093bb19324e8356939497",
  "omw-wish-876093b577f3105726049798",
  "omw-wish-e26093b51833b70625244734",
  "omw-wish-3f60a9806464171700066007",
  "omw-wish-476093b31691a2f983827694",
  "omw-wish-8760f09b740f3e7035614133",
  "omw-wish-3760b252c8489e9070587563",
  "omw-wish-5d693e886540719862395106",
  "omw-wish-5f672e46ada82e5006144424",
  "omw-wish-906595b48b736a6012213246",
  "omw-wish-bb6757372ea93ac015932714",
  "omw-wish-4769a451ecde256857006272",
  "omw-wish-2767915ea937e9c678784152",
  "omw-wish-4a69ac9dcf3771e746130953",
  "omw-wish-70696b719289f57041060631",
  "omw-wish-25695509aab9cbb448953526",
  "omw-wish-b46093b129a1f49329068535",
  "omw-wish-73694661aa3b8da799112034",
  "omw-wish-8c6945b86e9f800983273108",
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
  {
    id: "2026-07-22-koloskof-wish-order",
    requireMatch: true,
    requiredRows: koloskofWishOrder.length,
    run: async (client) => {
      let rowCount = 0;
      for (const [index, id] of koloskofWishOrder.entries()) {
        const result = await client.query(
          `UPDATE wishes SET sort_order=$1
           WHERE id=$2 AND user_id=(SELECT id FROM users WHERE username='koloskof')`,
          [index + 1, id],
        );
        rowCount += result.rowCount;
      }
      return { rowCount };
    },
  },
];

async function runDataMigrations(client) {
  for (const migration of dataMigrations) {
    const applied = await client.query("SELECT 1 FROM rollapp_data_migrations WHERE id = $1", [migration.id]);
    if (applied.rowCount) continue;
    const result = await migration.run(client);
    if (migration.requireMatch && result.rowCount < (migration.requiredRows || 1)) continue;
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
  const exclusiveReservations = await query(
    `SELECT id,wish_id FROM reservations
     WHERE status='reserved' ORDER BY wish_id,created_at,id`,
  );
  const occupiedWishIds = new Set();
  for (const reservation of exclusiveReservations.rows) {
    if (!occupiedWishIds.has(reservation.wish_id)) {
      occupiedWishIds.add(reservation.wish_id);
      continue;
    }
    await query("DELETE FROM notifications WHERE reference_id=$1 AND type='reservation'", [reservation.id]);
    await query("DELETE FROM reservations WHERE id=$1", [reservation.id]);
  }
  await query(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_one_exclusive ON reservations(wish_id) WHERE status='reserved'",
  );
  await transaction(async (client) => {
    await insertIdeas(client);
    await runDataMigrations(client);
    if (isMemoryDatabase || process.env.SEED_DEMO === "true") {
      await seedDemo(client);
    }
  });
}
