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
