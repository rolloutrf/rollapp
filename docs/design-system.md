# Единая дизайн-система Rollapp

Новые экраны и изменения существующих используют одну систему: shadcn/ui
Base Nova на Base UI, Tailwind v4, Lucide, neutral CSS variables. Конфигурация
находится в `components.json`. Не смешивать Base UI и Radix, не создавать
параллельные реализации меню, модальных окон, полей и переключателей.

Официальные источники: [введение](https://ui.shadcn.com/docs),
[тема](https://ui.shadcn.com/docs/theming),
[Button](https://ui.shadcn.com/docs/components/base/button),
[Field](https://ui.shadcn.com/docs/components/base/field),
[Typeset](https://ui.shadcn.com/docs/typeset). При сверке исходников выбирать
реестр `https://ui.shadcn.com/r/styles/base-nova/<component>.json`.
Реестр содержит TypeScript и шаблоны нескольких наборов иконок; сравнение
учитывает JavaScript, настроенные aliases и выбранный Lucide.

## Владельцы повторяемых решений

| Решение | Менять централизованно | Контракт и обязательная проверка |
| --- | --- | --- |
| Цвета, шрифты, состояния, Large controls | `src/index.css` | `docs/typography.md`; `test:ui`, `test:controls` |
| Проза, заголовки, списки, цитаты, подписи | `src/typeset.css` | `docs/typography.md`; `test:text-edit` |
| Страница, поля, интервалы, навигация | `src/spacing.css`, `ControlBar` | `docs/spacing-system.md`; `test:controls`, `test:navigation` |
| Максимальные ширины | `src/containers.css` | `docs/container-system.md`; затронутые полные UI-матрицы |
| Текстовые действия панели страницы | `PageActionButton` | 48px минимум, капсула, padding-inline 24px; `test:action-rails` |
| Плитка списка/дня, подпись/счётчик/приватность | `ListTileContent`, `data-list-tile`, `src/index.css` | `docs/typography.md`, `docs/spacing-system.md`; `test:action-rails`, `test:todo` |
| Создание/настройки коллекций | `EducationSectionHeader`, `WishListNavigation`, общие action rails | `test:action-rails`, `test:wish-groups`, `test:ui` |
| Формы и их действия | `form-surface`, `MobileFormPages`, `MobileFormFooter` | `docs/mobile-overlays.md`; `test:form-pages`, `test:form-actions`, `test:drawers` |
| Действия страниц деталей | `ContentPageActions` | `test:details` |
| Safe area, клавиатура, порталы | `src/overlays.css`, `use-visual-viewport.js` | `docs/mobile-overlays.md`; формы и короткие экраны |
| Выбор даты во всех формах, включая день рождения и события | `PlanningDatePicker` | `test:dates`: min/max, disabled, очистка, вложенный черновик; затронутые календарь/To Do/формы |
| Дневная лента | `PlanningDayRibbon` | `test:todo`, `test:health` |
| Текстовое редактирование/чтение | `InlineDocument`, `EditableTextBlock`, `InlineTextField`, общий rich reader | `docs/inline-editing.md`; полный `test:text-edit` |
| Удаление в редакторах | `EditorDeleteAction`, shadcn `AlertDialog` | destructive, ожидание/ошибка/отмена; `test:form-actions` |
| Drag-and-drop | общие drag hooks/handles и продуктовые адаптеры | `docs/drag-and-drop.md`; полный `test:drag-drop` |

Одинаковая роль означает одинаковую геометрию, семантический вариант цвета,
состояния hover/focus/open/disabled/loading и поведение клавиатуры. Текстовые
действия в панелях страниц, включая настройки списка/группы/личностного теста и импорт, используют
`PageActionButton`; локальные height/padding/radius и параметр `shape` запрещены. Иконки и loading
spinner сохраняют те же 24px с каждой стороны; семантический variant владеет
цветами вместо локальных bg/text/hover копий.
Icon-only навигация и футеры используют `ControlBar` с `data-control-icon`.
Кнопки отправки формы, строки содержимого и календарные ячейки имеют свои роли.

## Граница shadcn и продукта

`src/components/ui` содержит исходники shadcn; продуктовые композиции находятся
уровнем выше. При добавлении компонента использовать установленный shadcn CLI
и конфигурацию проекта. Сохранять upstream варианты, размеры, focus/disabled
семантику и API; изменения продуктовой плотности и оформления выполнять общими
токенами и композициями. Для Button нет локального `shape`: капсула принадлежит
`PageActionButton`/`ControlBar`.

Продуктовый размер 48px, текст 18/28px и поля страницы — намеренная тема Rollapp,
а не исходные размеры Nova. Это централизованная настройка, разрешённая моделью
shadcn; она не должна выдаваться за неизменённый upstream вид.

Существующие интеграционные адаптации требуют отдельного внимания при обновлении:
Select поднимает positioner до z-index 100 для вложенных порталов и выравнивает
содержимое ItemText; ScrollArea использует shrinkable flex viewport для штор;
Combobox имеет русское доступное имя кнопки. `ScreenPortal` — собственный React
portal для документного потока мобильных страниц, у него нет аналога в реестре;
он не создаёт самостоятельный focus trap. Не копировать эти решения в страницы.
Типографические `cn-font-heading` заменены настроенным `font-heading`, служебные
registry menu/RTL placeholders разрешены конфигурацией neutral/LTR.

Не считать все различия дефектами: календарные ячейки, drag separators,
табличный resize, аватары и текстовая проза имеют разные семантические роли.
Настольные квадратные wish-detail actions — зафиксированное продуктовое
исключение, мобильная ветка сохраняет общий круг/капсулу. Новое исключение
требует описания роли, общего владельца и проверки, а не локального CSS-патча.

## Порядок изменения и проверки

1. Найти роль в таблице и все её потребители; исправлять общий владелец.
2. При повторении новой композиции вынести её до добавления второго варианта.
3. Обновить контракт, `AGENTS.md` и проверку одновременно с реализацией.
4. Проверить обычное, пустое, ошибочное, loading/disabled и read-only состояния;
   клавиатуру, открытие/отмену, save/retry и восстановление владельца фокуса.
5. Выполнить `npm run check:comprehensive` без viewport/case фильтров и оба
   `npm audit`. Полная процедура — `docs/verification.md`.
6. Проверить production API в read-only живой сессии; UI fixtures не заменяют
   эту проверку. Зафиксировать SHA, dirty state, результаты и ограничения.

`test:ui` сканирует все прикладные JSX, проверяет shadcn конфигурацию,
примитивы, единственные токены геометрии, запрещённые нативные контроли и
локальный `shape`. `test:action-rails` использует в том числе настоящие панели
контактов, Wishlist и образования: обе стороны padding, четыре радиуса,
геометрию, центрирование, края прокрутки и движение вместе со страницей.
`check:comprehensive` также включает `test:contact-notes`: форма встречи и
заметки контакта должны оставаться согласованными с остальными формами.

Шапка приложения и публичного профиля всегда прозрачная: без собственной фоновой подложки, градиента, blur/backdrop-filter, рамки и тени на всю панель. Это правило действует на всех экранах, размерах, темах и при прокрутке. Отдельные кнопки и селекторы сохраняют собственные непрозрачные поверхности.

Теги статуса медиа-карточек используют общий `CollectionSnippetBadge`: иконка не сжимается, текст переносится целиком в узкой карточке. Когда показана touch-ручка, тег расположен внизу изображения и не пересекается с её 48px областью; правило учитывает широкие сенсорные устройства, а не только ширину экрана. Без ручки прежнее верхнее положение сохраняется. `test:drag-drop` проверяет реальные WorkoutCard со всеми статусами, owner/read-only, мышь/touch и обе темы на полной матрице.

Каталог принадлежит только Wishlist (`/app/wishes/catalog` и его item routes/API).
В Идентичности нет ни каталога, ни магазина, ни пустых панелей бизнес-действий. В остальных сферах `SphereBusinessControls` содержит только магазин за роллы;
режима business/catalog нет ни в навигации, ни в React/API routes. Внутренние
справочники парсеров не являются пользовательской сущностью каталога.

Дневные плитки To Do/питания также используют ListTileContent. Их геометрия, подписи и приглушённый цвет числа (включая выбранное состояние) совпадают с главной Wishlist. Общий horizontal-tile-scroller владеет flex/gap8 и нулевыми вертикальными полями: одна строка стандартных плиток имеет высоту100px. Семантика выбора дня/центрирования и точка «сегодня» остаются в PlanningDayRibbon.
