# Границы карточек анализов — 2026-10-24

Базовый commit: `95223417bdd06683875ef7cf273ecab599270779`.
В начале задачи рабочее дерево было чистым; во время проверки появились
параллельные изменения других областей приложения и lockfile. Они сохранены.
Результаты относятся к рабочему дереву, а не к чистому релизному commit.

## Причина и исправление

Card рисует внешний ring шириной 1px. AccordionContent обрезает содержимое,
а сетка карточек оставляла запас только по горизонтали (`px-px`). Поэтому
верхняя линия первого ряда и нижняя линия последнего ряда обрезались.
Сетка теперь использует `p-px`: запас для внешнего ring со всех сторон.
Upstream Card/Accordion не менялись.

## Проверено

- `npm run test:lab-results`: 32 PASS, 320/390/768/820/1024/1440/1920 × 844
  и 390×400, light/dark, DPR 1/3. Реальные LabReportPanel/карточки/аккордеон,
  первое открытие и повторное раскрытие. Проверены все clipping ancestors,
  четыре края каждого ring и пиксели прямой верхней/нижней линии первой карточки.
  API запрещён; данные — явные UI props, без подключения к подменной БД.
- Негативная проверка: временный Vite transform только в отдельном тесте
  возвращал исходный `px-px`. Тест упал `light/1/320: card ring clipped`
  на первом и последнем рядах. Рабочий исходник при этом не менялся.
  Временный скрипт удалён.
- `npm run test:ui`: PASS, 37 primitives / 80 application JSX sources.
- `git diff --check`: PASS на момент записи.
- Оба npm audit после параллельного обновления lockfile: 0 уязвимостей.
- `npm run dev:keepalive:status` вне sandbox: API/frontend готовы,
  постоянный сервис оставлен работающим.
- Визуально просмотрены снимки dark 390×844 и light 1440×844.
  Снимки: `/tmp/rollapp-lab-results-{theme}-{width}-{height}.png`.

Тест включён в обязательный `check:release`, следовательно и в comprehensive.
Контракт записан в `docs/verification.md`.

## Ограничения полного прогона

`npm run check:comprehensive` запущен без фильтров и продолжает работать.
На момент записи пройдены unit/UI, карточки анализов, controls, details, dates,
calendar и form-actions; выполняется text-edit. Весь набор пока не подтверждён.
Лог: `/tmp/rollapp-lab-comprehensive.log`.
Машинный отчёт:
`/private/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1792813340877.json`.
Прогон идёт на изменяющемся параллельными задачами рабочем дереве.

Живые личные анализы не открывались: подключённой авторизованной браузерной
сессии нет, native UI недоступен из-за заблокированного Mac. Production данные
не записывались; публикация/деплой не выполнялись.

## Запуск production release

Исправление и обязательный тест перенесены в отдельный чистый checkout от
`cae73c33ca6ce19890a718ad88d3afb377e6788c`. Commit:
`95f1f3b6669a5d06c0b314c4559ddc1704a386a3`, опубликован в main.
Параллельные releases объединили его в актуальный
`79d99ae9ae16a76e8f68984460193786bda38a1b` (ancestry и p-px проверены).

Релизный кандидат: 32 lab PASS, UI audit PASS, build PASS, оба npm audit 0;
fast-uri обновлён совместимо 3.1.8 → 3.1.9 (dev-only). Реальный production
existing-schema READ ONLY verify через штатный Lockbox credential: PASS.
Миграции/запись данных не запускались. Сначала прямая проверка без runtime
credential выявила отсутствие пароля; повторена со штатным загрузчиком Lockbox.

Устаревший workflow cae73c3 отменён только после подтверждения, что cloud steps
ещё pending. Workflow 95f1f3b был затем отменён параллельным выпуском.
Актуальный workflow: https://github.com/rolloutrf/rollapp/actions/runs/40060709489
Он пока выполняет Test and build. Production всё ещё healthy на
18bb093354bb8ea5c36f2696c6321381d8cd68a5; успешный deploy пока НЕ подтверждён.

Фоновая проверка ожидает завершения этого CI и только после success сверяет
точный SHA, исправление в опубликованном JS, redirects и публичный профиль.
Статус: /tmp/rollapp-lab-deploy-result.json;
лог: /tmp/rollapp-lab-deploy-watch.log;
положительный production результат: /tmp/rollapp-lab-production-verification.json.
