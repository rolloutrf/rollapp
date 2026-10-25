# Создание тестов через + и поле PDF — 2026-10-25

Начальная база315f3ebce4a626a3c61f891db2cb013805883a74. До задачи dirty только итоговые отчёты предыдущих двух выпусков; они сохранены и не включены в новые commits. После предварительных проверок интегрирован актуальный main58d71a1 (44 уже опубликованных commits других задач), чтобы не откатывать их при выпуске. Конфликты package/workflow/runbook разрешены с сохранением обоих изменений; новый UI diff относительно main ограничен выбранным разделом и его проверками. Пользовательские данные не импортировались и не изменялись.

Изменения:
- Создание только через обычную кнопку «Новый тест» с + после плиток в общем горизонтальном viewport. Кнопка вне tablist; сохраняются выбор/URL и native Tabs keyboard semantics. Плитки используют ListTileContent/detail и data-list-tile, rail использует общий horizontal-tile-scroller.
- Загрузка через видимое официальное Input type=file в Field с label/help выбранного теста. Multiple PDF, текущие лимиты8×12МБ, validation/reset/retry и захваченный section сохраняются. Поле остаётся видимым и отключённым при лимите; во время upload отключены поле и +.
- Три page actions «Добавить тест», «Загрузить», «Удалить все» и мёртвый bulk-delete handler убраны. Индивидуальное destructive удаление PDF, настройки/удаление custom-теста и бизнес-разделы сохранены. Read-only не показывает авторские +/upload.
- Shared ListTileContent получил необязательный detail; прежние count/privateList consumers не меняются. Типографика использует общие токены, upstream primitives не редактировались.

Предварительно на dirty snapshot315f3eb: unit832/831 PASS/1 skip/0 FAIL, UI/build, полные identity-reports (reader/charts/custom tests), action-rails и page-scrollers PASS. В разработке пойман overflow длинного нового upload label; исправлен min-width:0/wrap-anywhere без ослабления assertions. Отдельная новая девятиразмерная custom matrix прошла создание/error/retry/rename/cancel/mobile history, видимый field/отсутствие старых actions, cancel/invalid/failed upload/retry/pending ownership, multi PDF, individual delete/cancel, лимит8 и read-only; API запрещены, используется прежняя UI callback boundary без базы/сети. Screenshots390/1440 просмотрены.

После main merge: npm ci PASS, unit861/860 PASS/1 skip/0 FAIL, UI/build PASS; полные затронутые матрицы повторяются на объединённом SHA. Действует прежний запрос целевого выпуска без сложного аудита: manual verification=identity-reports выполняет unit/UI/controls/identity-reports/action-rails/page-scrollers/build; сохраняются default full release, прежние snippets/none choices, READ ONLY schema verify, OIDC/VM guards и exact-SHA health. Режим none в этой задаче не используется.

Зависимости до merge: оба npm audit0. После merge package-lock текущего main содержит2 high в dev-цепочке @ton/ton→zod, npm не предлагает compatible fix; runtime audit --omit=dev0. Advisory [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) проверен по первоисточнику: patched4.6.6, текущая dev-цепочка требует другой major. Incompatible force/override не применялись; зависимости приложения этой задачей не меняются.

Итоговый tested SHA/CI, existing-schema preflight и live review будут записаны после целевого выпуска. Полный comprehensive/physical touch/IME и реальная загрузка личных PDF в production не заявляются; live review будет без сохранений.
