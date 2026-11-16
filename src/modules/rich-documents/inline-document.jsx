import { useRef } from "react";
import { EditableTextBlock } from "@/modules/rich-documents/editable-text-block.jsx";
import { useInlineAutosave } from "@/modules/rich-documents/use-inline-autosave.js";
import { useSphereSharing } from "@/modules/access/sphere-sharing.jsx";
import { Button } from "@/components/ui/button";
import { AddFab } from "@/components/add-fab";

export function InlineSaveStatus({ autosave }) {
  return <div className="inline-save-status not-typeset" role="status" aria-live="polite" data-save-status={autosave.status}>
    <span>{autosave.status === "error" ? autosave.error : autosave.status === "saving" ? "Сохраняем…" : autosave.status === "pending" ? "Есть изменения…" : "Все изменения сохранены"}</span>
    {autosave.status === "error" && <Button variant="outline" type="button" onClick={() => void autosave.flush(true)}>Повторить сохранение</Button>}
  </div>;
}

export function useDocumentDraft(value, onSave, documentKey, enabled = true) {
  const { owner } = useSphereSharing();
  return useInlineAutosave({ value, onSave, enabled, storageKey: owner?.id ? `rollapp:text:${owner.id}:${documentKey}` : undefined });
}

export function InlineDocument({ value, onSave, label, documentKey, readOnly = false, disabled = false, addBlock, placeholder, className = "", focusOnEntry = false }) {
  const autosave = useDocumentDraft(value, onSave, documentKey, !readOnly && !disabled);
  const editorRef = useRef(null);
  const editable = !readOnly && !disabled;
  return <>
    {editable && addBlock && <AddFab actions={[{ label: "Добавить блок", onSelect: () => {
      const editor = editorRef.current;
      if (!editor) return;
      const position = editor.state.doc.content.size;
      const firstBlock = Array.isArray(addBlock) ? addBlock[0] : addBlock;
      const textOffset = firstBlock.type === "blockquote" ? 2 : 1;
      editor.chain().insertContentAt(position, addBlock).focus(position + textOffset).run();
    } }]} />}
    <EditableTextBlock value={editable ? autosave.draft : value} onChange={editable ? autosave.change : undefined} onBlur={autosave.flush}
      readOnly={readOnly} disabled={disabled} label={label} placeholder={placeholder} className={className} editorRef={editorRef} focusOnEntry={focusOnEntry} />
    {editable && <InlineSaveStatus autosave={autosave} />}
  </>;
}
