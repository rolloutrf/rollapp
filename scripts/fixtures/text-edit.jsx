// Load the editor module before fixture navigation completes. The app keeps
// its lazy boundary; browser interaction tests must not race Vite module fetches.
import "../../src/components/inline-rich-text-editor.jsx";
import { identityFourQuestionsSchema } from "../../server/identity-content-schema.js";
import { InlineTextField } from "@/components/inline-text-field";
import React, { lazy, Suspense, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import { DevelopmentPlan } from "@/components/development-plan";
import { InlineDocument } from "@/components/inline-document";
import { FourQuestionDocument } from "@/components/four-questions.jsx?text-edit";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";
import { MarkdownDocument } from "@/components/life-strategy";
import { Button } from "@/components/ui/button";
import "../../src/styles.css";
import "../../src/index.css";

const TextChromeFrame = lazy(() => import("./text-chrome-frame.jsx"));
const developmentSource = "### Учебный план\n\n- Разобрать учебный пример\n- Проверить результат";
const source = "### Что для меня важно?\n\nТекст ответа можно выделять и копировать.\n\n[Ссылка на материал](https://example.com)\n\n:::statement Важная мысль\n\n- [ ] Задача\n\n- Пункт списка";
function PlainFieldFixture({source,disabled}) {
 const [value,setValue]=useState(source);
 window.inlinePlainTest ??= {inputs:[],blurs:0};
 window.inlinePlainTest.value=value;
 return <article className="typeset typeset-rollapp typeset-document"><p><InlineTextField value={value} disabled={disabled} label="Описание блока" onChange={next=>{window.inlinePlainTest.inputs.push(next);setValue(next);}} onBlur={()=>{window.inlinePlainTest.blurs++;}} /></p></article>;
}
function Fixture() {
  useVisualViewport();
  const params = new URLSearchParams(location.search);
  window.inlineFixtureCareerContent = params.has("development") ? { development: developmentSource } : {};
  const [accessReadOnly, setAccessReadOnly] = useState(params.has("readonly"));
  const [content, setContent] = useState(params.has("source") ? params.get("source") : window.inlineFixtureSource || (params.has("long") ? Array.from({ length: 24 }, (_, index) => `Блок ${index + 1}: Длинный документ для проверки действий у курсора.`).join("\n\n") : source));
  const [questions, setQuestions] = useState(params.has('questions') ? JSON.parse(params.get('questions')) : window.inlineFixtureQuestions || { questions: IDENTITY_QUESTION_TITLES.map(title => ({ title, paragraphs: params.has("selection") ? Array.from({ length: 12 }, (_, paragraph) => `Ответ ${title}, абзац ${paragraph + 1}. Выделенный текст должен показывать панель рядом с собой при прокрутке страницы и переключении между ответами.`) : ["Исходный ответ"] })) });
  window.inlineTest ??= { saves: [], pending: [], fail: params.has("error"), slow: params.has("slow") };
  const save = async (value) => {
    if (typeof value !== "string") identityFourQuestionsSchema.parse(value);
    window.inlineTest.saves.push(value);
    if (window.inlineTest.slow) await new Promise(resolve => window.inlineTest.pending.push(resolve));
    if (window.inlineTest.fail) throw new Error("Соединение потеряно. Текст остался в черновике.");
    if (typeof value === "string") setContent(value); else setQuestions(value);
    window.inlineTest.saved = value;
  };
  const ContentRoot = params.has("chrome") ? "div" : "main";
  const document = <ContentRoot className={params.has("chrome") ? "sphere-text-page page-stack" : "app-page sphere-text-page page-stack"} style={{ paddingBottom: "120px", paddingTop: params.has("selection") ? "320px" : undefined }}>
    {params.has("access") && <Button type="button" onClick={() => setAccessReadOnly(value => !value)}>{accessReadOnly ? "Разрешить редактирование" : "Только чтение"}</Button>}
    {params.has("plain") ? <PlainFieldFixture source={content} disabled={accessReadOnly}/> : params.has("public") ? <MarkdownDocument source={content} label="Опубликованный текст" collapsibleAges={params.has("public-ages")} collapsibleStrategies={params.has("public-strategies")} /> : params.has("development") ? <DevelopmentPlan /> : params.has("four") ? <FourQuestionDocument content={questions} onSave={save} readOnly={params.has("readonly")} /> :
      <InlineDocument documentKey="fixture" value={content} onSave={save} label="О себе" readOnly={accessReadOnly} disabled={params.has("loading")} showBusinessControls={params.has("add")} addBlock={[{ type: "heading", attrs: { level: 3 } }, { type: "paragraph" }]} />}
    {params.has("twins")&&<InlineDocument documentKey="fixture-secondary" value={params.get("secondSource") || "Второй документ"} onSave={async value=>{window.inlineTest.secondSaved=value;}} label="Второй документ"/>}
  </ContentRoot>;
  return params.has("chrome") ? <Suspense fallback={null}><TextChromeFrame>{document}</TextChromeFrame></Suspense> : document;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><Fixture /></BrowserRouter>);
