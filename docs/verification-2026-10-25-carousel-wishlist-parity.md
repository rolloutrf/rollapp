# Карусели как на главной Wishlist — 25 октября 2026

База `2b04024cfda27a72c3746955be5de3cb63517488`. Live comparison production: края уже без fade и плитки130×100/radius18/padding12/gap8 совпадали. Оставались локальные padding-block8 у ленты дней (общая высота116 вместо100) и другой цвет числа выбранного дня.

PlanningDayRibbon теперь использует общий ListTileContent. Общий horizontal-tile-scroller владеет flex/gap8 и padding-block0; локальная обвязка дней удалена. Count role в index.css сохраняет muted-цвет во всех состояниях, как реальный главный Wishlist. Выбор дня/центрирование/клавиатура/точка сегодня и мобильная строка сохранены. Обновлены центральные contracts и AGENTS; upstream primitives не менялись.

## Проверки dirty source

Тестировались изменённые PlanningDayRibbon, day CSS, spacing/index CSS и профильные guards/fixtures; ранее изменённые verification reports сохранены отдельно.

- `npm run test:ui` — PASS. Guard ListTileContent включает дни.
- `npm run test:todo` — PASS полного набора63 cases: все стандартные9 ширин320–1920×844/400, формы/даты/Back/retry, центрирование, native keyboard и отсутствие мобильной ленты. Теперь rail height100, padding-block0, gap8. Лог `/tmp/rollapp-carousel-todo.log`. Screenshot1440 просмотрен: одинаковая строка плиток, без fade/лишних полей.
- `npm run test:action-rails` — PASS144 cases,9 ширин без фильтров. Реальный WishListNavigation сравнивается с реальным PlanningDayRibbon по геометрии, подписи/числу, цветам и normal/selected на всех desktop widths. Полная исходная матрица action rails сохранена. Лог `/tmp/rollapp-carousel-action-rails.log`.
- `npm run test:page-scrollers` — PASS108 cases, полный набор sizes/1/2/12 плиток и всех границ/концов/overflow. Лог `/tmp/rollapp-carousel-page-scrollers.log`.
- Production schema preflight: точные configured DB/role, authorized TLS, pool1, READ ONLY verify, ROLLBACK — PASS. Без миграций/записей.
- npm audit —2 известных high dev-chain @ton/ton→zod без доступного fix; omit=dev0. Зависимости/lockfile не менялись.
- git diff --check — PASS.

## Выпуск

Standing user request: деплой без сложного аудита. После local affected full matrices используется targeted health gate (unit/UI/полный controls/полный health/build). Comprehensive/editor matrix не запускались и не заявляются PASS. Итоговый SHA/CI/production/live review будут дописаны после выпуска.

Production до выпуска healthy2b04024. Рассмотрен старый image18bb093354bb8ea5c36f2696c6321381d8cd68a5 (id702dec9a,2026-10-23): ни один контейнер не ссылается, registry manifest доступен, не current/previous или сохранённый rollback checkpoint. Удалён только этот точный cache tag без force/prune/контейнеров/volumes. Current2b04024, previous3c440c9 и checkpoints сохранены; свободно6765240320bytes перед pull.

## CI и синхронизация теста

Run40232361429 на dfd84ab: unit/UI/полный controls прошли; test:health остановился на первом sleep navigation с ERR_ABORTED (переход к empty сразу после закрытия native form). Image/metadata rollout не выполнялись, production остался2b04024.

Повторный анализ исходника MobileFormPages показал: unregister сначала скрывает DOM, затем через timer запускает history Back. Health smoke ждал только скрытия поля и мог начать следующий goto раньше этого Back. Лог optimizer bundling сам по себе НЕ доказывает reload: прежняя атрибуция ошибки холодному Vite была предварительной и недостаточной. Явная prebundle настройка сохранена; в health smoke добавлено ожидание реального возврата URL без formScreen после успешного Save/Back перед следующей формой/навигацией. Assertions не сокращены, перехвата/подавления ошибки или goto retry нет; продуктовый form lifecycle не менялся.

Локальный повтор `npm run test:health` с ожиданием URL возврата — PASS20 cases, exit0; `/tmp/rollapp-carousel-health-return.log`. В промежуточной неподготовленной версии helper был объявлен const ниже исполняемого top-level цикла (ReferenceError); заменён hoisted function declaration до финального полного PASS, в release эта промежуточная версия не попадала. Остальные product sources dfd84ab и их полные local matrices не менялись.
