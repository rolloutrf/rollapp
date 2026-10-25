# Прозрачная шапка — 2026-10-23

Базовый SHA: 237386530fd11e359f6f997735537b85e6ccb419; dirty snapshot включает предыдущую локальную правку удаления обзора To Do. Она сохранена.

В AGENTS.md и docs/spacing-system.md закреплено требование пользователя: шапка приложения/публичного профиля всегда прозрачна, без заливки, градиента, blur, тени или подложки псевдоэлемента. Индивидуальные поверхности контролов сохраняются. В shared spacing явно заданы transparent/none для GlobalAppChrome; удалены заливки старых CSS profile-header, включая mobile override.

Проверки:

- npm run test:navigation — PASS, полная матрица 320–1920px, маршруты, меню, переходы, safe area и короткие окна; добавлена computed-проверка прозрачности, background-image, backdrop-filter и shadow.
- npm run test:controls — PASS, полная штатная матрица, включая screenshot pixels/DPR3, 48px controls и 20px icons.
- npm run test:ui — PASS, 37 primitives / 84 JSX.
- npm run build — PASS, предупреждение о размере chunks.
- Живой dev frontend с production API: публичная /koloskof, 320/390(short400)/768/820/1024/1440/1920, computed фон GlobalAppChrome прозрачен до/после прокрутки, gradient/blur отсутствуют. Без изменения данных. Первая диагностическая попытка использовала устаревший selector .profile-header и завершилась timeout; актуальная общая шапка .global-app-chrome прошла проверку.
- git diff --check — PASS.

Логи /tmp/rollapp-transparent-header-{navigation,controls,build}.log. Полный comprehensive и публикация в этой локальной задаче не выполнялись. Production остаётся на прежнем SHA. Keepalive production connection оставлен работающим.
