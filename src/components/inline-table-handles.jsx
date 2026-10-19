import { InlineTableGrowth } from "@/components/inline-table-growth";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ScreenPortal } from "@/components/ui/screen-portal";
import { TableMap } from "@tiptap/pm/tables";
import { Copy, GripVertical, GripHorizontal, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Plus, Trash2, Palette, Rows3, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlBar } from "@/components/control-bar";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { tablePosition, applyTableAction, headerEnabled } from "@/lib/inline-table-actions";
import { moveTableAxis, selectTableAxis, tableAxisBand } from "@/lib/inline-table-axis";
import { useInlineTableAxisDrag } from "@/hooks/use-inline-table-axis-drag";
import { useInlineMenuPortal } from "@/hooks/use-inline-menu-portal";
import { useVisualViewportBoundary } from "@/hooks/use-visual-viewport";

const sameRect = (a,b) => a === b || a && b && ["left","top","width","height"].every(key => a[key] === b[key]);
const clamp = (value,min,max) => Math.max(min, Math.min(max,value));
export function InlineTableHandles({ editor, suspended, onVisibilityChange, onCellColors }) {
  const [growthVisible,setGrowthVisible] = useState(false);
  const [dragging,setDragging] = useState(false);
  const [active,setActive] = useState(null), [geometry,setGeometry] = useState(null), [menu,setMenu] = useState(null);
  const [guide,setGuide] = useState(null), [notice,setNotice] = useState("");
  const menuRef = useRef(null), activeRef = useRef(null), controls = useRef(null), handingOff = useRef(false);
  menuRef.current = menu; activeRef.current = active;
  const append = useInlineMenuPortal(), boundary = useVisualViewportBoundary(Boolean(menu));
  const drag = useInlineTableAxisDrag(editor, rect => setGuide(previous => sameRect(previous,rect) ? previous : rect), message => { setNotice(message);setActive(null); },setDragging);
  const axisVisible = Boolean(active && geometry && !suspended), visible = axisVisible && !growthVisible;
  useLayoutEffect(() => { onVisibilityChange?.(axisVisible || growthVisible);return () => onVisibilityChange?.(false); },[axisVisible,growthVisible,onVisibilityChange]);
  useEffect(() => {
    let frame = 0, bindFrame = 0, dom = null;
    const desktop = window.matchMedia("(min-width: 1024px) and (hover: hover)");
    const measure = requested => {
      // Keep the capturing control mounted at its original clear location.
      // Scrolling its source cell must not remove the pointer's owner.
      if (drag.isActive()) return;
      const current = requested?.cell ? requested : activeRef.current;
      cancelAnimationFrame(frame);frame = requestAnimationFrame(() => {
        if (drag.isActive()) return;
        if (!current || !current.cell.isConnected || !desktop.matches || suspended) { setGeometry(null);return; }
        const cell = current.cell.getBoundingClientRect(), table = current.cell.closest("table").getBoundingClientRect(), wrapper = current.cell.closest(".tableWrapper").getBoundingClientRect();
        const viewport = window.visualViewport, viewportTop = viewport?.offsetTop || 0;
        const chrome = current.cell.ownerDocument.querySelector(".global-app-chrome");
        const top = Math.max(viewportTop + 8, (chrome?.getBoundingClientRect().bottom || 0) + 8);
        const bottom = viewportTop + (viewport?.height || innerHeight) - 8;
        if (bottom - top < 48) { setGeometry(null);return; }
        if (cell.bottom < top || cell.top > bottom || wrapper.right < 8 || wrapper.left > innerWidth - 8) { setGeometry(null);return; }
        const rowTop = clamp(cell.top + (cell.height - 48) / 2,top,bottom - 48), gutter = clamp(wrapper.left - 48,8,innerWidth - 56);
        const outside = clamp(editor.view.dom.getBoundingClientRect().left - 48,8,innerWidth - 56);
        const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const ink = [...editor.view.dom.querySelectorAll("p,h1,h2,h3,h4,h5,h6,summary,pre,img")].flatMap(node => {
          if (node.matches("img")) return [node.getBoundingClientRect()];
          const range = document.createRange();range.selectNodeContents(node);
          return [...range.getClientRects()].filter(rect => rect.width && rect.height);
        });
        const box = point => ({ ...point,right:point.left+48,bottom:point.top+48 });
        const clear = (point,peer) => point && point.top >= top && point.top+48 <= bottom && !ink.some(rect=>overlaps(box(point),rect)) && (!peer || !overlaps(box(point),box(peer)));
        const row = [{left:gutter,top:rowTop},{left:outside,top:rowTop}].find(point=>clear(point)) || null;
        const above = { left:clamp(cell.left + (cell.width - 48) / 2, Math.max(8,wrapper.left), Math.min(innerWidth - 56,wrapper.right - 48)), top:table.top - 48 };
        const column = current.row === 0 ? [above,...[gutter,outside].flatMap(left=>[rowTop+56,rowTop-56].map(top=>({left,top})))].find(point=>clear(point,row)) || null : null;
        setGeometry(row || column ? { row,column } : null);
      });
    };
    const pointer = event => {
      if (drag.isActive()) return;
      if (editor.isDestroyed || !editor.isInitialized) return;
      if (menuRef.current || controls.current?.contains(event.target) || event.target.closest?.('[data-inline-axis-guide]')) return;
      const cell = event.target.closest?.("td,th");
      if (!desktop.matches || !cell || !editor.view.dom.contains(cell) || suspended) { setActive(null);return; }
      const old = activeRef.current;
      if (old?.cell === cell && old.doc === editor.state.doc) { measure();return; }
      const cellPosition = editor.view.posAtDOM(cell,0) - 1, position = tablePosition(editor.state.doc.resolve(cellPosition + 1));
      if (position == null) { setActive(null);return; }
      const rect = TableMap.get(editor.state.doc.nodeAt(position)).findCell(cellPosition - position - 1);
      const next = { cell,position,row:rect.top,column:rect.left,doc:editor.state.doc };
      setActive(next);measure(next);
    };
    const key = event => { if (!menuRef.current && !["Shift","Alt","Meta","Control"].includes(event.key)) setActive(null); };
    const change = ({transaction}) => { if (transaction.docChanged) { setMenu(null);setActive(null); } };
    document.addEventListener("pointermove",pointer);
    const bind = () => {
      if (editor.isDestroyed) return;
      if (!editor.isInitialized) { bindFrame = requestAnimationFrame(bind);return; }
      dom = editor.view.dom;dom.addEventListener("keydown",key);
    };
    bindFrame = requestAnimationFrame(bind);
    window.addEventListener("scroll",measure,true);window.addEventListener("resize",measure);window.visualViewport?.addEventListener("resize",measure);window.visualViewport?.addEventListener("scroll",measure);
    editor.on("transaction",change);desktop.addEventListener("change",measure);measure();
    return () => { cancelAnimationFrame(frame);cancelAnimationFrame(bindFrame);document.removeEventListener("pointermove",pointer);dom?.removeEventListener("keydown",key);window.removeEventListener("scroll",measure,true);window.removeEventListener("resize",measure);window.visualViewport?.removeEventListener("resize",measure);window.visualViewport?.removeEventListener("scroll",measure);editor.off("transaction",change);desktop.removeEventListener("change",measure); };
  },[editor,suspended]);
  useEffect(() => { if (suspended) { setMenu(null);setActive(null); } },[suspended]);
  const open = (axis,event) => {
    const wasDrag = drag.consumeClick();
    if (wasDrag && event.detail !== 0 || !active || active.doc !== editor.state.doc || !editor.isEditable) return;
    const index = active[axis];
    if (!selectTableAxis(editor,active.position,axis,index)) return;
    const button = event.currentTarget;handingOff.current = false;
    setMenu({ ...active,axis,index,doc:editor.state.doc,anchor:{ contextElement:button,getBoundingClientRect:() => button.getBoundingClientRect() } });
  };
  const close = () => {
    setMenu(null);setActive(null);
    if (!handingOff.current && !editor.isDestroyed && editor.isEditable) editor.view.focus();
  };
  const validMenu = menu && editor.state.doc === menu.doc;
  const band = validMenu && tableAxisBand(editor.state.doc.nodeAt(menu.position),menu.axis,menu.index);
  const move = (direction,dryRun = false) => {
    if (!band) return false;
    return moveTableAxis(editor,menu.position,menu.axis,menu.index,direction < 0 ? band.start - 1 : band.end,dryRun);
  };
  const apply = action => {
    if (validMenu && selectTableAxis(editor,menu.position,menu.axis,menu.index)) applyTableAction(editor,menu.position,action);
    close();
  };
  const row = menu?.axis === "row", noun = row ? "строки" : "столбца";
  return <>
    <InlineTableGrowth editor={editor} suspended={suspended || Boolean(menu) || dragging} onVisibilityChange={setGrowthVisible}/>
    <ScreenPortal container={append()}><div ref={controls} data-inline-table-handles="">
      {visible && ["row","column"].map(axis => geometry[axis] && <ControlBar key={axis} className="inline-editor__table-axis-handle" style={geometry[axis]}>
        <Button type="button" variant="secondary" size="icon" data-control-icon data-table-axis={axis} aria-label={`Действия ${axis === "row" ? "строки" : "столбца"} ${active[axis] + 1}`} title="Потяните для перемещения. Нажмите для действий."
          onPointerDown={event => drag.start(event,{ position:active.position,axis,index:active[axis],doc:active.doc })} onClick={event => open(axis,event)}>
          {axis === "row" ? <GripVertical aria-hidden="true"/> : <GripHorizontal aria-hidden="true"/>}
        </Button>
      </ControlBar>)}
      {guide && <div data-inline-axis-guide="" className="inline-editor__table-axis-guide" style={guide}/>}
    </div></ScreenPortal>
    <span className="sr-only" role="status" aria-live="polite">{notice}</span>
    <Popover open={Boolean(menu)} onOpenChange={value => { if (!value) close(); }}>
      <PopoverContent anchor={menu?.anchor} sticky positionMethod="fixed" collisionBoundary={boundary} collisionPadding={16} collisionAvoidance={{side:"shift",align:"shift"}} side="bottom" align="start"
        className="inline-editor__block-menu rollapp-body" aria-label={`Действия ${noun}`} finalFocus={() => { if (!handingOff.current && !editor.isDestroyed && editor.isEditable) editor.view.focus();return false; }}>
        <Button variant="ghost" className="w-full justify-start" disabled={!validMenu} onClick={() => { selectTableAxis(editor,menu.position,menu.axis,menu.index);close(); }}>{row ? <Rows3 aria-hidden="true"/> : <Columns3 aria-hidden="true"/>}Выделить {row ? "строку" : "столбец"}</Button>
        <Button variant="ghost" className="w-full justify-start" disabled={!move(-1,true)} onClick={() => { move(-1);close(); }}>{row ? <ArrowUp aria-hidden="true"/> : <ArrowLeft aria-hidden="true"/>}Переместить {row ? "строку выше" : "столбец влево"}</Button>
        <Button variant="ghost" className="w-full justify-start" disabled={!move(1,true)} onClick={() => { move(1);close(); }}>{row ? <ArrowDown aria-hidden="true"/> : <ArrowRight aria-hidden="true"/>}Переместить {row ? "строку ниже" : "столбец вправо"}</Button>
        <Button variant="ghost" className="w-full justify-start" disabled={!validMenu} onClick={() => apply(row ? "rowAbove" : "columnLeft")}><Plus aria-hidden="true"/>Добавить {row ? "строку выше" : "столбец слева"}</Button>
        <Button variant="ghost" className="w-full justify-start" disabled={!validMenu} onClick={() => apply(row ? "rowBelow" : "columnRight")}><Plus aria-hidden="true"/>Добавить {row ? "строку ниже" : "столбец справа"}</Button>
        <Button variant="ghost" className="w-full justify-start" disabled={!validMenu || !applyTableAction(editor,menu.position,row ? "duplicateRow" : "duplicateColumn",true)} onClick={() => apply(row ? "duplicateRow" : "duplicateColumn")}><Copy aria-hidden="true"/>Дублировать {row ? "строку" : "столбец"}</Button>
        {menu?.index === 0 && <Button variant="ghost" className="w-full justify-start" aria-pressed={validMenu ? headerEnabled(editor.state,menu.position,menu.axis) : false} onClick={() => apply(row ? "headerRow" : "headerColumn")}>{row ? <Rows3 aria-hidden="true"/> : <Columns3 aria-hidden="true"/>}{row ? "Строка заголовков" : "Столбец заголовков"}</Button>}
        <Button variant="ghost" className="w-full justify-start" disabled={!validMenu} onClick={event => { if (selectTableAxis(editor,menu.position,menu.axis,menu.index)) { handingOff.current = true;onCellColors(menu.position,event); }close(); }}><Palette aria-hidden="true"/>Цвет ячеек</Button>
        <Button variant="destructive" className="w-full justify-start" disabled={!validMenu} onClick={() => apply(row ? "deleteRow" : "deleteColumn")}><Trash2 aria-hidden="true"/>Удалить {row ? "строку" : "столбец"}</Button>
      </PopoverContent>
    </Popover>
  </>;
}
