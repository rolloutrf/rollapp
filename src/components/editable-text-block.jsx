import { lazy, Suspense } from "react";
import "./inline-editor.css";

const InlineRichTextEditor = lazy(() => import("@/components/inline-rich-text-editor"));

export function EditableTextBlock(props) {
  return <Suspense fallback={<div className="text-muted-foreground" role="status">Загружаем текст…</div>}>
    <InlineRichTextEditor {...props} />
  </Suspense>;
}
