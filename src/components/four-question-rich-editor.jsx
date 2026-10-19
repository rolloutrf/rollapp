import { useId, useMemo } from "react";
import InlineRichTextEditor from "@/components/inline-rich-text-editor";
import { createFourQuestionAdapter } from "@/lib/four-question-document";
import "./inline-editor.css";

export default function FourQuestionRichEditor(props) {
  const prefix = useId();
  const adapter = useMemo(() => createFourQuestionAdapter(`question-${prefix}`), [prefix]);
  return <InlineRichTextEditor {...props} contentAdapter={adapter} label="Ответы на четыре вопроса" placeholder="Напишите свой ответ…" />;
}
