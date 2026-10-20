# Следующие media-различия: 2026-10-19

Официальная [справка Notion](https://www.notion.com/help/images-files-and-media) описывает подпись как редактируемый и форматируемый текст под изображением, отдельно от alt text; выравнивание left/centre/right скрывается при заполненной ширине. Resize использует боковые ручки, но справка не задаёт точный minimum или фиксированную опору — их соответствие остаётся непроверенным.

Текущий Rollapp сохраняет alt/title/width/height и проверяет URL/file chooser, owned insertion и resize. В image schema нет rich-caption content или alignment; в интеграции нет file paste/drop и media viewer. Это открытые R8/R9; выпуск не объявляется идентичным Notion. Подпись должна разделять историю/выделение/очередь документа, а не быть независимым полем с отдельным save. Runtime не менялся. [Точная запись](notion-image-options-audit-2026-10-19.json).
