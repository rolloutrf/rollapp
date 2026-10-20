# Результат production release — 2026-10-20

В production опубликован **95223417bdd06683875ef7cf273ecab599270779**.
Main и production остаются на этом SHA. Этот post-deploy proof сохраняется
отдельной docs-only веткой, не является новым runtime release и не запускает CI
повторно. Чужие изменения сохранены; force push, schema/data cleanup не делались.

## Terminal проверки

- [Workflow39402041896](https://github.com/rolloutrf/rollapp/actions/runs/39402041896),
  job118558851080: completed/success **всех** шагов, включая fresh npm ci,
  обязательный Test/build, immutable image push, Deploy, exact health и
  Configure Telegram Mini App. Начало09:37:33Z, завершение11:22:13Z.
- Независимый `/api/healthz`: `ok:true`, `service:rollapp`, точный полный SHA952.
  Профиль`/koloskof`200; www/sslip301 к canonical health; legacy`/u/koloskof`
  и`/users/koloskof`301 к canonical profile.
- Clean frozen449:409 native editor PASS и полный comprehensive10/10 exit0,
  984 tracked inputs SHA256 drift0, clean после завершения. Это полный набор,
  не viewport-filtered diagnostics. Контакты, drawers и To Do включены.
- Fresh locked кандидат508 и финальные docs перед952: unit790 total/789 PASS/
  1SKIP/0FAIL, UI37 primitives/79 JSX и build exit0. Два изменённых harnesses
  styles10/four-document8 отдельно PASS/exit0 с новыми Vite caches.
- Src/shared/server/package/lock финального952 идентичны проверяемому449;
  startup verify guard и два harness waits проверены отдельно. Все58 build files
  Mac C/A побайтово совпали. Tooling-only installed shadcn4.22.0(C)/4.22.1(A)
  честно отделён от fresh locked install; imported Tailwind CSS идентичен.
  Это не утверждение побайтовой идентичности Mac и Linux сборок.

Полная цепочка команд/логов/ограничений — в
[preflight отчёте](notion-production-release-2026-10-20.md).

## Реальный опубликованный UI

Проверки выполнены в authenticated IAB на production, не на API-fixture:

- Life strategy: Geist18/28, отсутствие border/outline/shadow у редактора и
  root overflow при320/390/768/820/1024/1440/1920×844 и390×400.
- Native range: ровно одна contextual toolbar,8px от выделения, в viewport;
  collapsed caret убирает её. Авторский текст/стили/checkboxes не менялись.
- To Do: существующая карточка видео → «Готово·1» → ровно одна загруженная
  миниатюра48×48 в поле новой задачи, без horizontal overflow. После снимка
  убрана только несохранённая связь; пустой submit disabled, задачи не создавались.
  Снимок `/tmp/rollapp-production-9522341-related-preview-2026-10-20.png`.
- Опубликованный DOM загрузил `/assets/index-J0Ieo7W-.js`, не guessed Mac filename.
  Независимо подтверждены1517608bytes/text/javascript у actual module URL.
  Старый локальный filename возвращает SPA fallback и не доказывает asset defect.
- Shared browser viewport reset после editor/To Do; второй согласованный чат
  последовательно проверил public profile, Kanban и calendar на восьми размерах:
  no root overflow, short-screen scroll reachability, отмена меню и desktop
  Kanban handles48×48. Viewport reset; production reorder/save не выполнялись.

Playwright exact accessible-name lookup карточки не совпал с отображением AX;
сама карточка присутствовала и была выбрана через свежий native AX index.
Один stale index после фокуса поля заменён свежим; это не объявлено потерей данных.
Сетевые EOF/read errors монитора не считались падением workflow и не запускали
повторные VM/CI mutations. Watcher затем завершился exit0/exact health.

## Эксплуатация и границы доказательств

Production использует startup`verify`: read-only existing-schema validation,
без миграций/backfill/reservation cleanup. Предварительный real-validator PASS,
обычные последующие transactions остаются read-write. Rollback image сохранён;
manual VM restart/image cleanup не требовались и не выполнялись.

В конце actual dev owner — основной checkout952, managed PID23081, API23082,
frontend23174, keepalive label`rf.rollapp.development.bda38fd722c4`: всё ready.
Отсутствие PID-файла905f не принято за outage: live ports/cwd/parent проверены;
ничего не удалялось и не перезапускалось. Другой чат подтвердил, что также не
останавливал прежний dev10724. Причина смены owner здесь не диагностировалась.

Production planning2/2 — rollback-only, без сохранённых test fixtures/schema init.
To Do53 и Contacts8 prechecks PASS. Audit production0/dev7 high CLI chain;
несовместимые force/downgrades не применялись. Frontend-design сохранил
существующие Geist18/28,48px controls и обычный prose UI без редизайна.

**Полный паритет Notion не объявляется завершённым.** Rich captions/viewer и
прочие media, произвольные сложные композиции, реальный iOS/Telegram/IME остаются
открытыми в[R1–R10](notion-text-experience.md). Production review read-only не
заменяет actual-device IME и сохранённый production drag. Native drag/history/
clipboard поведение проверено полными изолированными матрицами.
