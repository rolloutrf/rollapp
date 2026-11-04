# Серверная механика без отдельного UI — 2 ноября 2026

Основа f55cce47e5718bc411f39cfc9436930deb152f23, ветка codex/need-rewards-20261101, dirty-кандидат. На входе уже были изменения первой реализации; серверные файлы, миграция и чужие изменения сохранены. Этот отчёт заменяет UI-выводы первоначального отчёта need-rewards-verification-2026-11-02; он остаётся историческим свидетельством предыдущего кандидата.

Удалены отдельный экран/формы потребностей, маршрут и входная карточка кошелька, их презентационные fixtures и тестовый browser harness. Старый URL /app/rolls/needs попадает в существующий fallback к /app/wishes. src/App.jsx байт-в-байт совпадает с HEAD: обычная форма добавления желаний и её маршруты возвращены к исходному состоянию. Wishlist handlers и другие формы не менялись.

Сохранены серверный API, явное согласие, бизнес-резерв, выплата/возврат ровно один раз, история операций существующего кошелька, expiry и OpenTimestamps workers, приватные квитанции. Создание обычного желания само по себе не создаёт business-funded оффер/награду: автоматический перенос приватного содержания или списание денег без согласия не добавлялись. Это граница текущей интеграции, а не утверждение о полностью автоматическом начислении за любое желание.

Проверки на итоговом коде:

- npm run test:need-rewards: PASS, 12 серверных unit tests.
- PG_POOL_SIZE=1 npm run test:need-rewards:production: PASS, 12 subtests + parent, 13 total, реальная production PostgreSQL, BEGIN/ROLLBACK; никаких DDL/commits тестовых данных.
- npm run test:reward-proofs: PASS, 3 tests.
- npm run test:ui: PASS, 37 primitives / 79 sources.
- ROLLAPP_SMOKE_PORT_OFFSET=950 npm run test:navigation: PASS, 46 сценариев, полная штатная матрица без viewport-фильтров.
- npm run build: PASS; существующее предупреждение большого bundle остаётся.
- npm audit --omit=dev: 0 vulnerabilities. npm audit: 6 dev findings (2 low / 4 moderate, 0 high/critical), без изменения зависимостей в этом уточнении.
- git diff --check: PASS.

Полный check:comprehensive заново не запускался: предыдущий полный прогон относится к кандидату с отдельным UI; здесь повторены проверки изменённой области, навигация, серверная механика и сборка. npm test на итоговом коде: PASS, 801 passed / 0 failed / 1 skipped, 802 total.

Production-схема не менялась, новая миграция не запускалась. Своя keepalive-служба оставлена готовой с настроенной production БД по TLS, API8106/Vite5206; останавливать её для этого прогона не потребовалось. Production rollout и новый Docker image не выполнялись. Прежний image не содержит эту последнюю UI-корректировку.
