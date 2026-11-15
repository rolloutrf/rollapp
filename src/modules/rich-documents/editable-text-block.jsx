import { lazy, Suspense } from "react";
import "./inline-editor.css";

const InlineRichTextEditor = lazy(() => import("@/modules/rich-documents/inline-rich-text-editor.jsx"));

export function EditableTextBlock(props) {
  return <Suspense fallback={<div className="text-muted-foreground" role="status">Загружаем текст…</div>}>
    <InlineRichTextEditor {...props} />
  </Suspense>;
}
