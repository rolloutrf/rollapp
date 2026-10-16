import { useId, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useCareerContent, CareerContentError, MarkdownEditorDrawer } from "@/components/career-content";
import { MarkdownDocument } from "@/components/life-strategy";
import { SphereBusinessControls } from "@/components/business-marketplace-page";
import { Button } from "@/components/ui/button";
import { PageActionButton } from "@/components/page-action-button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSphereSharing } from "@/lib/sphere-sharing";
import { idealStateTopics, appendIdealStateItem } from "@/lib/ideal-state";

function IdealStateItemEditor({ topics, onClose, onSave }) {
  const id = useId();
  const mobile = useIsMobile();
  const [topicId, setTopicId] = useState(topics[0]?.id || "new");
  const [topicTitle, setTopicTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await onSave({ topicId, topicTitle, text }); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Drawer open showSwipeHandle swipeDirection={mobile ? "down" : "right"} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DrawerContent className="rollapp-body app-drawer--form">
      <DrawerClose render={<Button variant="ghost" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть добавление пункта"><X aria-hidden="true" /></DrawerClose>
      <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
        <DrawerHeader className="pr-16 text-left!"><DrawerTitle>Добавить в идеальное состояние</DrawerTitle><DrawerDescription>Выберите тему и опишите, как вы хотите жить и чувствовать себя.</DrawerDescription></DrawerHeader>
        <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <FieldGroup>
            <Field><FieldLabel htmlFor={`${id}-topic`}>Тема</FieldLabel><Select value={topicId} onValueChange={setTopicId}><SelectTrigger id={`${id}-topic`}><SelectValue>{topicId === "new" ? "Новая тема" : topics.find(({ id }) => id === topicId)?.title}</SelectValue></SelectTrigger><SelectContent>{topics.map(({ id, title }) => <SelectItem key={id} value={id}>{title}</SelectItem>)}<SelectItem value="new">Новая тема</SelectItem></SelectContent></Select></Field>
            {topicId === "new" && <Field><FieldLabel htmlFor={`${id}-topic-title`}>Название темы</FieldLabel><Input id={`${id}-topic-title`} required maxLength={100} placeholder="Например, Отдых" value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} /></Field>}
            <Field><FieldLabel htmlFor={`${id}-text`}>Желаемое состояние</FieldLabel><Textarea id={`${id}-text`} required maxLength={20_000} rows={6} placeholder="Как выглядит ваше идеальное состояние?" value={text} onChange={(event) => setText(event.target.value)} /></Field>
          </FieldGroup>
        </div>
        <DrawerFooter><Button type="submit" disabled={busy || !text.trim() || (topicId === "new" && !topicTitle.trim())}>{busy && <Spinner />}Добавить</Button></DrawerFooter>
      </form>
    </DrawerContent>
  </Drawer>;
}

export function IdealState() {
  const { readOnly } = useSphereSharing();
  const document = useCareerContent("ideal-state", "", "identity");
  const content = typeof document.content === "string" ? document.content : "";
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const unavailable = document.loading || Boolean(document.error);
  const add = async (item) => { await document.save(appendIdealStateItem(content, item)); toast.success("Пункт добавлен"); };
  return <div className="sphere-text-page page-stack">
    {!readOnly && <header className="not-typeset rollapp-body page-toolbar w-full justify-center"><div className="page-actions wishes-page__hero-actions horizontal-action-scroller" role="group" aria-label="Действия раздела «Идеальное состояние»"><PageActionButton disabled={unavailable} onClick={() => setAdding(true)}>Добавить</PageActionButton><PageActionButton variant="outline" disabled={unavailable} onClick={() => setEditing(true)}>Редактировать</PageActionButton><SphereBusinessControls sphereId="identity" /></div></header>}
    <CareerContentError error={document.error} onRetry={document.retry} />
    {document.loading ? <div className="not-typeset flex items-center gap-2" role="status"><Spinner />Загружаем…</div> : content.trim() ? <MarkdownDocument source={content} label="Идеальное состояние" hideSourceLabels /> : !document.error && <Empty className="min-h-64 border"><EmptyHeader><EmptyTitle>Идеальное состояние</EmptyTitle><EmptyDescription>{readOnly ? "Владелец пока не добавил описание." : "Опишите жизнь, к которой стремитесь. Добавляйте пункты по темам."}</EmptyDescription></EmptyHeader></Empty>}
    {!readOnly && adding && <IdealStateItemEditor topics={idealStateTopics(content)} onClose={() => setAdding(false)} onSave={add} />}
    {!readOnly && <MarkdownEditorDrawer content={content} label="Идеальное состояние" open={editing} onOpenChange={setEditing} onSave={document.save} />}
  </div>;
}
