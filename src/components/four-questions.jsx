import { useEffect, useId, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { api } from "@/api";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";
import { CareerContentError, CareerEditAction } from "@/components/career-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

const DEFAULT_CONTENT = {
  questions: [
    {
      title: IDENTITY_QUESTION_TITLES[0],
      paragraphs: [
        "Мир — это конфликтная арена, где разные центры силы — государства, капитал, техноплатформы, религиозные и культурные игроки — борются за контроль над деньгами, данными и смыслами, а люди и сообщества обычно стартуют как объекты этой игры.",
      ],
    },
    {
      title: IDENTITY_QUESTION_TITLES[1],
      paragraphs: [
        "Я — Framer: человек, который задаёт рамки и правила игры. Я формулирую, о чём здесь система, что считается нормой, успехом и справедливостью и по каким принципам распределяются ресурсы и влияние.",
        "Опираюсь на связку талантов Gallup — Analytical, Achiever, Activator, Maximizer, Command, а также Communication и Developer — и высокий запрос на власть, традицию и коммерцию по Hogan. Поэтому моя естественная роль — архитектура и перепрошивка финансовых, институциональных и технологических систем, а не выполнение отдельных задач.",
      ],
    },
    {
      title: IDENTITY_QUESTION_TITLES[2],
      paragraphs: [
        "Моё место — в «узлах», где деньги и торговля встречаются с цифровыми технологиями, регулированием и смыслами: в финтехе, банках, институциях вокруг денег и исламских контурах; в ролях уровня Head/Director и будущего C-level, которые задают стандарты продукта, людей и правил.",
      ],
    },
    {
      title: IDENTITY_QUESTION_TITLES[3],
      paragraphs: [
        "Я хочу субъектности и власти — способности формировать вектор систем, в которых живу и работаю, платформизируя экономику: строя финансовые и сервисные платформы, которые улучшают качество взаимодействий между участниками рынка и постепенно обновляют правила игры.",
        "В долгом горизонте я хочу не просто адаптироваться к существующей комплементарной экономике, а заменять её элементами партнёрского и исламского финансирования — со справедливым распределением рисков и минимизацией процентной зависимости.",
      ],
    },
  ],
};

function validContent(content) {
  return content?.questions?.length === IDENTITY_QUESTION_TITLES.length
    && content.questions.every((question) => question?.paragraphs?.length);
}

function contentDraft(content) {
  return content.questions.map((question) => ({
    answer: question.paragraphs.join("\n\n"),
  }));
}

function savedContent(draft) {
  return {
    questions: draft.map((question, index) => ({
      title: IDENTITY_QUESTION_TITLES[index],
      paragraphs: question.answer.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean),
    })),
  };
}

function FourQuestionsEditor({ content, open, onOpenChange, onSave }) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [draft, setDraft] = useState(() => contentDraft(content));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(contentDraft(content));
    setSaving(false);
    setError("");
  }, [content, open]);

  const updateAnswer = (index, value) => setDraft((current) => current.map((question, questionIndex) => (
    questionIndex === index ? { ...question, answer: value } : question
  )));

  const changeOpen = (nextOpen) => {
    if (!saving) onOpenChange(nextOpen);
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextContent = savedContent(draft);
    if (nextContent.questions.some((question) => !question.paragraphs.length)) {
      setError("Заполните ответ для каждого из четырёх вопросов.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(nextContent);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={changeOpen}>
      <DrawerContent
        className="rollapp-body"
        style={isMobile ? undefined : { "--drawer-content-width": "min(52rem, calc(100vw - 2rem))" }}
      >
        <DrawerClose
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />}
          aria-label="Закрыть редактирование четырёх вопросов"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>Редактировать «4 вопроса»</DrawerTitle>
            <DrawerDescription>Измените ответы на четыре фиксированных вопроса.</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить изменения</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {draft.map((question, index) => (
              <fieldset className="grid min-w-0 gap-4 rounded-xl border p-4" key={IDENTITY_QUESTION_TITLES[index]}>
                <legend className="px-2 font-semibold">Вопрос {index + 1}</legend>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-answer-${index}`}>{IDENTITY_QUESTION_TITLES[index]}</FieldLabel>
                    <Textarea
                      className="min-h-40 resize-y text-base"
                      id={`${formId}-answer-${index}`}
                      maxLength={60_000}
                      required
                      value={question.answer}
                      onChange={(event) => updateAnswer(index, event.target.value)}
                    />
                    <FieldDescription>Оставьте пустую строку между абзацами.</FieldDescription>
                  </Field>
                </FieldGroup>
              </fieldset>
            ))}
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : "Сохранить изменения"}
            </Button>
            <DrawerClose render={<Button className="min-h-12 text-base" variant="outline" type="button" disabled={saving} />}>
              Отмена
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

export function FourQuestions() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState({ content: DEFAULT_CONTENT, error: "", loading: true });
  const content = validContent(state.content) ? state.content : DEFAULT_CONTENT;

  useEffect(() => {
    let current = true;
    setState((value) => ({ ...value, error: "", loading: true }));
    api.get("/identity/content/four-questions").then((result) => {
      if (!current) return;
      setState({
        content: validContent(result.content) ? result.content : DEFAULT_CONTENT,
        error: "",
        loading: false,
      });
    }).catch((error) => {
      if (current) setState((value) => ({ ...value, error: error.message, loading: false }));
    });
    return () => { current = false; };
  }, [requestVersion]);

  const save = async (nextContent) => {
    const result = await api.patch("/identity/content/four-questions", { content: nextContent });
    setState({ content: result.content, error: "", loading: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CareerEditAction label="Редактировать" loading={state.loading} onClick={() => setEditorOpen(true)} />
      <CareerContentError error={state.error} onRetry={() => setRequestVersion((version) => version + 1)} />
      <article className="four-questions typeset typeset-rollapp typeset-document" aria-label="Четыре вопроса">
        <ol className="four-questions__list">
          {content.questions.map((question, index) => (
            <li key={index} className="four-question">
              <article className="four-question__content" aria-labelledby={`four-question-${index + 1}`}>
                <h3 id={`four-question-${index + 1}`}>{IDENTITY_QUESTION_TITLES[index]}</h3>
                <div className="four-question__answer" data-typeset-group>
                  {question.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
                </div>
              </article>
            </li>
          ))}
        </ol>
      </article>
      <FourQuestionsEditor
        content={content}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={save}
      />
    </div>
  );
}
