# Настройки личностного теста по образцу Wishlist — 2026-10-25

Основа: 3d7e675eec1a811b184755513890139a8a8d0fd3 (включает production8559466). Начальная dirty state: только итоговые отчёты group-menu-control, identity-test-plus-upload и snippets; сохранены отдельно и не входят в этот commit.

Вместо двух действий редактирования/удаления — одна outline-кнопка PageActionButton «Настройки теста». Общая form-surface содержит название, отдельный destructive-раздел удаления с пояснением, подтверждение через AlertDialog и footer «Сохранить изменения». Сохранены общий ControlBar и native MobileFormPages, + создания, PDF-поле и индивидуальное удаление PDF. Встроенные Gallup/Hogan не получают удаления каталога.

Удаление принадлежит открытой форме и её test ID. Ошибка и отмена сохраняют черновик; pending delete блокирует input/submit/delete/close. После успеха native form history закрывается до смены URL/каталога и возврата Gallup. Повторное создание/редактирование сбрасывает только новый черновик. Реальная форма добавлена в полную form-actions matrix (48px, все четыре радиуса, цвет destructive, scrolling, VisualViewport, native form owner и Back).

Предварительно unit861 total/860PASS/1skip/0FAIL, test:ui PASS. Полная новая custom matrix:9 размеров320–1920, 768/820 и короткие390/1024×400; создание/error/retry/rename, nested delete confirmation, cancel с несохранённым названием, failure/retry/pending delete, возврат Gallup без formScreen, прежние PDF/upload/individual-delete/limit/read-only проверки. UI callback fixtures блокируют API, не подменяют production DB. Mobile/desktop screenshots просмотрены в /tmp.

Обычный targeted release identity-reports дополнен test:form-actions; default full release неизменён. Полный comprehensive/editor audit не запускается согласно запросу целевого выпуска без сложного аудита. CI выполняет чистый unit/UI/controls/identity-reports/form-actions/action-rails/page-scrollers/build без viewport/case фильтров. Отдельный локальный прогон identity-test в form-actions диагностический и дополняет прежний полный, не заменяет полный CI.

Production preflight: штатный loader проверил точные настроенные database/role, authorized TLS, existing-schema и reserved-name guard в READ ONLY с timeout и rollback, дополнительно LIMIT0 identity report tables. Migration callback запрещён. Лог /tmp/rollapp-test-settings-production-schema.log. Persistent dev60108 healthy и оставлен работать.

npm audit:2high только в унаследованной dev-цепочке @ton/ton→zod; compatible fix отсутствует, force/major override не применён. npm audit --omit=dev:0. Dependency versions/lock не изменяются.

Итоговый SHA, чистые CI результаты, exact-SHA production health и read-only live review будут добавлены после выпуска. Реальные production Save/Delete/PDF upload и физические устройства/IME не проверяются и не заявляются.
