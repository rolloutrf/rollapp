import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { EditableTextBlock } from "@/components/editable-text-block";
import { MarkdownDocument } from "@/components/life-strategy";
import { AboutMeQuestionEditor } from "@/components/about-me.jsx?text-edit";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";

const entry = { question: "Что для меня важно?", description: "Текст ответа можно выделять и копировать.\n\n[Ссылка на материал](/__text-edit#reference)" };
function Fixture() {
  useVisualViewport();
  const [open, setOpen] = useState(false);
  const params = new URLSearchParams(location.search);
  const readOnly = params.has("readonly"), disabled = params.has("loading");
  return <><main className="app-page sphere-text-page page-stack">
    <EditableTextBlock className="about-me-question" label="Редактировать вопрос" disabled={disabled} onEdit={readOnly ? undefined : () => setOpen(true)}>
      <MarkdownDocument source={`### ${entry.question}\n\n${entry.description}`} label={entry.question} className="about-me-question__document" />
    </EditableTextBlock>
  </main><AboutMeQuestionEditor entry={entry} mode="edit" open={open} onOpenChange={setOpen} onSave={() => { throw new Error("This fixture must not save"); }} /></>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><MobileFormPages><Fixture /></MobileFormPages></BrowserRouter>);
