# Продолжение image alignment — 20 октября 2026

Изолированная ветка codex/image-alignment-resume, base6dfff37/dirty до фиксации.
В основе reviewed prototype653, но переносилась только alignment delta поверх
нынешних normalText/link metadata adapters; старые serializer/reader не заменены.
Проверены исходные hashes трёх переносимых файлов. Поддержаны left/center/right,
no-op legacy left, canonical data-image-align, общая Undo/selection и transient
ControlBar с действующими48/20px и chrome/VisualViewport bounds.

Основание поведения: [официальные media options Notion](https://www.notion.com/help/images-files-and-media).
Alt/title сохраняются как metadata, это НЕ реализация отдельной rich caption.
Подписи, viewer, прочие media и точные resize edge/minimum правила остаются в цели.

## Проверки этого снимка

- npm test752 total/751 PASS/1SKIP/0FAIL, UI37/74 и build PASS, terminal0.
- --image-alignment-only:10 PASS/exit0 — dark8/light2, short DPR3, native clicks,
  exact attrs/selection/neighbours, Undo/Redo/save/public read, nested/columns/table,
  fixed questions, twins, source/selection/access/cancel/no-op/full-width,
  header/navigation и simulated keyboard/panning220px/offset96.
- Добавлен новый unit на совместимость с явным normal quote и rich Cyrillic
  link metadata с кавычками/URL delimiter; legacy typography/normal mark сохранены.
- Просмотрены screenshots dark390×400 и light1440×844: selected state различим,
  shared circles/spacing, нет рамок у prose. Это fixture review, не production UI.
- Логи `/tmp/rollapp-notion-alignment-resume-{unit-final,ui,build,native}-2026-10-20.log`.
- git diff --check PASS. Contracts AGENTS/inline/typography/overlays/verification
  синхронизированы. Full401 на этой базе не объявляется прошедшим.

До переноса в main необходима совместная версия с актуальным integrated main,
полный409/editor и comprehensive, resize compatibility и affected live read-only UI.
Исторический prototype653 full393 failed337 на unrelated conversion menu390×400
не объявлен исправленным. Реальные iOS/Telegram/IME не проверены.

Смежная диагностика до alignment: native mixed clipboard1024×844 десять повторов
в обе стороны прошли без runtime изменений; старый Undo контрпример остаётся
необъяснённым. Первый запрос нового diagnostic mode ошибочно запустил full через
старый permissive parser; только собственный проверенный PID69720 остановлен
TERM/exit143, не засчитан. smokeMode теперь rejects unknown/multiple flags до
server/browser startup;2 новых unit и реальные CLI rejection cases подтверждены.

## Tiny media после интеграции main

Снимок ea455b5/dirty: совмещён main e579dca, включая готовую отдельно отправленную
cold smoke diagnostics ветку. Feature alignment в main пока не переносилась.
Native расширение обнаружило два конкретных дефекта прежнего placement:
left1×30 при320px — пересечение кнопки и right rail270px²;
right1×30 при768px — elementFromPoint в центре изображения попадал в кнопку.
Оба прогона завершились exit1, логи
`/tmp/rollapp-notion-tiny-alignment-{before,hitareas-before}-2026-10-20.log`.

Исправление выбирает свободную внешнюю сторону за resize hit area с gap8,
сохраняет общий48px control и не меняет prose/image DOM, typography или z-index.
При отсутствии места с обеих сторон action скрыт. Два pure unit проверяют
1/16/31/32/79/80/120px при семи ширинах и трёх положениях, включая no-room guard.
Native alignment матрица дополнена tiny left/center/right, точными DOM hit areas,
первым pointer capture обеих ручек, preview без записи и exact размером/Undo.

- npm test:789 total/788 PASS/1SKIP/0FAIL, terminal0.
- npm run test:ui:37 primitives/79 JSX PASS; npm run build PASS, terminal0.
  Обычное предупреждение bundle size сохраняется; не объявляется исправленным.
- Native --image-alignment-only:10/10 PASS и --image-resize-only:8/8 PASS,
  оба terminal exit0, раздельные cache directories. Tiny regression проходит
  также768px, где до исправления native image target был перекрыт; screenshots
  dark768×844 и DPR3 dark390×400 просмотрены.
- Просмотрен DPR3 screenshot tiny right390×400: кнопка снаружи, glyph и круг
  остаются общими, native image/rails не прикрыты. Применён frontend-design с
  сохранением существующей минимальной Rollapp композиции/Geist, без редизайна.
- Логи `/tmp/rollapp-notion-tiny-alignment-{unit,ui,build,after,resize-compat}-2026-10-20.log`.
- Основные старые full399/baseline375 ещё выполняются,648/637 inputs drift0;
  не являются проверкой нового integrated alignment. Нужен frozen full409 и
  десять стадий нынешнего comprehensive, затем exact-SHA/live UI и real-device IME.

Remote main и codex/smoke-cold-dependencies подтверждены e579dca. На read-only
проверке production healthy d116857, новый CI e579dca pending; running старый
0a7f645 ещё на Test and build. Ручной rollout/restart не выполнялся. Managed dev
10724 в905f ready и оставлен работать. Изменений schema/data/real uploads нет.

## Итог объединённой проверки

Frozen clean449abb5 прошёл полный409 editor и все десять этапов comprehensive,
terminal exit0;984 исходных inputs drift0 и clean после завершения. Финальный
кандидат508d3e4 сохраняет идентичные application sources и58 build files при
fresh locked install, дополнительно содержит startup verify guard и два
harness readiness waits. Отдельные styles10/four-document8 также PASS/exit0.
Подробности и ограничения — [единый отчёт](notion-production-release-2026-10-20.md).
Это ещё не свидетельство exact-SHA production deployment или actual-device IME.
