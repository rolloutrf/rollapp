# Desktop messenger popup — 2026-11-01

Base commit: `6dd0105c454cffdc841ba8d4dbc5496c2cfa4578`.
Branch: `codex/messenger-release-20261101`; проверен dirty worktree, изменения не закоммичены.

Desktop launcher открывает обычный Base UI Popover поверх исходной страницы,
без смены URL. Одна панель: список/поиск → чат → Back к списку.
Ширина до compact-width (448px), высота до 36rem и доступного viewport.
Крестик, Escape, outside click закрывают окно; Escape возвращает фокус launcher.
Планирование и messenger исключают одновременное открытие своих popup.
Прямые desktop messenger URL открывают окно поверх Wishlist, сохраняя id чата.
Телефон сохраняет отдельные страницы и VisualViewport layout.

## Проверки

- `npm run test:messenger`: PASS 9/9 — 320/390/768/820/1024/1440/1920 ×844,
  дополнительно 390×400 и 1440×400. Проверены реальный AppShell/launcher,
  поиск, список, сообщения, history pagination, retry/UUID dedup, drafts при Back,
  literal text, ошибки/retry, control geometry, overflow, popup bounds,
  close/Escape/outside/focus, неизменный URL источника и desktop deep link.
- `npm run test:controls`: PASS, 154 проверок; полный профиль control geometry,
  visible paint и DPR3, без замены assertions на minimum-size.
- `npm run test:ui`: PASS (37 primitives, 97 application JSX sources).
- `npm run build`: PASS; остаётся предупреждение размера chunks.
- `git diff --check`: PASS; финальный diff просмотрен, посторонних изменений нет.
- `npm run dev:keepalive:status`: production TLS preview готов на15277/18277,
  PID96142; оставлен работающим. Миграций или новых данных БД не было.
- `npm audit`: 8 tooling findings (2 low,4 moderate,2 high);
  `npm audit --omit=dev`: 0. Dependencies/lockfile не менялись.

Скриншоты desktop1440×844,820×844 и короткого desktop1440×400 просмотрены.
Первый smoke остановился на outside-click по тексту fixture, перекрытому
реальным chrome; проверка использует свободную точку исходной страницы.
Финальный полный профиль messenger прошёл после исправления fixture.

Полный application suite/comprehensive намеренно не запускался по указанию
пользователя. UI transport только синтетический, любые реальные /api запрещены;
это не integration-проверка реальной переписки/real-device IME. Authenticated
live UI и новая production выкладка в этой правке не выполнялись.
Черновики живут в текущем окне и очищаются при его закрытии, как описано в messenger.md.
