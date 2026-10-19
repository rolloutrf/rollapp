import { Copy, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Palette, Bold, Italic, Columns3, Rows3, Table2, Merge, Split, Eraser, Trash2, Plus } from "lucide-react";
import { CellSelection } from "@tiptap/pm/tables";
import { closeHistory } from "@tiptap/pm/history";
import { Button } from "@/components/ui/button";
import { applyTableAction, headerEnabled } from "@/lib/inline-table-actions";
import { InlineStyleButtons } from "@/components/inline-text-styles";
import { coloredBlockPositions } from "@/lib/inline-block-color";

const items = [
  ["selectRow", "Выделить строку", Rows3], ["selectColumn", "Выделить столбец", Columns3], ["selectTable", "Выделить все ячейки", Table2],
  ["rowAbove", "Добавить строку выше", Plus], ["rowBelow", "Добавить строку ниже", Plus],
  ["columnLeft", "Добавить столбец слева", Plus], ["columnRight", "Добавить столбец справа", Plus],
  ["rowUp", "Переместить строку выше", ArrowUp], ["rowDown", "Переместить строку ниже", ArrowDown],
  ["columnLeftward", "Переместить столбец влево", ArrowLeft], ["columnRightward", "Переместить столбец вправо", ArrowRight],
  ["duplicateRow", "Дублировать строку", Copy], ["duplicateColumn", "Дублировать столбец", Copy],
  ["headerRow", "Строка заголовков", Rows3], ["headerColumn", "Столбец заголовков", Columns3],
  ["merge", "Объединить ячейки", Merge], ["split", "Разделить ячейку", Split],
  ["clear", "Очистить ячейки", Eraser], ["deleteRow", "Удалить строку", Trash2], ["deleteColumn", "Удалить столбец", Trash2], ["deleteTable", "Удалить таблицу", Trash2],
];

export function InlineTableActions({ editor, position, onDone, onColors, onCellColors }) {
  return <div className="flex min-w-0 flex-col gap-2" role="group" aria-label="Действия таблицы">
    {editor.state.selection instanceof CellSelection && <div className="flex flex-wrap gap-2" role="group" aria-label="Оформление ячеек">
      {[["Жирный", "bold", "toggleBold", Bold], ["Курсив", "italic", "toggleItalic", Italic]].map(([label,mark,command,Icon]) => <Button key={mark} type="button" size="icon" variant={editor.isActive(mark) ? "secondary" : "ghost"} aria-label={label} aria-pressed={editor.isActive(mark)} onMouseDown={event => event.preventDefault()} onClick={() => {
        editor.view.dispatch(closeHistory(editor.state.tr)); editor.chain().focus()[command]().run(); editor.view.dispatch(closeHistory(editor.state.tr)); onDone();
      }}><Icon aria-hidden="true" /></Button>)}
      <InlineStyleButtons editor={editor} onApply={onDone} onColors={onColors} />
    </div>}
    <Button type="button" variant="ghost" className="w-full justify-start" disabled={!coloredBlockPositions(editor.state,{cells:true}).length} onClick={onCellColors}><Palette aria-hidden="true"/>Цвет ячеек</Button>
    {items.map(([action, label, Icon]) => <Button key={action} type="button" variant={action.startsWith("delete") || action === "clear" ? "destructive" : "ghost"} className="w-full justify-start"
      title={action === "merge" ? "Сохранится содержимое верхней левой ячейки. Отмена вернёт остальные ячейки." : undefined}
      aria-pressed={action.startsWith("header") ? headerEnabled(editor.state, position, action === "headerRow" ? "row" : "column") : undefined}
      disabled={!applyTableAction(editor, position, action, true)} onClick={() => { applyTableAction(editor, position, action); onDone(); }}><Icon aria-hidden="true" />{label}</Button>)}
  </div>;
}
