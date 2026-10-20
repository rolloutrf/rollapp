# Устранение загрузки CLI из CI — 2026-10-19

Подтверждённый CI failure39273880365 для76a9f46: Test/build завершился, но
трёх попыток curl по120s не хватило для CLI129216696bytes — получено3788462,
2997534 и4105948bytes. Шаг исчерпал6min. Это не основание рестартовать здоровую VM.
Лог `/tmp/rollapp-notion-resume-ci76-failure.log` сохранён вне репозитория.

## Изменение

Вместо бинарника используется [официальный Instance.Get с view=FULL](https://yandex.cloud/en/docs/compute/api-ref/Instance/get),
[UpdateMetadata с единственным upsert docker-compose](https://yandex.cloud/en/docs/compute/api-ref/Instance/updateMetadata)
и [проверка конкретной операции](https://yandex.cloud/en/docs/compute/api-ref/Operation/get).
Используется прежний OIDC/IAM token. Script проверяет VM/folder/runtime-SA,
RUNNING, metadata IAM endpoints, отсутствие conflicting declaration, immutable
image/version, exact Compose после операции и сохранность остальных metadata.
Нет delete/stop/restart, перенаправления bearer token, вывода Compose/error body
или повторной мутации после неизвестного сетевого исхода. Общий бюджет180s,
HTTP15s; шаг CI4min. Полный release gate, concurrency и public exact-SHA health
сохранены. Check-only выполняет один FULL GET без записи.

## Проверки

- Изолированная ветка `codex/deploy-metadata-rest`, commitceb0670, четыре файла.
  Unit726 total/725 PASS/1 SKIP (10 новых guards/workflow/template tests), UI37/74
  и build PASS; terminal exit0. Fake fetch используется только в чистых unit,
  никакая БД не подменяется.
- Через существующий yc login безопасно получен IAM token внутри процесса,
  без вывода/записи в файл. Check-only настоящей production VM прошёл official
  FULL REST GET: exact identity/настройки подтверждены, POST/restart не выполнялись.
  `/tmp/rollapp-notion-resume-deploy-read-only.log`, terminal0.
- Scoped delta перенесён в main через apply_patch, dirty planning/composer
  сохранены. Fresh main unit727 total/726 PASS/1 SKIP, UI37/75 и build PASS;
  `/tmp/rollapp-notion-resume-main-rest-{unit,ui,build}.log`.
- Эта же delta присутствует в frozen combined candidate379a35b. Его полный
  comprehensive ещё выполняется. Новая production mutation/rollout не проверены.

Production остаётся healthy7104575. Main HEADd116857/dirty, push этой правки
не выполнялся; уже идущий CI39307151212 использует старый workflow, не менялся
и не перезапускался. Новый путь не означает готовый deploy: нужны clean tested
commit, CI, exact expected health SHA и live UI. Dev keepalive91967 готов,
production данные и schema не изменялись.

## Продолжение 2026-10-20

CI39307151212 завершён: Test/build, образ, deploy и exact-SHA health PASS;
последующий Telegram configure FAILED на connect ETIMEDOUT IPv4 и ENETUNREACH
IPv6. Public health read-only подтвердил healthyd116857. Это не предыдущий
CLI-download failure и не основание повторять Telegram mutations вручную.

Review новой REST delta обнаружил её собственную оставшуюся CLI-зависимость:
Telegram configure использовал `YC_LOCKBOX_SOURCE=cli`. Добавлен явный `iam`
режим с существующим краткоживущим OIDC IAM token и официальным
[Lockbox Payload.Get](https://yandex.cloud/en/docs/lockbox/api-ref/Payload/get).
Только fixed HTTPS endpoint, redirect:error/8s, никакого вывода token/payload
или повторов. Неверные настройки, missing/empty/binary/duplicate keys fail closed.
Default VM metadata и явный локальный CLI режимы сохранены; новый режим не
делает fallback к VM metadata на GitHub runner.

Локальный commit74ab01d, пять paths поверх580533b: unit738 total/737 PASS/1 SKIP,
UI37/74/build PASS, terminal0. Пять чистых Lockbox tests плюс workflow assertion
на отсутствие CLI source; реальные секреты и настройки бота не менялись.
Scoped delta перенесена в dirty main с exact baseline check каждого файла:
unit732 total/731 PASS/1 SKIP, UI/build PASS, terminal gate проверяется отдельно.
Логи `/tmp/rollapp-notion-resume-lockbox-*` и `...-main-lockbox-*`.
Эта delta ещё не выпущена; новый combined comprehensive требуется после интеграции.
