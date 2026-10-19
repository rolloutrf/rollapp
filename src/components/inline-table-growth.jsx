import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { TableMap } from "@tiptap/pm/tables";
import { Plus, MoveDiagonal2 } from "lucide-react";
import { ScreenPortal } from "@/components/ui/screen-portal";
import { ControlBar } from "@/components/control-bar";
import { Button } from "@/components/ui/button";
import { useInlineMenuPortal } from "@/hooks/use-inline-menu-portal";
import { measureVisualViewport } from "@/hooks/use-visual-viewport";
import { tablePosition } from "@/lib/inline-table-actions";
import { resizeTable } from "@/lib/inline-table-size";

const intersects = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
export function InlineTableGrowth({ editor, suspended, onVisibilityChange }) {
  const [active,setActive] = useState(null), [point,setPoint] = useState(null), [preview,setPreview] = useState(null);
  const current = useRef(null), pending = useRef(null), dragging = useRef(null), controls = useRef(null), moved = useRef(false);
  const append = useInlineMenuPortal(), caption = useId();
  current.current = active; pending.current = preview;
  const valid = value => value && !editor.isDestroyed && editor.isEditable && !editor.view.composing && value.doc === editor.state.doc && value.table.isConnected;
  const clear = () => {
    const drag = dragging.current; dragging.current = null;
    if (drag) { cancelAnimationFrame(drag.frame); if (drag.button.hasPointerCapture(drag.id)) drag.button.releasePointerCapture(drag.id); }
    setPreview(null);
  };
  const commit = () => {
    const value = current.current, size = pending.current;
    clear();setActive(null);
    if (valid(value) && size && resizeTable(editor,value.position,size.height,size.width)) editor.view.focus();
  };
  useLayoutEffect(() => { onVisibilityChange(Boolean(active && point && !suspended));return () => onVisibilityChange(false); },[active,point,suspended,onVisibilityChange]);
  useEffect(() => {
    let frame = 0;
    const desktop = window.matchMedia("(min-width: 1024px) and (hover: hover)");
    const measure = () => {
      cancelAnimationFrame(frame);frame = requestAnimationFrame(() => {
        const value = current.current;
        if (!valid(value) || suspended || !desktop.matches) { setPoint(null);return; }
        const box = value.table.getBoundingClientRect(), wrapper = value.wrapper.getBoundingClientRect(), viewport = measureVisualViewport(window);
        const top = Math.max(viewport.offsetTop,document.querySelector(".global-app-chrome")?.getBoundingClientRect().bottom || 0) + 8, bottom = viewport.offsetTop + viewport.height - 8;
        if (box.bottom < top || box.top > bottom || bottom - top < 48) { setPoint(null);return; }
        const x = value.mode === "row" ? wrapper.left - 56 : wrapper.right + 8;
        const y = value.mode === "column" ? (Math.max(box.top,top) + Math.min(box.bottom,bottom)) / 2 - 24 : box.bottom - 24;
        const rect = { left:x,top:Math.max(top,Math.min(bottom-48,y)),right:x+48,bottom:Math.max(top,Math.min(bottom-48,y))+48 };
        if (x < 8 || rect.right > innerWidth - 8) { setPoint(null);return; }
        // A narrow nested column may have prose in its gutter. Keep its menu
        // actions available instead of covering the neighbouring document.
        const covered = [...editor.view.dom.querySelectorAll("p,h1,h2,h3,h4,h5,h6,summary,pre,img")].some(node => {
          if (value.table.contains(node) || !intersects(rect,node.getBoundingClientRect())) return false;
          if (node.matches("img")) return true;
          const range = document.createRange();range.selectNodeContents(node);
          return [...range.getClientRects()].some(text => intersects(rect,text));
        });
        setPoint(covered ? null : { left:rect.left,top:rect.top });
      });
    };
    const pointer = event => {
      if (editor.isDestroyed || !editor.isInitialized || !editor.isEditable || editor.view.composing || !desktop.matches || suspended || dragging.current || pending.current || controls.current?.contains(event.target)) return;
      const old = current.current;
      let table = event.target.closest?.("table");
      if (!table || !editor.view.dom.contains(table)) {
        if (valid(old)) {
          const b = old.table.getBoundingClientRect(),w = old.wrapper.getBoundingClientRect();
          if (event.clientX >= w.left - 64 && event.clientX <= w.right + 64 && (old.mode === "column" ? event.clientY >= b.top && event.clientY <= b.bottom : Math.abs(event.clientY-b.bottom) <= 40)) return;
        }
        setActive(null);return;
      }
      const wrapper = table.closest(".tableWrapper"),b = table.getBoundingClientRect(),w = wrapper.getBoundingClientRect();
      const nearBottom = Math.abs(event.clientY-b.bottom) <= 20, nearRight = Math.abs(event.clientX-w.right) <= 20;
      const mode = nearBottom && nearRight ? "corner" : nearBottom ? "row" : nearRight ? "column" : null;
      if (!mode) { setActive(null);return; }
      if (old?.table === table && old.mode === mode && old.doc === editor.state.doc) return;
      const firstCell = table.querySelector("td,th");
      const position = firstCell && tablePosition(editor.state.doc.resolve(editor.view.posAtDOM(firstCell,0)));
      if (position == null) return;
      const map = TableMap.get(editor.state.doc.nodeAt(position));
      setActive({ table,wrapper,position,mode,height:map.height,width:map.width,doc:editor.state.doc });
    };
    const changed = ({transaction}) => { if (transaction.docChanged || !editor.isEditable) { clear();setActive(null); } };
    const cancel = () => { clear();setActive(null); };
    const key = event => { if (event.key === "Escape" && (dragging.current || pending.current)) { event.preventDefault();event.stopPropagation();cancel(); } };
    const hidden = () => { if (document.hidden) cancel(); };
    document.addEventListener("pointermove",pointer);document.addEventListener("keydown",key,true);document.addEventListener("pointercancel",cancel);document.addEventListener("visibilitychange",hidden);window.addEventListener("blur",cancel);
    window.addEventListener("scroll",measure,true);window.addEventListener("resize",measure);window.visualViewport?.addEventListener("resize",measure);window.visualViewport?.addEventListener("scroll",measure);editor.on("transaction",changed);measure();
    return () => { cancelAnimationFrame(frame);clear();document.removeEventListener("pointermove",pointer);document.removeEventListener("keydown",key,true);document.removeEventListener("pointercancel",cancel);document.removeEventListener("visibilitychange",hidden);window.removeEventListener("blur",cancel);window.removeEventListener("scroll",measure,true);window.removeEventListener("resize",measure);window.visualViewport?.removeEventListener("resize",measure);window.visualViewport?.removeEventListener("scroll",measure);editor.off("transaction",changed); };
  },[editor,suspended,active]);
  const updateDrag = () => {
    const drag = dragging.current,value = current.current;
    if (!drag || !valid(value)) { clear();return; }
    const viewport = measureVisualViewport(window),edge = viewport.offsetTop + viewport.height - 48;
    if (drag.y > edge) window.scrollBy({top:Math.min(16,(drag.y-edge)/3),behavior:"instant"});
    else if (drag.y < viewport.offsetTop + 48) window.scrollBy({top:-Math.min(16,(viewport.offsetTop+48-drag.y)/3),behavior:"instant"});
    const wrapper = value.wrapper.getBoundingClientRect();
    if (drag.x > wrapper.right - 32) value.wrapper.scrollLeft += 12;
    const height = Math.max(1,value.height + Math.round((drag.y-drag.startY+scrollY-drag.scrollY)/drag.rowStep));
    const width = Math.max(1,value.width + Math.round((drag.x-drag.startX+value.wrapper.scrollLeft-drag.scrollLeft)/drag.columnStep));
    if (height*width <= 1000000) setPreview({height,width});
    drag.frame = requestAnimationFrame(updateDrag);
  };
  const shrinking = preview && active && (preview.height < active.height || preview.width < active.width);
  const box = active?.table.getBoundingClientRect(), wrapper = active?.wrapper.getBoundingClientRect();
  return <ScreenPortal container={append()}><div ref={controls}>
    {active && point && !suspended && <ControlBar className="inline-editor__table-growth" style={point}>
      <Button type="button" data-control-icon data-table-growth={active.mode} size="icon" variant={shrinking ? "destructive" : "secondary"}
        aria-label={active.mode === "row" ? "Добавить строку" : active.mode === "column" ? "Добавить столбец" : "Изменить размер таблицы"}
        aria-describedby={preview ? caption : undefined} aria-pressed={active.mode === "corner" ? Boolean(preview) : undefined}
        title={active.mode === "corner" ? "Потяните для изменения сетки. Enter — выбрать размер стрелками, Escape — отменить." : undefined}
        onMouseDown={event => event.preventDefault()}
        onPointerDown={event => {
          if (event.button !== 0 || !valid(active)) return;
          moved.current = false;
          if (active.mode !== "corner") return;
          event.preventDefault();event.stopPropagation();
          const b = active.table.getBoundingClientRect(),button = event.currentTarget;button.setPointerCapture(event.pointerId);
          dragging.current = {id:event.pointerId,button,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,scrollY,scrollLeft:active.wrapper.scrollLeft,rowStep:Math.max(28,b.height/active.height),columnStep:Math.max(48,b.width/active.width),frame:0};
        }}
        onPointerMove={event => { const drag = dragging.current;if (!drag || drag.id !== event.pointerId) return;drag.x = event.clientX;drag.y = event.clientY;if (!moved.current && Math.hypot(drag.x-drag.startX,drag.y-drag.startY) >= 5) { moved.current = true;drag.frame = requestAnimationFrame(updateDrag); } }}
        onPointerUp={event => { if (dragging.current?.id === event.pointerId) { if (moved.current) commit();else clear(); } }}
        onLostPointerCapture={() => { if (dragging.current) clear(); }}
        onClick={event => {
          if (!valid(active) || moved.current && event.detail !== 0) { moved.current = false;return; }
          if (active.mode === "corner") { if (preview) commit();else setPreview({height:active.height,width:active.width}); }
          else { const value = active;setActive(null);if (resizeTable(editor,value.position,value.height+(value.mode === "row"?1:0),value.width+(value.mode === "column"?1:0),value.mode)) editor.view.focus(); }
        }}
        onKeyDown={event => {
          if (active.mode !== "corner") return;
          if (event.key === "Enter" && preview) { event.preventDefault();commit();return; }
          if (preview && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)) { event.preventDefault();setPreview({height:Math.max(1,preview.height+(event.key === "ArrowUp"?-1:event.key === "ArrowDown"?1:0)),width:Math.max(1,preview.width+(event.key === "ArrowLeft"?-1:event.key === "ArrowRight"?1:0))}); }
        }} onBlur={() => { if (!dragging.current) clear(); }}>
        {active.mode === "corner" ? <MoveDiagonal2 aria-hidden="true"/> : <Plus aria-hidden="true"/>}
      </Button>
      {preview && <span id={caption} role="status" className="inline-editor__table-size-caption text-xs" data-shrinking={shrinking || undefined}>{preview.height} × {preview.width}{shrinking ? " · удаление ячеек" : ""}</span>}
    </ControlBar>}
    {preview && box && wrapper && <>
      <div className="inline-editor__table-axis-guide" data-table-size-guide="row" data-shrinking={shrinking || undefined} style={{left:wrapper.left,top:box.top+box.height*preview.height/active.height,width:wrapper.width,height:2}}/>
      <div className="inline-editor__table-axis-guide" data-table-size-guide="column" data-shrinking={shrinking || undefined} style={{left:box.left+box.width*preview.width/active.width,top:box.top,width:2,height:box.height*preview.height/active.height}}/>
    </>}
  </div></ScreenPortal>;
}
