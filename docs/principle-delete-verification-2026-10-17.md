# Корзина в редакторе принципа — 17 октября 2026

Проверяемый HEAD: `710457583a873ce56b93d4eb26849731164f5b2d` (точный SHA приведён в JSON полного прогона). Рабочая копия dirty; во время прогона в общей рабочей копии также появились сторонние изменения VisualViewport/overlays и дополнительные panning-проверки; они сохранены. существующие изменения планирования, контролов, CSS, App.jsx и документации сохранены. Изменения этой задачи не коммитились и не публиковались.

На приложенной записи редактор принципа показывал широкую кнопку «Удалить принцип» в теле формы, отдельно от сохранения. В общем редакторе принципов/тезисов удаление перенесено в footer: круглая иконка корзины 48×48, рядом с сохранением. На телефоне shared MobileFormFooter размещает Back, Save и корзину в одной fixed-строке; подпись Save сокращена до «Сохранить», accessible name остаётся полным. Desktop footer также использует ControlBar и общую горизонтальную строку. Существующее подтверждение и обработка ошибок удаления сохранены. Другие вызовы EditorDeleteAction не включают новый compact-режим и сохраняют свой вид.

Проверки:
- `npm run dev:keepalive:status` вне sandbox: сервис готов, API и frontend готовы; постоянное production-подключение оставлено работать.
- Read-only live UI на `http://127.0.0.1:5172/app/spheres/identity?tab=principles`, desktop и 390×844: открытие существующего принципа, просмотр, отмена. На mobile все действия y=780, height=48; Back и Delete width=48, Save width=246. Данные не сохранялись и не удалялись.
- `npm run test:ui`: passed, 37 primitives / 59 JSX.
- `npm run check:comprehensive`: PASSED, exit 0. Все 7 этапов: check:release (unit, UI, controls, details, dates, form-actions, text-edit, build), navigation, action-rails, todo, form-pages, catalog-page, drawers. `test:form-actions`: 90 комбинаций viewport/form и дополнительный StrictMode/Enter/busy сценарий. JSON: `docs/principle-delete-verification-2026-10-17.json`. Лог `/tmp/rollapp-principle-comprehensive.log`.
- Новый principle-сценарий включён в полную матрицу `test:form-actions`: выравнивание/размер корзины, отсутствие видимого текста, диалог и отмена, прокрутка, keyboard/panning, native form owner, Back; desktop проверяет общую строку и 48×48. API-запросы отклоняются, удаления нет.
- `npm audit`: 7 high в цепочке dev tooling shadcn/ts-morph → fast-glob/micromatch/braces; предложенное общее исправление — несовместимый downgrade shadcn до 1.0.0, не применялось. `npm audit --omit=dev`: 0 уязвимостей. Dependency/lockfile не изменялись в этой UI-задаче.
- `git diff --check`: passed.

Скриншоты: `/tmp/rollapp-form-actions-principle.png`, `/tmp/rollapp-form-actions-principle-desktop.png`.

Ограничения: физический iOS Safari/Telegram и реальная клавиатура не проверены; browser VisualViewport emulation их не заменяет. Реальное удаление/сохранение не выполнялось. Production deployment не выполнялся.
