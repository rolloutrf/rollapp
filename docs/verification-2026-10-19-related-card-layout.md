# Карточки связанных объектов To Do — 2026-10-19

HEAD `d116857ce0aadfeb4e1258fdb1a3ae2abf5e958f`, dirty до начала.
Скриншоты пользователя относятся к работающему приложению `http://127.0.0.1:5172/app/planning?tab=todo`.
Компонент существовал только в незакоммиченных изменениях основной копии
`/Users/developer/Desktop/Git/rollout/rollapp`; исправления сделаны там.
В исходной worktree cd88 компонент отсутствовал. Посторонние изменения
в планировании/API, редакторе и проверках сохранены, push/deploy не выполнялись.

## Исправление

- Индикатор действия перенесён из медиа в самостоятельный дочерний элемент
  карточки. В компактной композиции — отдельная третья колонка, без перекрытия
  логотипа и текста. Круг 48px, glyph 20px; destructive вариант сохранён.
  Вместо отсутствующего `--destructive-foreground` используется существующий
  контрастный `--background`.
- `.daily-todo__composer-related.planning-related__selected` сохраняет flex rail
  вопреки более позднему общему правилу сетки выбранных объектов. Ранее реальный
  двойной class возвращал grid и сжимал карточку/название; синтетическая проверка
  без второго class этого не ловила. Новая проверка сохраняет оба class и
  подтверждает display:flex и 288px в настоящем композере.
- Выбранное медиа имеет один border 2px вместо border + внешнего outline с offset.
  Клавиатурный focus-visible кнопки сохранён.
- Категория не повторяется второй строкой, когда она уже служит fallback-описанием.
- Обновлён `docs/spacing-system.md`.

## Проверки

- Финальный `npm run test:todo`: exit0, **53 PASS**. Штатные 320/390/640/767/768/820/1024/1440/1920 × 844/400,
  плюс 14 новых проверок связанных карточек (320/390/768/820/1024/1440/1920 × 844/400).
  Проверены один контур, отдельные колонки, фактические размеры 48/20, отсутствие
  дублирующей категории и переключение состояния. Настоящий композер проверяет
  overflow/достижимость, cancel/Done/reopen/removal, failed-save/retry и payload.
- Финальные `npm test`: 717 total, 716 PASS, 1 SKIP, 0 FAIL; `test:ui`: PASS
  (37 primitives, 75 application JSX). `npm run build`: exit0, обычное предупреждение о чанках.
- Live UI через IAB с существующей авторизованной сессией и production API:
  найден настоящий Go Practive, проверены выбранная карточка и компактный сниппет.
  Задача не создавалась/не сохранялась. Проверочный локальный выбор убран.
  Снимки: `/tmp/rollapp-related-live-picker.png`, `/tmp/rollapp-related-live-composer-final.png`.
  Вручную просмотрены также 320×844, 390×844 и 768×400 screenshots fixtures.
- `dev:keepalive:status`: production dev PID91967, API/frontend готовы; сервис оставлен работать.
  Worktree cd88 не имела настройки PostgreSQL; БД там не подменялась.
- `npm audit`: 7 high в существующем dev tooling (shadcn/transitive chain),
  `npm audit --omit=dev`: 0. Предлагаемый общий fix — несовместимый shadcn1.0.0;
  downgrade не применялся. Зависимости/lockfile основной копии не менялись.
- `git diff --check`: PASS. Полный diff просмотрен с сохранением исходной dirty дельты.
- Общий прогон: `/tmp/rollapp-related-layout-comprehensive.json`,
  лог `/tmp/rollapp-related-layout-comprehensive.log`; результат будет записан ниже.
  Этот прогон не считается завершённым до terminal exit и всех девяти этапов.

Логи финальных проверок: `/tmp/rollapp-related-layout-{todo-verified,unit-final,ui-final,build}.log`.
Скриншоты новых случаев: `/tmp/rollapp-related-cards-{width}-{height}.png`.
Мобильный композер отдельно не добавлялся: на мобильном остаётся TaskEditor.
Реальное устройство/IME и полный редакторный goal этой локальной правкой не подтверждаются.

## SHA256 финальных затронутых исходников

- `src/components/planning-related-card.jsx`: `e2499084f01ceeb3ea854e4753aaa9a9b319a5f8f0ecef40c86e697cf0d1f9e4`
- `src/components/planning-daily-todo.css`: `22f1794b4f1956b97661fb6547ba20c384fb51d6e754c8ab5a679d948c1496ef`
- `src/components/planning-space.css`: `06c227904af1337828d5e9957f3a0a58785c09386ec6123aae3474b870c39183`
- `scripts/daily-todo-ribbon-smoke.mjs`: `80c894b76de444b428e752434efe64eeb83866f7b54244c636cb53f38f9499e9`
- `scripts/fixtures/daily-todo-ribbon.jsx`: `7a334b01b7cbd4028005b3a10aa7235115727c8efe35a46376de1fc82341b15e`

## Упрощение после обратной связи

Красный залитый круг в композере заменён на destructive-крестик без заливки/тени.
Сохранены отдельная колонка, 48px область и 20px glyph. Тест проверяет прозрачный
фон и отсутствие box-shadow; повторный финальный test:todo записывается в
`/tmp/rollapp-related-simplified-todo.log`. Предыдущие hashes CSS/теста относятся
к исходной версии до этого уточнения. Общий прогон также не доказывает единый
снимок: в основной копии параллельно меняется несвязанный inline editor.

Повторный test:todo после упрощения: terminal exit0, 53 PASS, вся штатная матрица.
`git diff --check`: PASS. Проверены обновлённые 390×844 screenshot и computed transparent/no-shadow.
- Финальный `src/components/planning-daily-todo.css`: `53116d7fd4baaee5c8eabe476bbc214af867e1067ebe10633d90d8c93cd07399`
- Финальный `scripts/daily-todo-ribbon-smoke.mjs`: `3d2b59f5f1555b29ed0201cd926367e82749befc6f5d9d509cf2fbcfb2d6996e`

## Итоговый запрос: изображения с крестиком и перенос

После уточнения пользователя горизонтальная лента/подписи/отдельная колонка
удаления заменены на preview-режим общего RelatedChoiceCard только в композере:
48×48px картинка (fallback icon при отсутствии), крестик 20px поверх угла,
никаких видимых названий/описаний. Полное название остаётся в aria-label/title.
Общий flex-parent переносит картинки в новые строки, overflow visible по обеим
осям. Выбор объектов в picker сохраняет подписи для поиска/идентификации.
Изменения сохранения/API отсутствуют. Контракт spacing-system обновлён.

Новая матрица проверяет 12 превью, реальное удаление кликом по overlay, fallback,
отсутствие текстовых узлов/скролла, containment и несколько строк на всех
viewport. Настоящий InputGroup дополнительно получает 12 объектов, проверяется
wrap/отсутствие собственного скролла/доступность действий, в том числе400px высоты.
Финальный лог: `/tmp/rollapp-related-image-previews-todo-final.log`.

Первый расширенный прогон выявил нехватку высоты у12 превью64px на768×400.
Превью уменьшены до общего control-size48px; итоговая проверка повторена.

Финальная версия image-only/wrap: `npm run test:todo` — terminal exit0,53PASS,
полная штатная матрица, включая12 объектов в настоящем InputGroup на всех
пяти desktop-ширинах и обеих высотах. Лог
`/tmp/rollapp-related-image-previews-complete.log`. Короткая диагностика768×400
также exit0; она не подменяет полный прогон. На коротких desktop-окнах до500px
локально сокращён старт textarea до одной строки/общего min-size48px: прежний
глобальный min-height96px не оставлял место двум рядам превью. Обычная высота
в остальных viewport не меняется. Типографика18/28 сохранена.

`test:ui` PASS (37/75); финальный build exit0 с прежним предупреждением о чанках.
`git diff --check` PASS. Просмотрены screenshots настоящего InputGroup с12
объектами768×400 и768×844. Production dev91967 оставлен работать; реальные
записи/схема не менялись. Предыдущий live review относится к прежней композиции,
новая image-only версия подтверждена браузерными fixtures с запрещёнными writes.
- Image-only final `src/components/planning-related-card.jsx`: `8c49307239da1a9750afcb996932a073528a1372b63c305d7962b08a4ebca8ab`
- Image-only final `src/components/planning-daily-todo.jsx`: `afd8b726e8496cd25f192e2db0288c921125decf69c31b6cb17260cab09174bb`
- Image-only final `src/components/planning-daily-todo.css`: `de556bfedbf890ba0d936b71394a759a9094b5dc937918d3d8cd71576ecdfcff`
- Image-only final `scripts/daily-todo-ribbon-smoke.mjs`: `f12dec3c0916edbdfff25b8e7a8887f5f59602c4bc96c54f3ec3d34e0dcd22a6`
- Image-only final `scripts/fixtures/daily-todo-ribbon.jsx`: `011f1248690bdadaefac9a4ffd3512378467fca5b00e0f61b5a02e58ea1290d2`
