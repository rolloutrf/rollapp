import { useEffect, useId, useRef } from "react";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Plus, ImageIcon, Columns2, Palette, Copy, Trash2, Code2, Minus, Table2, ChevronRight, Heading1, Heading2, Heading3, Heading4, List, ListOrdered, ListTodo, Pilcrow, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const icons = { image: ImageIcon, duplicate: Copy, delete: Trash2, paragraph: Pilcrow, heading1: Heading1, heading2: Heading2, heading3: Heading3, heading4: Heading4, bulletList: List, orderedList: ListOrdered, taskList: ListTodo, details: ChevronRight, blockquote: Quote, codeBlock: Code2, horizontalRule: Minus, table: Table2, columns: Columns2 };

function Preview({ item }) {
  const text = "Новая мысль";
  if (item.kind === "action" || item.kind === "color" || item.kind === "media") return <p>{item.description}</p>;
  if (item.id.startsWith("heading")) {
    const Heading = `h${item.id.slice(-1)}`;
    return <Heading>{text}</Heading>;
  }
  if (item.id === "bulletList") return <ul><li>{text}</li><li>Ещё одна мысль</li></ul>;
  if (item.id === "orderedList") return <ol><li>{text}</li><li>Следующий шаг</li></ol>;
  if (item.id === "taskList") return <p>☐ {text}<br />☑ Готово</p>;
  if (item.id === "details") return <p>▸ {text}</p>;
  if (item.id === "blockquote") return <blockquote>{text}</blockquote>;
  if (item.id === "codeBlock") return <pre><code>const idea = 1;</code></pre>;
  if (item.id === "horizontalRule") return <><p>{text}</p><hr /><p>Следующая часть документа</p></>;
  if (item.id === "table") return <table><thead><tr><th>Мысль</th><th>Статус</th></tr></thead><tbody><tr><td>Новая идея</td><td>В работе</td></tr></tbody></table>;
  return <p>Пространство для ваших идей, заметок и планов.</p>;
}

export function InlineBlockPicker({ items, index, query = "", searchable = false, label = "Типы блоков", onQuery, onIndex, onChoose, onClose }) {
  const list = useRef(null);
  const input = useRef(null);
  const listId = useId();
  const item = items[index];
  useEffect(() => { if (searchable) input.current?.focus({ preventScroll: true }); }, [searchable]);
  useEffect(() => {
    const container = list.current, option = container?.querySelector('[aria-pressed="true"]');
    if (!option) return;
    // Scroll only the option list. scrollIntoView also scrolls the document
    // while a newly portalled popup is still being positioned.
    // Offsets use layout pixels, independent of the popup's opening scale.
    const top = option.offsetTop, bottom = top + option.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
  }, [index, items]);
  return <div className="inline-editor__picker" onKeyDown={event => {
    if (event.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (["ArrowUp", "ArrowDown"].includes(event.key) && items.length) {
      event.preventDefault();
      const next = (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      onIndex(next);
      if (event.target !== input.current) list.current?.querySelectorAll("button")[next]?.focus();
    }
    if (["Home", "End"].includes(event.key) && event.target !== input.current && items.length) {
      event.preventDefault(); const next = event.key === "Home" ? 0 : items.length - 1;
      onIndex(next); list.current?.querySelectorAll("button")[next]?.focus();
    }
    if (event.key === "Enter") { event.preventDefault(); if (item) onChoose(item); }
  }}>
    {searchable && <Input ref={input} type="search" className="inline-editor__block-search" aria-label="Поиск типа блока" aria-controls={listId} placeholder="Найти тип блока…" value={query} onChange={event => onQuery(event.target.value)} />}
    <div className="inline-editor__picker-body">
      <div ref={list} id={listId} className="inline-editor__block-list not-typeset" role="group" aria-label={label}>
        {items.map((entry, at) => {
          const Icon = entry.kind === "color" ? Palette : ({ up: ArrowUp, down: ArrowDown, indent: ArrowRight, outdent: ArrowLeft, before: Plus, after: Plus })[entry.id] || icons[entry.id];
          return <Button key={entry.id} variant={entry.id === "delete" ? "destructive" : at === index ? "secondary" : "ghost"} className="inline-editor__block-option" type="button" aria-pressed={at === index}
            onMouseDown={event => event.preventDefault()} onPointerMove={event => { if (event.movementX || event.movementY) onIndex(at); }} onFocus={() => onIndex(at)} onClick={() => onChoose(entry)}>
            <Icon aria-hidden="true" /><span>{entry.label}</span><kbd aria-hidden="true">{entry.shortcut}</kbd>
          </Button>;
        })}
        {!items.length && <p className="inline-editor__no-blocks" role="status">Ничего не найдено. Попробуйте другое название.</p>}
      </div>
      {item && <aside className="inline-editor__block-preview" aria-hidden="true">
        <div className="typeset typeset-rollapp typeset-document"><Preview item={item} /></div>
        <p className="rollapp-body">{item.description}</p>
      </aside>}
    </div>
  </div>;
}
