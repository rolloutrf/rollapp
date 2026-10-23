import { captureInlineLinkIntent, mapInlineLinkIntent, commitInlineLink, safeInlineLink } from "@/lib/inline-link-intent";
import { hasEffectiveItalic, toggleEffectiveItalic } from "@/lib/inline-italic";
import { InlineImageResize } from "@/components/inline-image-resize";
import { InlineImageViewer } from "@/components/inline-image-viewer";
import { selectionHasImageCaption } from "@/lib/inline-image-caption";
import { InlineColumnResize } from "@/components/inline-column-resize";
import { InlineImagePicker } from "@/components/inline-image-picker";
import { InlineImageTransfer } from "@/components/inline-image-transfer";
import { InlineTableHandles } from "@/components/inline-table-handles";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { DOMParser as ProseMirrorDOMParser, Fragment, Slice } from "@tiptap/pm/model";
import { columnResizingPluginKey } from "@tiptap/pm/tables";
import { FloatingMenu } from "@tiptap/react/menus";
import { Bold, Italic, Link2, Pilcrow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { InlineBlockPicker } from "@/components/inline-block-picker";
import { blockTypes, filterBlockTypes, applyBlockType } from "@/lib/inline-block-types";
import { insertTextBlock, selectedBlockPosition } from "@/lib/inline-blocks";
import { InlineBlockControls } from "@/components/inline-block-controls";
import { cn } from "@/lib/utils";
import { useInlineCaretVisibility } from "@/hooks/use-inline-caret-visibility";
import { useInlineMenuPortal } from "@/hooks/use-inline-menu-portal";
import { inlineEditorExtensions } from "@/lib/inline-editor-extensions";
import { nextSlashSuggestion, applySlashCommand } from "@/lib/inline-slash-commands";
import { collapseInlineTextSelection, synchronizeInlineSelection } from "@/lib/inline-native-selection";
import { BlockColorPalette, InlineColorPalette, InlineStyleButtons } from "@/components/inline-text-styles";
import { useVisualViewportBoundary } from "@/hooks/use-visual-viewport";

const floatingOptions = {
  placement: "bottom-start", strategy: "fixed", offset: 8,
  // Upstream runs offset after collision middleware. Reserve its distance,
  // and allow vertical shifting when the caret is behind a panned keyboard.
  flip: { padding: 24 },
  shift: ({ placement }) => ({ crossAxis: true, padding: { left: 16, right: 16, top: placement.startsWith("top") ? 24 : 8, bottom: placement.startsWith("bottom") ? 24 : 8 } }),
};
const pickerCollision = { side: "shift", align: "shift" };
const safeLink = safeInlineLink;
const symbolHints = { "Жирный": "**текст** или __текст__", "Курсив": "*текст* или _текст_", "Ссылка": "[текст](https://…)" };

export default function InlineRichTextEditor({ value = "", onChange, onBlur, disabled = false, readOnly = false, label, className, placeholder, editorRef, contentAdapter }) {
  const externalValue = useRef(value);
  const [initialContent] = useState(() => contentAdapter ? contentAdapter.parse(value) : value);
  const serializedContent = current => contentAdapter ? contentAdapter.serialize(current.state.doc) : current.getMarkdown();
  const callbacks = useRef({ onChange, onBlur });
  callbacks.current = { onChange, onBlur };
  const [picker, setPicker] = useState(null);
  const [tableHandlesVisible,setTableHandlesVisible] = useState(false);
  const [imagePickerVisible, setImagePickerVisible] = useState(false);
  const [imageTransferVisible, setImageTransferVisible] = useState(false);
  const [imageResizing, setImageResizing] = useState(false);
  const [imageViewing, setImageViewing] = useState(false);
  const pickerChosen = useRef(false);
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  const slashMenu = useRef(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const linkInput = useRef(null);
  const linkForm = useRef(null);
  const linkIntent = useRef(null);
  const linkOpenRef = useRef(linkOpen);
  linkOpenRef.current = linkOpen;
  const showBlocks = useCallback(() => Boolean(menuRef.current), []);
  const showLink = useCallback(() => linkOpenRef.current, []);
  const [, redraw] = useState(0);
  const editable = !disabled && !readOnly && Boolean(onChange);
  const appendMenu = useInlineMenuPortal(editable);
  const updateMenu = next => { menuRef.current = next; setMenu(next); };
  const choose = (editor, item) => {
    if (!item) return;
    const current = menuRef.current;
    updateMenu(null);
    applySlashCommand(editor, current, item);
  };
  const openLink = current => {
    if (current.isDestroyed || !current.isEditable || current.view.composing) return;
    const intent = captureInlineLinkIntent(current.state);
    if (!intent) return;
    linkIntent.current = intent;
    updateMenu(null); setLink(current.getAttributes("link").href || ""); setLinkError(""); setLinkOpen(true);
  };
  const instance = useRef(null);
  const blockActions = useRef(null);
  const extensions = useMemo(() => [...inlineEditorExtensions(placeholder, contentAdapter?.documentExtension), ...(contentAdapter?.extensions || [])], [placeholder, contentAdapter]);
  const viewportBoundary = useVisualViewportBoundary(Boolean(picker));
  const editorProps = useMemo(() => ({
      attributes: { class: "inline-editor__content typeset typeset-rollapp typeset-document", role: "textbox", "aria-label": label, "aria-multiline": "true", spellcheck: "true" },
      clipboardParser: { parseSlice(dom,options={}) {
        const internal='[data-pm-slice], [data-block-color], [data-inline-color], [data-inline-background], [data-inline-rich]';
        const preserve=dom.matches?.(internal)||dom.querySelector(internal);
        return ProseMirrorDOMParser.fromSchema(instance.current.schema).parseSlice(dom,{...options,preserveWhitespace:preserve?"full":options.preserveWhitespace});
      } },
      handleDOMEvents: {
        copy(view) { synchronizeInlineSelection(view); return false; },
        cut(view) {
          synchronizeInlineSelection(view);
          if (view.editable && !view.state.selection.empty) view.dispatch(closeHistory(view.state.tr));
          return false;
        },
        keydown(view, event) {
          // Capture the browser range before ProseMirror flushes DOM mutations;
          // waiting for handleKeyDown can restore the preceding range first.
          if (view.editable && !event.isComposing) synchronizeInlineSelection(view);
          // The drag plugin hides its handle on typing. Bare modifiers must
          // leave it reachable for Alt/Option-click insertion above a block.
          return ["Alt", "Shift", "Control", "Meta"].includes(event.key);
        },
        compositionend() {
          const editor = instance.current;
          requestAnimationFrame(() => { if (editor && !editor.isDestroyed) callbacks.current.onChange?.(serializedContent(editor)); });
          return false;
        },
      },
      handlePaste(view, event, slice) {
        const editor = instance.current;
        const clipboard = event.clipboardData;
        if (!view.editable || !clipboard) return false;
        synchronizeInlineSelection(view);
        if (clipboard.getData("text/plain") || clipboard.getData("text/html") || slice?.size) view.dispatch(closeHistory(view.state.tr));
        if (contentAdapter?.handlePaste?.(editor, view, event, slice)) return true;
        const text = clipboard.getData("text/plain");
        const selection = view.state.selection;
        if (selection instanceof TextSelection && selection.$from.sameParent(selection.$to) && editor.isActive("code") && !editor.isActive("codeBlock")) {
          if (!text) return false;
          event.preventDefault();
          // This is a literal insertion. A uiEvent=paste transaction would
          // run Tiptap's Markdown paste rules again, including inside code.
          view.dispatch(closeHistory(view.state.tr).insertText(text.replace(/\r\n?/g, "\n")).setMeta("paste", true).scrollIntoView());
          view.dispatch(closeHistory(view.state.tr));
          return true;
        }
        if (clipboard.getData("text/html") || editor.isActive("codeBlock")) return false;
        if (!/(^|\n)(#{1,6} |[-*+] |\d+\. |> |```)|\[[^\]]+\]\(https?:\/\//.test(text)) return false;
        event.preventDefault();
        if (selection.disjoint) {
          const content = editor.markdown.parse(text).content || [];
          const slice = new Slice(Fragment.fromArray(content.map(node => editor.schema.nodeFromJSON(node))), 0, 0);
          view.dispatch(closeHistory(view.state.tr).replaceSelection(slice).setMeta("paste", true).scrollIntoView());
          view.dispatch(closeHistory(view.state.tr));
          return true;
        }
        editor.commands.insertContent(text, { contentType: "markdown" });
        view.dispatch(closeHistory(view.state.tr));
        return true;
      },
      handleKeyDown(view, event) {
        const editor = instance.current;
        // Native keydown captures the browser range above, before DOM input.
        // ProseMirror also calls this hook with synthetic Enter/Backspace while
        // parsing mobile DOM mutations. Their native caret already belongs to
        // the new DOM, so mapping it into the old document moves the split.
        if (view.editable && blockActions.current?.(event)) { updateMenu(null); return true; }
        if (view.editable && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openLink(editor);
          return true;
        }
        const current = menuRef.current;
        if (current && !event.isComposing && !view.composing) {
          if (event.key === "Escape") { updateMenu(null); return true; }
          if (event.key === "Tab" && !event.shiftKey) {
            const button = slashMenu.current?.querySelector('[aria-pressed="true"]');
            if (button) { button.focus(); return true; }
            updateMenu(null); return false;
          }
          if (["ArrowDown", "ArrowUp"].includes(event.key) && current.items.length) {
            updateMenu({ ...current, index: (current.index + (event.key === "ArrowDown" ? 1 : -1) + current.items.length) % current.items.length }); return true;
          }
          if (event.key === "Enter") {
            if (current.items.length) { choose(editor, current.items[current.index]); return true; }
            updateMenu(null); return false;
          }
        }
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "s") {
          event.preventDefault(); callbacks.current.onBlur?.(); return true;
        }
        if (collapseInlineTextSelection(view, event)) { updateMenu(null); return true; }
        return false;
      },
      handleClick(view, pos, event) {
        const anchor = event.target.closest?.("a");
        if (anchor && safeLink(anchor.getAttribute("href") || "") && (!view.editable || event.metaKey || event.ctrlKey)) {
          window.open(anchor.href, "_blank", "noopener,noreferrer"); return true;
        }
        return false;
      },
  }), [label, contentAdapter]);
  const editor = useEditor({
    extensions, content: initialContent, contentType: contentAdapter ? "json" : "markdown", editable, editorProps,
    onUpdate({ editor: current }) {
      if (current.view.composing) return;
      callbacks.current.onChange?.(serializedContent(current));
    },
    onTransaction({ editor: current, transaction }) {
      if (linkIntent.current) {
        linkIntent.current = mapInlineLinkIntent(linkIntent.current, transaction);
        if (!linkIntent.current) setLinkOpen(false);
      }
      const next = nextSlashSuggestion(current.state, transaction, menuRef.current, { editable: current.isEditable, composing: current.view.composing });
      if (next !== menuRef.current) updateMenu(next);
    },
    onSelectionUpdate() {
      redraw(n => n + 1);
    },
    onBlur({ event }) { if (!slashMenu.current?.contains(event.relatedTarget)) updateMenu(null); callbacks.current.onBlur?.(); },
  });
  instance.current = editor;
  useInlineCaretVisibility(editor);
  const openPicker = (position, side, element, kind = "blocks") => {
    synchronizeInlineSelection(editor.view);
    pickerChosen.current = false;
    updateMenu(null); setLinkOpen(false);
    const rect = element?.getBoundingClientRect() || editor.view.nodeDOM(position)?.getBoundingClientRect();
    const anchor = rect ? { contextElement: editor.view.dom, getBoundingClientRect: () => rect } : undefined;
    setPicker({ position, side, anchor, kind, doc: editor.state.doc, query: "", items: blockTypes, index: 0 });
  };
  const finishStyle = () => { pickerChosen.current = true; setPicker(null); };
  const resetStyles = () => {
    editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).unsetAllMarks().run();
    editor.view.dispatch(closeHistory(editor.state.tr));
    finishStyle();
  };
  const openColors = event => openPicker(selectedBlockPosition(editor.state.selection), null, event.currentTarget, "colors");
  const closePicker = () => { setPicker(null); if (!editor.isDestroyed && editor.isEditable) editor.view.focus(); };
  const chooseInserted = item => {
    if (!item || !picker) return;
    pickerChosen.current = true;
    setPicker(null);
    if (editor.state.doc !== picker.doc) { editor.commands.focus(); return; }
    if (picker.side) insertTextBlock(editor, picker.position, picker.side, item.id);
    else {
      editor.view.dispatch(closeHistory(editor.state.tr));
      applyBlockType(editor, item.id);
      editor.view.dispatch(closeHistory(editor.state.tr));
    }
  };
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable, false);
    if (!editable) {
      linkIntent.current = null;
      updateMenu(null); setPicker(null); setLinkOpen(false);
      if (columnResizingPluginKey.getState(editor.state)) editor.view.dispatch(editor.state.tr.setMeta(columnResizingPluginKey, { setHandle: -1 }));
    }
  }, [editor, editable]);
  useEffect(() => {
    if (externalValue.current === value) return;
    externalValue.current = value;
    if (editor && JSON.stringify(value) !== JSON.stringify(serializedContent(editor))) editor.commands.setContent(contentAdapter ? contentAdapter.parse(value) : value, { contentType: contentAdapter ? "json" : "markdown", emitUpdate: false });
  }, [value, editor, contentAdapter]);
  useEffect(() => {
    if (editorRef) editorRef.current = editor;
    return () => { if (editorRef) editorRef.current = null; };
  }, [editor, editorRef]);
  useEffect(() => {
    if (!editor || !editable) return;
    editor.view.dispatch(editor.state.tr.setMeta("inlineBlocks", menu ? "show" : "hide"));
  }, [editor, editable, menu]);
  useEffect(() => {
    if (!editor || !editable) return;
    editor.view.dispatch(editor.state.tr.setMeta("inlineLink", linkOpen ? "show" : "hide"));
    if (linkOpen) linkInput.current?.focus();
    else linkIntent.current = null;
  }, [editor, editable, linkOpen]);
  useEffect(() => {
    if (!linkOpen) return;
    // Closing an outside action must never steal focus or apply pending text.
    const retire = event => {
      if (linkForm.current?.contains(event.target)) return;
      linkIntent.current = null; setLinkOpen(false);
    };
    const doc = editor.view.dom.ownerDocument;
    doc.addEventListener("pointerdown", retire, true);
    doc.addEventListener("focusin", retire);
    return () => { doc.removeEventListener("pointerdown", retire, true); doc.removeEventListener("focusin", retire); };
  }, [editor, linkOpen]);
  useEffect(() => {
    if (!editor || !editable) return;
    let frame = 0, settled = 0;
    const update = () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(settled);
      // The shared viewport owner first updates CSS height/safe-area metrics.
      // Reposition after that layout, including changes to a tall slash menu.
      frame = requestAnimationFrame(() => { settled = requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        if (menuRef.current) editor.view.dispatch(editor.state.tr.setMeta("inlineBlocks", "updatePosition"));
        if (linkOpenRef.current) editor.view.dispatch(editor.state.tr.setMeta("inlineLink", "updatePosition"));
      }); });
    };
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update);
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(settled); viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); };
  }, [editor, editable]);
  if (!editor) return null;
  const colorPicker=["colors","blockColors","cellColors"].includes(picker?.kind);
  const colorLabel=picker?.kind==="blockColors"?"Цвет блока":picker?.kind==="cellColors"?"Цвет ячеек":"Цвет текста и фона";
  const format = (name, Icon, run, active = false) => <Button key={name} variant={active ? "secondary" : "ghost"} size="icon" type="button" disabled={name === "Тип блока" && selectionHasImageCaption(editor.state)} aria-label={name} title={symbolHints[name] ? `${name}: ${symbolHints[name]}` : name} aria-pressed={active}
    onMouseDown={event => { synchronizeInlineSelection(editor.view); event.preventDefault(); }} onClick={event => { updateMenu(null); run(event); }}><Icon aria-hidden="true" /></Button>;
  return <section className={cn("inline-editor min-w-0", className)} data-editable-text={editable ? "" : undefined} data-table-handles={tableHandlesVisible ? "" : undefined} aria-label={label} onKeyDownCapture={event => {
    // Portal events retain this editor's React owner. Preserve ProseMirror's
    // own key handling and pending native-input flush inside the editable DOM.
    if (!editable || editor.isDestroyed || !editor.isInitialized || editor.view.dom.contains(event.target) || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "s") return;
    event.preventDefault(); event.stopPropagation(); callbacks.current.onBlur?.();
  }}>
    {editable && <InlineBlockControls editor={editor} suspended={Boolean(picker || menu || linkOpen || imagePickerVisible || imageTransferVisible || imageResizing || imageViewing)} actionsRef={blockActions} onCreateBlock={openPicker}>
      {format("Тип блока", Pilcrow, event => openPicker(selectedBlockPosition(editor.state.selection), null, event.currentTarget))}
      {format("Жирный", Bold, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {format("Курсив", Italic, () => toggleEffectiveItalic(editor), hasEffectiveItalic(editor.state))}
      <InlineStyleButtons editor={editor} desktop onColors={openColors} />
      {format("Ссылка", Link2, () => openLink(editor), editor.isActive("link"))}
    </InlineBlockControls>}
    {editable && <FloatingMenu ref={slashMenu} editor={editor} appendTo={appendMenu} resizeDelay={0} pluginKey="inlineBlocks" shouldShow={showBlocks} options={floatingOptions} className="inline-editor__menu not-typeset" role="group" aria-label="Команды блока">
      <InlineBlockPicker label="Доступные команды" items={menu?.items || []} index={menu?.index || 0} onIndex={index => { if (menuRef.current) updateMenu({ ...menuRef.current, index }); }} onChoose={item => choose(editor, item)} onClose={() => { updateMenu(null); editor.commands.focus(); }} />
    </FloatingMenu>}
    {editable && picker && <Popover open onOpenChange={open => { if (!open) closePicker(); }}>
      <PopoverContent sticky anchor={picker.anchor} collisionBoundary={viewportBoundary} collisionAvoidance={pickerCollision} collisionPadding={16} positionMethod="fixed" className={colorPicker ? "inline-editor__color-menu" : "inline-editor__create-menu"} aria-label={colorPicker ? colorLabel : picker.side === "before" ? "Создать блок выше" : picker.side === "after" ? "Создать блок ниже" : "Выбрать тип блока"} align="start" side="bottom" finalFocus={() => { if (!pickerChosen.current && !editor.isDestroyed && editor.isEditable) editor.view.focus(); return false; }}>
        {picker.kind === "blockColors" || picker.kind === "cellColors" ? <BlockColorPalette editor={editor} doc={picker.doc} target={picker.kind==="cellColors"?{cells:true}:{position:picker.position}} onApply={finishStyle} onClose={closePicker}/> : picker.kind === "colors" ? <InlineColorPalette editor={editor} onApply={finishStyle} onReset={resetStyles} onClose={closePicker} /> : <>
        {!picker.side && <div className="inline-editor__style-actions">
          <InlineStyleButtons editor={editor} onApply={finishStyle} onColors={openColors} />
        </div>}
        <InlineBlockPicker searchable items={picker.items} index={picker.index} query={picker.query}
          onQuery={query => setPicker(current => current && ({ ...current, query, items: filterBlockTypes(query), index: 0 }))}
          onIndex={index => setPicker(current => current && ({ ...current, index }))} onChoose={chooseInserted} onClose={closePicker} />
        </>}
      </PopoverContent>
    </Popover>}
    {editable && <FloatingMenu editor={editor} appendTo={appendMenu} resizeDelay={0} pluginKey="inlineLink" shouldShow={showLink} options={floatingOptions} className="inline-editor__link-panel not-typeset">
    {linkOpen && <form ref={linkForm} className="inline-editor__link" onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); setLinkOpen(false); editor.commands.focus(); } }} onSubmit={event => {
      event.preventDefault();
      const href = link.trim();
      if (href && !safeLink(href)) { setLinkError("Используйте https://, mailto: или относительную ссылку."); return; }
      const intent = linkIntent.current;
      linkIntent.current = null;
      commitInlineLink(editor, intent, href);
      setLinkOpen(false);
    }}><Input ref={linkInput} aria-label="Адрес ссылки" value={link} placeholder="https://…" onChange={event => setLink(event.target.value)} />
      <Button type="submit">Применить</Button><Button type="button" variant="ghost" onClick={() => { setLinkOpen(false); editor.commands.focus(); }}>Отмена</Button>
      {linkError && <span role="alert">{linkError}</span>}
    </form>}
    </FloatingMenu>}
    {editable && <InlineImagePicker editor={editor} onVisibilityChange={setImagePickerVisible} />}
    {editable && <InlineImageTransfer editor={editor} onVisibilityChange={setImageTransferVisible} />}
    {editable && <InlineImageResize editor={editor} suspended={Boolean(picker || menu || linkOpen || imagePickerVisible || imageTransferVisible || imageViewing)} onActiveChange={setImageResizing} />}
    {editable && <InlineTableHandles editor={editor} suspended={Boolean(picker || menu || linkOpen || imagePickerVisible || imageTransferVisible || imageResizing || imageViewing)} onVisibilityChange={setTableHandlesVisible} onCellColors={(position,event) => openPicker(position,null,event.currentTarget,"cellColors")} />}
    {editable && <InlineColumnResize editor={editor} suspended={Boolean(picker || menu || linkOpen || imagePickerVisible || imageTransferVisible || imageResizing || imageViewing)} />}
    <InlineImageViewer editor={editor} disabled={disabled} accessKey={editable} suspended={Boolean(picker || menu || linkOpen || imagePickerVisible || imageTransferVisible || imageResizing)} onVisibilityChange={setImageViewing} />
    <EditorContent editor={editor} />
  </section>;
}
