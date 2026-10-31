# Общий выпуск — 31 октября 2026

Выпуск подготовлен в отдельном managed worktree на очищенном origin/main
`5b7af1dabad32ec7b42286434cf05ce1596e96f6`. Исходные рабочие копии,
их staged/unstaged/untracked файлы и постоянные preview сохранены без изменений.
Старая история не объединялась и не публикуется; перенесены только изменения кода.

Из копии6a23 перенесены изменения панелей/прозрачного chrome, форм фото контакта,
интерфейса Values/Character, PDF upload «+», удаления лишних Add actions,
отображения календаря и Wishlist drag/drop. Сохранены более поздние исправления
main для порядка видимых групп, auto-scroll, деталей черты и настроек custom tests.
Каталоги сфер не восстановлены; Wishlist сохраняет свой каталог.

Из копииcf99 перенесены регистрация пяти категорий бизнеса, общие поля формы,
серверные ограничения категории при запросе/одобрении/чтении и schema verify.
Consent владельца, owner isolation и legacy uncategorized accounts сохранены.
Столбец users.business_category ранее добавлен отдельной разрешённой операцией;
при этом выпуске выполнен только READ ONLY existing-schema verify и подтверждено
его наличие. DDL, backfill, изменения разрешений/аккаунтов и тестовые записи не
выполнялись. Production template сохраняет pool2 и initialization=verify;
проверочный процесс использовал pool1 и прямой TLS к настроенной production БД.

Сборка Vite прошла. Проверки syntax/diff и private-data boundary прошли.
Проверка чистой истории выполняется обязательным pre-push guard, без обхода.
Unit/UI/browser/comprehensive наборы для объединённого дерева не запускались:
сохранён ранее прямо запрошенный пользователем выпуск без тестирования.
Предыдущий PASS comprehensive для5b7af1d не является проверкой этого нового кода.
Обновлены контрактные smoke-сценарии PDF upload и объединены drag/drop fixtures,
без удаления существующих viewport/native/cancel assertions.

Выполнены npm audit и npm audit --omit=dev. Применены доступные совместимые
исправления npm audit fix без --force. Production dependencies:0 уязвимостей;
dev chain:2low/4moderate/2high (shadcn/ts-morph и TON tooling с вложенным Zod3).
Несовместимые downgrade/forced overrides не выполнялись; shadcn остаётся devDependency.

Production до выпуска здоров на5b7af1d. VM identity/folder/runtime SA подтверждены
через Cloud API. SSH закрывается до key exchange; свежий df поэтому не подтверждён.
Serial output не содержит найденных ENOSPC/capacity errors. Ручные pull/restart,
очистка images/containers/volumes и изменения SSH/security не выполнялись.
Штатный сериализованный metadata rollout сохраняет здоровую версию при задержке.

Результат rollout, точный deployed SHA и affected read-only UI review будут
добавлены после публикации. Это не отчёт полного regression PASS.

Первый rollout71fb966/run41187263610 завершился SUCCESS и exact health.
Values, Character и Wishlist загрузились; в read-only review отчётов обнаружен
ReferenceError useId после удаления импорта при объединении PDF controls.
Импорт восстановлен: он нужен также существующему PDF content renderer.
Повторная сборка и static binding review React hooks в22 изменённых JS/JSX
источниках прошли. Публикуется отдельный исправляющий commit без отката данных.

Расширенный static binding review обнаружил также прежний отсутствующий toast
в StorePage success callback. Восстановлен существующий useToast context;
покупка/кошелёк/checkout не менялись и реальные операции не выполнялись.
