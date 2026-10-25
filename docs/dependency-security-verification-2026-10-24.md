# Совместимые dependency fixes — 24 октября 2026

База: production/source `18bb093354bb8ea5c36f2696c6321381d8cd68a5`.
Ветка `codex/dependency-security-20261024`; во время тестов dirty=true:
изменён только package-lock.json, после тестов добавлены отчёты.
Проверенный lockfile SHA256: `311ce9b0212fdce1bdb9e585ea4de6b377b22153179014e67ff272940e4e07fe`.

Повторный `npm audit` и `npm audit --omit=dev` обнаружили2 high advisories.
Проверены первичные advisories:
[body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828),
[zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
`npm audit fix` без force/major downgrade изменил3 пакета в lockfile:
body-parser2.3.0→2.4.0, его content-type2.0.0→2.1.0, zod4.4.3→4.6.7.
package.json и исходный код не изменены; версии совместимы с текущими ranges.

Проверки после обновления:
- npm test:829 тестов,828 PASS,1 предусмотренный SKIP,0 FAIL.
- npm run test:ui:PASS.
- npm run test:medication-photos:PASS всех9 размеров/полной матрицы.
- npm run build:PASS, существующее предупреждение о chunk size.
- npm audit и npm audit --omit=dev:0 vulnerabilities.
- git diff --check:PASS.

Полный comprehensive/release был выполнен на базовой фото-реализации; эти
результаты не выдаются за полный аудит обновлённого lockfile. Эта ветка не
опубликована на production; перед её rollout остаётся обычный release gate.
Логи: `/tmp/rollapp-dependency-security-{unit,ui,photo,build}.log`,
`/tmp/rollapp-dependency-security-{audit,production-audit}.json`.
