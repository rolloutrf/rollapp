# Холодный app-chrome fixture — 20 октября 2026

В integrated-main/alignment candidate f92ada8/dirty реальный cold run
--image-alignment-only failed на первом chrome=1: Vite оптимизировал
@base-ui/react/select уже после startup, затем Invalid hook call/useContext(null)
в SelectRoot и пустой root. Новая bounded network/console диагностика сохранила
pageerror; это конкретный startup counterexample, не предположение по timeout.
Log: `/tmp/rollapp-notion-alignment-integrated-native-2026-10-20.log`.

## Исправление test harness

Полный список23 фактических Base UI imports prebundle до navigation, включая
select/popover/button/use-render. Inventory unit сканирует реальные src imports;
он и wiring check сначала дали2 FAIL на старом списке, после изменения PASS.
Механизм соответствует [официальному Vite pre-bundling](https://vite.dev/guide/dep-pre-bundling.html):
поздно обнаруженные зависимости могут вызывать повторную оптимизацию/reload.
Никакой production model, schema, API или JSX-компонент этой дельтой не меняется.

Browser diagnostics используют публичные события/методы: сохраняют bounded
pageerror/console/HTTP/pending requests без URL query, не вмешиваются в native
focus, input, timers, retries или assertions. Делегирование, ownership, bounds
и request cleanup проверены3 unit. Discovery не отключён, timeout не увеличен.

## Проверено на feature candidate

- npm test787 total/786 PASS/1SKIP/0FAIL.
- Новый отдельный cold cache `.vite-cold-chrome-all-baseui-20261020`:
  alignment dark8/light2,10 PASS/terminal0, включая chrome и short panned keyboard.
  После initial bundle нет позднего dependency-changed reload/Invalid hook call.
- Before unit log `/tmp/rollapp-notion-cold-chrome-deps-before-2026-10-20.log`;
  after unit `...-deps-after-2026-10-20.log`, browser `...-alignment-after-2026-10-20.log`.
- Это не общий editor/comprehensive PASS и не объяснение прежнего paste Undo.
  Перед отдельным push поверх main повторяются baseline unit/UI/build/images.

Воспроизводимый тест-only startup fix отделяется от ещё не выпущенной image
alignment функции. Полная цель Notion, actual-device IME, arbitrary clipboard
compositions и production exact-SHA/live UI не закрываются.
