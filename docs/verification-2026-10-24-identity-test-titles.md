# Длинные названия личностных тестов — 2026-10-24

Подготовлено поверх `49946b937e35d5680762728f4739edf884ce6456`, dirty=true.
При проверке перед выпуском найден реальный выход дочернего текста за границы:
для названия из 80 W ширина EmptyTitle была 1045px на viewport 320px;
подтверждение имело scrollWidth 1286px при clientWidth 288px. Root overflow
при этом оставался false из-за clipping ancestor, поэтому его одной проверки
недостаточно.

Добавлен перенос через общий `wrap-anywhere` в пустом состоянии и заголовках
подтверждений теста/PDF. Сами подтверждения прокручиваются внутри существующей
общей границы VisualViewport. Upstream primitives, шрифты, контролы и глобальные
контракты не изменены. Backend, parser и схема не менялись.

Проверки финального кандидата:

- `npm run test:identity-reports`: PASS: source PDF/Gallup/Hogan, charts, anchors и
  новая матрица 320/390/768/820/1024/1440/1920, 1024×400 и 390×400. Переименование
  в 80 W и длинное имя PDF; реальные границы empty-title, scrollWidth/границы
  обоих подтверждений, достижимость Cancel/Delete, отсутствие root overflow,
  сохранение/отмена форм, 48px и четыре радиуса 24px; любые API запрещены.
- `npm test`: PASS, 831 tests, 830 pass, 1 skipped, 0 fail; без БД.
- `npm run test:ui`: PASS, 37 primitives / 86 JSX.
- `npm run build`: PASS; существующее предупреждение о chunk size.
- `git diff --check`: PASS.

Логи: `/tmp/rollapp-identity-overflow-{reports,unit,ui,build}.log`.
Первый диагностический лог: `/tmp/rollapp-identity-long-title.log`.
Production-данные не создавались и не удалялись. Выпуск и exact health SHA
проверяются отдельно после CI. Старый полный аудит коммита 689df92 выполняется
в изолированном неизменяемом checkout; этот маленький UI delta покрыт новой
матрицей, а новый CI выполнит обязательный release-набор на финальном SHA.

## SHA-256 проверенного кода

```text
78d7941e3adf3731eb9d6cf2dfe5b511e05c670be13efd9a014e78cf029e442c  src/components/identity-report-manager.jsx
e2a00e2ae0a9b7b71e9dc16ad0d9205846f387ca241be296409cfe15ea9d087b  src/components/identity-reports-page.jsx
2ea5eef2386fd60e9d3f6eb12458fd75931bc43789cef8fce75cea186f70fbc4  scripts/identity-tests-smoke.mjs
```
