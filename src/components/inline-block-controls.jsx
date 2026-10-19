import { changeBlockDepth } from "@/lib/inline-block-tree";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { isTextSelection } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { closeHistory } from "@tiptap/pm/history";
import { AllSelection, NodeSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { Palette, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineBlockPicker } from "@/components/inline-block-picker";
import { applyBlockCommand, filterSlashCommands } from "@/lib/inline-slash-commands";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useInlineMenuPortal } from "@/hooks/use-inline-menu-portal";
import { useInlineBlockDrag } from "@/hooks/use-inline-block-drag";
import { useVisualViewportBoundary } from "@/hooks/use-visual-viewport";
import { canMoveTextBlock, changeTextBlock, moveTextBlock, selectedBlockPosition, selectedBlockRange } from "@/lib/inline-blocks";
import { isBlockSelection } from "@/lib/inline-block-selection";
import { blockToggleModifier, toggleBlockSelection } from "@/lib/inline-block-selection-extension";
import { InlineTableActions } from "@/components/inline-table-actions";
import { coloredBlockPositions } from "@/lib/inline-block-color";

const menuGap = 8;
const menuInset = 16;
const selectionOptions = {
  placement: "top", strategy: "fixed", offset: menuGap,
  // Tiptap applies offset after flip/shift. Reserve it in collision checks so
  // the final menu still keeps its viewport gutter, including keyboard panning.
  flip: { padding: menuInset + menuGap },
  shift: ({ placement }) => ({
    crossAxis: true,
    padding: {
      left: menuInset, right: menuInset,
      top: menuInset + (placement.startsWith("top") ? menuGap : -menuGap),
      bottom: menuInset + (placement.startsWith("bottom") ? menuGap : -menuGap),
    },
  }),
  hide: true,
};
const dragPosition = { placement: "left", strategy: "absolute" };
const blockMenuCollision = { side: "shift", align: "shift" };
const nestedBlocks = {
  rules: [{ id: "structuralChildren", evaluate: ({ node }) => ["column", "tableRow", "tableCell", "tableHeader", "detailsSummary", "detailsContent", "questionSection"].includes(node.type.name) ? 1000 : 0 }],
};
const menuActions = [
  { id: "indent", kind: "action", label: "Вложить блок", description: "Сделать дочерним блоком предыдущего пункта.", aliases: "indent вложение отступ вправо", shortcut: "Tab" },
  { id: "outdent", kind: "action", label: "Поднять на уровень выше", description: "Вернуть блок на предыдущий уровень вложенности.", aliases: "outdent unindent развернуть вложенность отступ влево", shortcut: "Shift+Tab" },
  { id: "up", kind: "action", label: "Переместить вверх", aliases: "move up выше", shortcut: "" },
  { id: "down", kind: "action", label: "Переместить вниз", aliases: "move down ниже", shortcut: "" },
  { id: "before", kind: "action", label: "Добавить блок выше", aliases: "add above before вставить", shortcut: "" },
  { id: "after", kind: "action", label: "Добавить блок ниже", aliases: "add below after вставить", shortcut: "" },
];

export function InlineBlockControls({ editor, actionsRef, onCreateBlock, children, suspended = false }) {
  const hovered = useRef(null);
  const dragResult = useInlineBlockDrag(editor, hovered);
  const selectionMenu = useRef(null);
  const selectionKey = `inlineSelection${useId()}`;
  const appendSelectionMenu = useInlineMenuPortal();
  const selectionAnchor = useCallback(() => {
    const selection = editor.view.dom.ownerDocument.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!editor.view.dom.contains(range.commonAncestorContainer)) return null;
    const anchor = range.cloneRange();
    return {
      contextElement: editor.view.dom,
      getBoundingClientRect: () => anchor.getBoundingClientRect(),
      getClientRects: () => anchor.getClientRects(),
    };
  }, [editor]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!editor.isDestroyed && (editor.isFocused || selectionMenu.current?.contains(document.activeElement))) {
          editor.view.dispatch(editor.state.tr.setMeta(selectionKey, "updatePosition"));
        }
      });
    };
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, [editor, selectionKey]);
  const handingOff = useRef(false);
  const toolbarId = useId();
  const gripId = useId();
  const [triggerId, setTriggerId] = useState(toolbarId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const search = useRef(null);
  const menuDoc = useRef(null);
  useEffect(() => {
    if (!open) return;
    setQuery(""); setCommandIndex(0); menuDoc.current = editor.state.doc;
    const frame = requestAnimationFrame(() => search.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, editor]);
  const viewportBoundary = useVisualViewportBoundary(open);
  const [position, setPosition] = useState(null);
  const [notice, setNotice] = useState("");
  const [anchor, setAnchor] = useState(null);
  const closeMenu = () => {
    setOpen(false);
    // Restore native selection before another key can synchronise it back into
    // ProseMirror. commands.focus() defers this to the next animation frame.
    if (!handingOff.current && !editor.isDestroyed && editor.isEditable) editor.view.focus();
  };
  const [handleAllowed, setHandleAllowed] = useState(false);
  const visibility = useRef(false);
  visibility.current = suspended || open;
  const showSelection = useCallback(({ view, state, from, to }) => {
    if (visibility.current || !editor.isEditable || state.selection.empty || isBlockSelection(state.selection) || state.selection instanceof NodeSelection || state.selection instanceof CellSelection) return false;
    if (!state.doc.textBetween(from, to).length && (isTextSelection(state.selection) || state.selection instanceof AllSelection)) return false;
    return view.hasFocus() || Boolean(selectionMenu.current?.contains(document.activeElement));
  }, [editor]);
  useEffect(() => {
    if (editor.isDestroyed) return;
    const { state, view } = editor;
    const visible = showSelection({ view, state, from: state.selection.from, to: state.selection.to });
    view.dispatch(state.tr.setMeta(selectionKey, visible ? "show" : "hide"));
    if (visible) view.dispatch(editor.state.tr.setMeta(selectionKey, "updatePosition"));
  }, [editor, suspended, open, selectionKey, showSelection]);
  const cursorAnchor = useMemo(() => ({
    get contextElement() { return editor.isDestroyed ? undefined : editor.view.dom; },
    getBoundingClientRect() {
      const { left, top, right, bottom } = editor.view.coordsAtPos(editor.state.selection.from);
      return new DOMRect(left, top, right - left, bottom - top);
    },
  }), [editor]);
  const onNodeChange = useCallback(({ node, pos }) => {
    // The upstream handle remaps nested nodes to their outer container after
    // a document change. Protected document sections are never drag targets.
    const allowed = Boolean(node && node.type.spec.selectable !== false);
    hovered.current = allowed ? pos : null;
    setHandleAllowed(allowed);
  }, []);
  const gutterAnchor = useCallback(() => {
    const root = editor.view.dom, element = Number.isInteger(hovered.current) && editor.view.nodeDOM(hovered.current);
    if (!(element instanceof HTMLElement)) return null;
    return { contextElement: root, getBoundingClientRect: () => {
      const block = element.getBoundingClientRect();
      const selector = "p,h1,h2,h3,h4,h5,h6,summary,pre";
      const line = element.matches(selector) ? element : element.querySelector(selector);
      // Hover scoring can choose either a quote or its paragraph. They share
      // one external rail; the quote's prose inset must not move its controls.
      // Keep the actual hovered node as the command/drag target.
      const rail = element.closest("blockquote") || element;
      const left = element.closest('[data-type="column"]') ? root.getBoundingClientRect().left : rail.getBoundingClientRect().left;
      if (!line) return new DOMRect(left, block.top, 0, root.closest(".inline-editor")?.querySelector(".inline-editor__drag-handle")?.getBoundingClientRect().height || block.height);
      const box = line.getBoundingClientRect(), style = getComputedStyle(line);
      const top = box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
      return new DOMRect(left, top, 0, parseFloat(style.lineHeight));
    } };
  }, [editor]);
  const chooseCurrent = () => { handingOff.current = false; setAnchor(cursorAnchor); setTriggerId(toolbarId); setPosition(selectedBlockPosition(editor.state.selection)); };
  const chooseHovered = () => { handingOff.current = false; setAnchor(null); setTriggerId(gripId); setPosition(hovered.current ?? selectedBlockPosition(editor.state.selection)); };
  useEffect(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", open));
  }, [editor, open]);
  useEffect(() => {
    // Run through ProseMirror's handleKeyDown, after it synchronizes native selection.
    actionsRef.current = event => {
      if (!(event.metaKey || event.ctrlKey) || event.isComposing || editor.view.composing) return false;
      if ((event.key === "/" || event.code === "Slash") && !event.shiftKey) {
        event.preventDefault(); chooseCurrent(); setOpen(true);
        return true;
      }
      if (event.shiftKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? -1 : 1;
        if (moveTextBlock(editor, selectedBlockPosition(editor.state.selection), direction)) setNotice(direction < 0 ? "Блок перемещён вверх" : "Блок перемещён вниз");
        return true;
      }
      return false;
    };
    return () => { actionsRef.current = null; };
  }, [editor, cursorAnchor, actionsRef]);
  const block = selectedBlockRange(editor.state.doc, position, editor.state.selection);
  const multiple = block?.count > 1;
  const colorAllowed = Boolean(coloredBlockPositions(editor.state, { position }).length);
  const depthTransactions = useMemo(() => open && block ? {
    indent: changeBlockDepth(editor.state, false, { position }),
    outdent: changeBlockDepth(editor.state, true, { position }),
  } : {}, [editor.state, position, open]);
  const actionAllowed = id => Boolean(block && (["indent", "outdent"].includes(id) ? depthTransactions[id] : (["up", "down"].includes(id) ? canMoveTextBlock(editor.state.doc, position, editor.state.selection, id === "up" ? -1 : 1) : true)));
  const words = query.trim().toLocaleLowerCase().split(/\s+/);
  const commandItems = [...filterSlashCommands(query).filter(item => item.kind === "action" ? actionAllowed(item.id) : item.kind !== "color" || colorAllowed), ...menuActions.filter(item => actionAllowed(item.id) && words.every(word => `${item.label} ${item.aliases}`.toLocaleLowerCase().includes(word)))];
  const perform = action => {
    if (!editor.isEditable || editor.state.doc !== menuDoc.current) { setOpen(false); return; }
    if (action === "indent" || action === "outdent") {
      const transaction = depthTransactions[action];
      if (transaction) {
        editor.view.dispatch(closeHistory(transaction).scrollIntoView());
        editor.view.dispatch(closeHistory(editor.state.tr));
        setNotice(action === "indent" ? "Блок вложен" : "Блок поднят на уровень выше");
      }
    } else if (action === "up" || action === "down") {
      if (moveTextBlock(editor, position, action === "up" ? -1 : 1)) setNotice(action === "up" ? "Блок перемещён вверх" : "Блок перемещён вниз");
    } else if (action === "before" || action === "after") {
      handingOff.current = true;
      onCreateBlock(position, action);
    } else changeTextBlock(editor, position, action);
    closeMenu();
  };
  const chooseCommand = item => {
    if (menuActions.some(action => action.id === item.id)) perform(item.id);
    else {
      if (item.id === "image") handingOff.current = true;
      const applied = applyBlockCommand(editor, item, { doc: menuDoc.current, position });
      if (item.id === "image" && !applied) handingOff.current = false;
      closeMenu();
    }
  };
  return <Popover open={open} onOpenChange={next => { if (next) setOpen(true); else closeMenu(); }} triggerId={triggerId}>
    <BubbleMenu ref={selectionMenu} editor={editor} shouldShow={showSelection} pluginKey={selectionKey} appendTo={appendSelectionMenu} getReferencedVirtualElement={selectionAnchor} updateDelay={0} resizeDelay={0} options={selectionOptions} className="inline-editor__selection not-typeset" role="toolbar" aria-label="Форматирование выделенного текста">
      <PopoverTrigger id={toolbarId} render={<Button variant="ghost" size="icon" type="button" className="inline-editor__block-trigger" aria-label="Действия блока" title="Действия блока (Ctrl/Cmd+/)" onClick={chooseCurrent} />}><GripVertical aria-hidden="true" /></PopoverTrigger>
      {children}
    </BubbleMenu>
    <DragHandle editor={editor} nested={nestedBlocks} computePositionConfig={dragPosition} getReferencedVirtualElement={gutterAnchor} onNodeChange={onNodeChange} className={`inline-editor__drag-handle not-typeset${handleAllowed ? "" : " invisible"}`}
      onElementDragStart={() => { setOpen(false); editor.view.dispatch(closeHistory(editor.state.tr)); }}
      onElementDragEnd={() => { editor.view.dispatch(closeHistory(editor.state.tr)); setNotice(dragResult.current === "moved" ? "Блоки перемещены" : "Перемещение отменено"); }}>
      <Button variant="ghost" size="icon" type="button" aria-label="Добавить блок ниже" title="Добавить блок ниже. Alt/Option + нажатие — выше." onMouseDown={event => event.preventDefault()} onClick={event => onCreateBlock(hovered.current ?? selectedBlockPosition(editor.state.selection), event.altKey ? "before" : "after", event.currentTarget)}><Plus aria-hidden="true" /></Button>
      <PopoverTrigger id={gripId} render={<Button variant="ghost" size="icon" type="button" aria-label="Переместить блок или открыть меню" title="Потяните для перемещения. Нажмите для меню блока." onMouseDownCapture={event => { if (blockToggleModifier(event)) { event.preventDefault(); event.stopPropagation(); toggleBlockSelection(editor, hovered.current ?? selectedBlockPosition(editor.state.selection)); } }} onClickCapture={event => { if (blockToggleModifier(event)) { event.preventDefault(); event.stopPropagation(); } }} onClick={chooseHovered} />}><GripVertical aria-hidden="true" /></PopoverTrigger>
    </DragHandle>
    {open && !suspended && <PopoverContent sticky anchor={anchor} collisionBoundary={viewportBoundary} positionMethod="fixed" collisionAvoidance={blockMenuCollision} collisionPadding={menuInset} className="inline-editor__block-menu rollapp-body" aria-label="Действия текстового блока" align="start" side="bottom" finalFocus={() => { if (!visibility.current && !handingOff.current && !editor.isDestroyed && editor.isEditable) editor.view.focus(); return false; }}>
      <Input ref={search} type="search" className="inline-editor__block-search" aria-label="Поиск действий блока" placeholder="Действие, тип блока или цвет…" value={query} onChange={event => { setQuery(event.target.value); setCommandIndex(0); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          if (query.trim() && commandItems.length) setCommandIndex((commandIndex + (event.key === "ArrowDown" ? 1 : -1) + commandItems.length) % commandItems.length);
          else if (!query.trim()) {
            const buttons = [...event.currentTarget.parentElement.querySelectorAll('button:not(:disabled)')];
            (event.key === "ArrowDown" ? buttons[0] : buttons.at(-1))?.focus();
          }
        }
        if (event.key === "Enter") { event.preventDefault(); if (query.trim() && commandItems[commandIndex]) chooseCommand(commandItems[commandIndex]); }
      }} />
      {query.trim() ? <InlineBlockPicker items={commandItems} index={commandIndex} label="Найденные действия блока" onIndex={setCommandIndex} onChoose={chooseCommand} onClose={closeMenu} /> : <>
      {block?.count === 1 && block.content.firstChild.type.name === "table" && <InlineTableActions editor={editor} position={block.from} onDone={() => { setOpen(false); editor.commands.focus(); }} onCellColors={event=>{handingOff.current=true;onCreateBlock(block.from,null,event.currentTarget,"cellColors");setOpen(false);}} onColors={event => { handingOff.current = true; onCreateBlock(block.from, null, event.currentTarget, "colors"); setOpen(false); }} />}
      <Button variant="ghost" type="button" className="w-full justify-start" disabled={!colorAllowed} onClick={event=>{handingOff.current=true;onCreateBlock(block?.from??position,null,event.currentTarget,"blockColors");setOpen(false);}}><Palette aria-hidden="true"/>Цвет блока</Button>
      <Button variant="ghost" type="button" className="w-full justify-start" disabled={!actionAllowed("indent")} onClick={() => perform("indent")}><ArrowRight aria-hidden="true" />Вложить блок</Button>
      <Button variant="ghost" type="button" className="w-full justify-start" disabled={!actionAllowed("outdent")} onClick={() => perform("outdent")}><ArrowLeft aria-hidden="true" />Поднять на уровень выше</Button>
      <Button variant="ghost" type="button" className="w-full justify-start" disabled={!actionAllowed("up")} onClick={() => perform("up")}><ArrowUp aria-hidden="true" />Переместить вверх</Button>
      <Button variant="ghost" type="button" className="w-full justify-start" disabled={!actionAllowed("down")} onClick={() => perform("down")}><ArrowDown aria-hidden="true" />Переместить вниз</Button>
      <Button variant="ghost" type="button" className="w-full justify-start" disabled={!block} onClick={() => perform("before")}><Plus aria-hidden="true" />Добавить блок выше</Button>
      <Button variant="ghost" type="button" className="w-full justify-start" disabled={!block} onClick={() => perform("after")}><Plus aria-hidden="true" />Добавить блок ниже</Button>
      <Button variant="ghost" type="button" className="w-full justify-start" disabled={!block} onClick={() => perform("duplicate")}><Copy aria-hidden="true" />{multiple ? "Дублировать блоки" : "Дублировать блок"}</Button>
      <Button type="button" className="w-full justify-start" variant="destructive" disabled={!block} onClick={() => perform("delete")}><Trash2 aria-hidden="true" />{multiple ? "Удалить блоки" : "Удалить блок"}</Button>
      </>}
    </PopoverContent>}
    <span className="sr-only" role="status" aria-live="polite">{notice}</span>
  </Popover>;
}
