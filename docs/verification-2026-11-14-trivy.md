# Проверка релизного образа Trivy — 14 ноября 2026

Проверена чистая ветка `codex/trivy-release-scan-20261114` на коммите
`0c5d94e21518b190b3c06ed79425e9fe4dc74dc4`, от `origin/main` `285dc50d`.

- В [GitHub Actions](https://github.com/rolloutrf/rollapp/actions/runs/43585177063)
  команда `gh workflow run deploy-yandex-cloud.yml --ref codex/trivy-release-scan-20261114 -f verification=image`
  собрала `linux/amd64`, прогнала встроенные три теста OpenTimestamps и оба
  прохода Trivy 0.76.2. В Alpine 3.24.4, Node и Python не обнаружено `HIGH` и
  `CRITICAL`. Архив `rollapp-release-1` принят GitHub Actions, ID `14109604882`.
  `deploy` и веточный UI audit пропущены по условию режима `image`.
- [Первый запуск](https://github.com/rolloutrf/rollapp/actions/runs/43584843694)
  на `ce651ce7` показал пять `HIGH` в инструментах установки Python. После
  удаления `pip` и `setuptools` из окружения OpenTimestamps в Dockerfile эти
  записи исчезли. Из runtime также удалены `npm` и `npx` после `npm ci`.
- `npm ci`, `npm test` (1024 pass, 1 skip), `npm run build`,
  `npm run test:private-data` и `npm run test:reward-proofs` прошли.
  `node --test scripts/deploy-vm-metadata.test.js server/database-startup.test.js`
  после финальной правки workflow дал 22 pass. `actionlint` 1.7.12 и ShellCheck
  0.11.0 прошли с исключением для существующего `concurrency.queue: max`,
  которое поддерживает GitHub. `git diff --check` прошёл.
- `npm audit --omit=dev` по-прежнему показывает две связанные записи `HIGH`
  для `@ton/ton` и его вложенного `zod`. npm не предлагает совместимого
  исправления для этой цепочки. Полный `npm audit` показывает 8 записей
  (2 low, 4 moderate, 2 high). У Trivy и npm различаются базы и представление
  находок, поэтому результат Trivy не отменяет вывод `npm audit`.
- В исходной рабочей копии `f55cce47` с уже имевшимися незакоммиченными
  правками первый локальный скан нашёл 12 `HIGH` в Node.js. Обновление
  `body-parser`, Vite и Zod, исправление записи `is-unsafe` в lockfile и удаление
  npm из runtime позволили локально собрать образ и получить 0 `HIGH` / 0
  `CRITICAL`. Проверены `docker save` → `docker load`, совпадение Docker ID,
  отказ при неверном ID и наличие Node, Chromium, Caddy и `dist/index.html`.
  Read-only проверка схемы настроенной production БД прошла. Локальный
  `check:comprehensive` остановлен вручную на `test:text-edit` в этой рабочей
  копии, полной матрицы нет.

Выпуск в Yandex Cloud не запускался. При проверке production `/api/healthz`
вернул `ok: true` на существующем SHA. Скачивание артефакта и публикация с OIDC
в GitHub Actions остаются непроверенными в реальном релизе.
