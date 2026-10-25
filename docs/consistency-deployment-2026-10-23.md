# Выпуск консистентности — 23 октября 2026

Развёртывание явно запрошено пользователем после завершённого UI-аудита.
Изменения схемы/данных не входят в выпуск. Compose сохраняет initialization=verify.

## Кандидат

В release commit включены только изменения данного аудита. Чужие presentation
правки performance-review.jsx, performance-review.test.js и отдельный performance
report сохранены незакоммиченными в исходной рабочей копии. В performance включена
только миграция двух toolbar actions на PageActionButton.

Предыдущий аудит проверял combined dirty snapshot с чужим presentation delta;
его source hash не выдаётся за hash этого scoped release. Штатный deploy workflow
должен заново выполнить полный check:release на чистом release commit. Локальный
test:text-edit не повторяется; обычный CI gate не ослабляется.

## Preflight

- Production health: ok=true, service=rollapp,
  version=237386530fd11e359f6f997735537b85e6ccb419.
- VM fv4chl6pdb4lnhsj7139, folder b1gebpfrhvkd43r38q98,
  runtime SA ajers2ngi708sf3i1t4g: RUNNING, identity проверена.
- Точный immutable образ текущего контейнера совпадает с health и Compose metadata.
- Нет конфликтующей docker-container-declaration; остальные metadata не меняются.
- Boot disk 19GB, свободно 6.1GB. Один работающий rollapp container.
- Rollback: immutable 237386530fd11e359f6f997735537b85e6ccb419;
  также сохранён предыдущий 5ab7f67af0f22bc0f1ac57473c4269cc66c62e1b.
- Настоящий existing-schema READ ONLY check: PASS на настроенной production БД,
  точные database/role проверены; migrate callback запрещён.
- Другой branch audit выполняется; его deploy job skipped. Он не отменялся.
  Штатная общая concurrency queue сериализует production workflow.

## Результат

Deployment завершён и проверен 24 октября 2026 в 00:27 Europe/Moscow
(23 октября 21:27 UTC). Выпущен чистый scoped commit
`00e71d7726c108bbd3f135ce4d54563117756f80`, source SHA-256
`0729f8efc11c8e408c8baaa759a3bc04c98b80e79591d9b1ce8e1be94ab79a86` (761 файл).

[Workflow 40010699124](https://github.com/rolloutrf/rollapp/actions/runs/40010699124):
SUCCESS. Полный `check:release`, публикация immutable image, OIDC/IAM,
metadata update, exact health/canonical redirects и Telegram configuration — PASS.
Локально редакторный тест не повторялся; CI действительно выполнил штатный
полный release gate, без изменения workflow или исключения редактора.

Независимый public health: ok=true, service=rollapp, version точно совпадает с
полным release SHA. Новый контейнер использует тот же immutable tag.
Четыре canonical redirects — 301 с точным Location, публичный профиль — 200.

Живой production UI: 35 измерений, пять страниц (препараты, Wishlist, курсы,
performance, контакты) × 320/390/768/820/1024/1440/1920px. Короткий экран 820×400.
Все PageActionButton ≥48px, padding слева/справа 24px; все проверенные shared
list tiles 130×100px; root overflow отсутствует. Desktop Calendar/Popover и
mobile вложенная date page препарата открылись. Mobile Back вернул в родительскую
форму, затем на исходную страницу; формы отменены без сохранения. Скриншоты
препаратов на desktop и Wishlist на mobile просмотрены. Viewport override сброшен,
созданные для проверки вкладки закрыты. Прежняя вкладка, на которой за время CI
появилась пользовательская навигация To Do, не закрывалась.

COI выполнил штатное согласование без ручного restart VM и без удаления образов.
Во время замены контейнера один health request получил SSL_ERROR_SYSCALL;
следующие чтения и CI подтвердили новый здоровый SHA. Заявление о zero downtime
не делается. После нового образа свободно 4.9GB; перед будущим ручным restart/pull
сначала восстановить ≥5GB по runbook, сохранив current/rollback и container refs.
В рамках этого выпуска ручные restart/pull и чистка не выполнялись.

[Машиночитаемый результат](consistency-deployment-2026-10-24.results.json).
Production schema/data миграции не выполнялись. Существующий preview maintenance
Wishlist может запускаться при навигации; ручные authoring saves не выполнялись.
Физическое устройство/IME, Safari keyboard и внешние платежи не проверялись.

Dev keepalive API/frontend готовы и оставлены работать. Чужой performance delta
сохранён локально. Итоговый документ и JSON добавлены после выпуска как evidence;
они не являются изменением исходников выпущенного образа и не запускают второй rollout.
