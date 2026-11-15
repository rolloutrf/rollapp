import { useId, useMemo } from "react";
import InlineRichTextEditor from "@/modules/rich-documents/inline-rich-text-editor.jsx";
import { createFourQuestionAdapter } from "@/modules/identity/four-question-document.js";
import "../rich-documents/inline-editor.css";

export default function FourQuestionRichEditor(props) {
  const prefix = useId();
  const adapter = useMemo(() => createFourQuestionAdapter(`question-${prefix}`), [prefix]);
  return <InlineRichTextEditor {...props} contentAdapter={adapter} label="Ответы на четыре вопроса" placeholder="Напишите свой ответ…" />;
}
