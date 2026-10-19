import { useEffect, useId, useRef, useState } from "react";
import { Code2, Palette, Strikethrough, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeHistory } from "@tiptap/pm/history";
import { inlineColors, setInlineStyle } from "@/lib/inline-text-style";
import { blockSelectionColor, setBlockColor } from "@/lib/inline-block-color";

export function InlineStyleButtons({ editor, onApply, onColors, desktop = false }) {
  const toggle = (name, command) => {
    editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; })[command]().run();
    editor.view.dispatch(closeHistory(editor.state.tr));
    onApply?.(name);
  };
  return <span className={desktop ? "inline-editor__desktop-format" : "inline-editor__style-buttons"} role="group" aria-label="Дополнительные стили текста">
    {[["Подчёркнутый", "underline", "toggleUnderline", Underline], ["Зачёркнутый", "strike", "toggleStrike", Strikethrough], ["Код в строке", "code", "toggleCode", Code2]].map(([label, mark, command, Icon]) => <Button key={mark} type="button" variant={editor.isActive(mark) ? "secondary" : "ghost"} size="icon" aria-label={label} aria-pressed={editor.isActive(mark)} title={label} onMouseDown={event => event.preventDefault()} onClick={() => toggle(mark, command)}><Icon aria-hidden="true" /></Button>)}
    <Button type="button" variant="ghost" size="icon" aria-label="Цвет текста и фона" title="Цвет текста и фона" onMouseDown={event => event.preventDefault()} onClick={onColors}><Palette aria-hidden="true" /></Button>
  </span>;
}

function selectionColor(editor, attribute) {
  const { selection } = editor.state;
  if (selection.empty) return editor.getAttributes("inlineStyle")[attribute] || null;
  let color, mixed = false, found = false;
  for (const { $from, $to } of selection.ranges) editor.state.doc.nodesBetween($from.pos, $to.pos, node => {
    if (!node.isText) return;
    const next = node.marks.find(mark => mark.type.name === "inlineStyle")?.attrs[attribute] || null;
    if (found && next !== color) mixed = true;
    color = next; found = true;
  });
  return mixed ? undefined : color ?? null;
}

function ColorChoices({ editor, attribute, label, onApply, selected, onChoose }) {
  const id = useId();
  const value = onChoose ? selected : selectionColor(editor, attribute);
  const [focus, setFocus] = useState(Math.max(0, inlineColors.findIndex(([color]) => color === value)));
  return <section className="inline-editor__color-section" aria-labelledby={id}>
    <span id={id} className="text-muted-foreground">{label}</span>
    <div className="inline-editor__colors" role="radiogroup" aria-labelledby={id} onKeyDown={event => {
      const keys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(" ").length;
      const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: -columns, ArrowDown: columns }[event.key];
      const next = event.key === "Home" ? 0 : event.key === "End" ? inlineColors.length - 1 : (focus + offset + inlineColors.length) % inlineColors.length;
      setFocus(next);
      event.currentTarget.querySelectorAll('[role="radio"]')[next]?.focus();
    }}>
      {inlineColors.map(([color, name], index) => <Button key={color || "default"} type="button" role="radio" aria-checked={value === color} aria-label={`${label}: ${name}`} title={name} tabIndex={focus === index ? 0 : -1} variant={value === color ? "secondary" : "ghost"} size="icon" onFocus={() => setFocus(index)} onMouseDown={event => event.preventDefault()} onClick={() => { const applied=onChoose?onChoose(color):setInlineStyle(editor, { [attribute]: color }); if(applied!==false)onApply(); }}>
        <span className="inline-editor__color-sample" data-inline-color={attribute === "color" ? color : undefined} data-inline-background={attribute === "background" ? color : undefined} aria-hidden="true">A</span>
      </Button>)}
    </div>
  </section>;
}

export function BlockColorPalette({ editor, target, doc, onApply, onClose }) {
  const root=useRef(null),value=blockSelectionColor(editor.state,target);
  useEffect(()=>{root.current?.querySelector('[tabindex="0"]')?.focus({preventScroll:true});},[]);
  const choose=color=>{if(editor.state.doc!==doc){onClose();return false;}return setBlockColor(editor,color,target);};
  const background=typeof value==="string"&&value.endsWith("_background");
  return <div ref={root} className="inline-editor__color-palette rollapp-body">
    <ColorChoices editor={editor} attribute="color" label={target.cells?"Цвет текста ячеек":"Цвет блока"} selected={value===undefined?undefined:background?null:value} onChoose={choose} onApply={onApply}/>
    <ColorChoices editor={editor} attribute="background" label={target.cells?"Фон ячеек":"Фон блока"} selected={value===undefined?undefined:background?value.slice(0,-11):null} onChoose={color=>choose(color?`${color}_background`:null)} onApply={onApply}/>
    <Button type="button" variant="ghost" onClick={()=>{if(choose(null))onApply();}}>Обычный цвет блока</Button>
    <Button type="button" variant="ghost" onClick={onClose}>Закрыть</Button>
  </div>;
}

export function InlineColorPalette({ editor, onApply, onReset, onClose }) {
  const root = useRef(null);
  useEffect(() => { root.current?.querySelector('[tabindex="0"]')?.focus({ preventScroll: true }); }, []);
  return <div ref={root} className="inline-editor__color-palette rollapp-body">
    <ColorChoices editor={editor} attribute="color" label="Цвет текста" onApply={onApply} />
    <ColorChoices editor={editor} attribute="background" label="Цвет фона" onApply={onApply} />
    <Button variant="ghost" type="button" onClick={onReset}>Сбросить стили</Button>
    <Button variant="ghost" type="button" onClick={onClose}>Закрыть</Button>
  </div>;
}
