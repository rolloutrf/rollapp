import { useRef } from "react";
import { EditableTextBlock } from "@/components/editable-text-block";
import { useInlineAutosave } from "@/hooks/use-inline-autosave";
import { useSphereSharing } from "@/lib/sphere-sharing";
import { Button } from "@/components/ui/button";
import { PageActionButton } from "@/components/page-action-button";
import { SphereBusinessControls } from "@/components/business-marketplace-page";
import { businessMarketplacePath } from "@/lib/app-routing";

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

export function InlineDocument({ value, onSave, label, documentKey, scope = "identity", readOnly = false, disabled = false, addBlock, placeholder, className = "", showBusinessControls = true }) {
  const autosave = useDocumentDraft(value, onSave, documentKey, !readOnly && !disabled);
  const editorRef = useRef(null);
  const editable = !readOnly && !disabled;
  return <>
    {editable && showBusinessControls && (addBlock || businessMarketplacePath(scope)) && <header className="not-typeset rollapp-body page-toolbar w-full justify-center">
      <div className="page-actions wishes-page__hero-actions horizontal-action-scroller" role="group" aria-label={`Действия раздела «${label}»`}>
        {addBlock && <PageActionButton type="button" onClick={() => {
          const editor = editorRef.current;
          if (!editor) return;
          const position = editor.state.doc.content.size;
          const firstBlock = Array.isArray(addBlock) ? addBlock[0] : addBlock;
          const textOffset = firstBlock.type === "blockquote" ? 2 : 1;
          editor.chain().insertContentAt(position, addBlock).focus(position + textOffset).run();
        }}>Добавить</PageActionButton>}
        <SphereBusinessControls sphereId={scope} />
      </div>
    </header>}
    <EditableTextBlock value={editable ? autosave.draft : value} onChange={editable ? autosave.change : undefined} onBlur={autosave.flush}
      readOnly={readOnly} disabled={disabled} label={label} placeholder={placeholder} className={className} editorRef={editorRef} />
    {editable && <InlineSaveStatus autosave={autosave} />}
  </>;
}
