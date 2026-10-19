import { useId, useState } from "react";
import { X } from "lucide-react";
import { useCareerContent, CareerContentError } from "@/components/career-content";
import { InlineDocument } from "@/components/inline-document";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSphereSharing } from "@/lib/sphere-sharing";

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
  const sharing = useSphereSharing();
  const document = useCareerContent("ideal-state", "", "identity");
  const content = typeof document.content === "string" ? document.content : "";
  return <div className="sphere-text-page page-stack">
    <CareerContentError error={document.error} onRetry={document.retry} />
    {document.loading && <span role="status">Загружаем…</span>}
    {!document.loading && !document.error && <InlineDocument key={`ideal-state:${sharing.owner?.id || "self"}`}
      documentKey="identity:ideal-state" value={content} onSave={document.save} label="Идеальное состояние"
      readOnly={sharing.readOnly || sharing.loading || Boolean(sharing.error)}
      placeholder="Опишите жизнь, к которой стремитесь…" addBlock={[{ type: "heading", attrs: { level: 2 } }, { type: "paragraph" }]} />}
  </div>;
}
