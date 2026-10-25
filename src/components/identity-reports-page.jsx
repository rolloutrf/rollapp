import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, Trash2, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { api } from "@/api";
import { useSphereSharing } from "@/lib/sphere-sharing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListTileContent } from "@/components/list-tile-content";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { IdentityGeneratedDocuments, IdentityReportControls, IdentityReportEmpty, IdentityReportStatus, useIdentityReport } from "@/components/identity-report-manager";

export function IdentityTestForm({ test, open, onOpenChange, onSaved, onDeleted, remove = (id) => api.delete(`/identity/reports/${id}/test`), save = (value) => test ? api.patch(`/identity/reports/${test.id}`, value) : api.post("/identity/reports", value) }) {
  const id = useId();
  const mobile = useIsMobile();
  const location = useLocation();
  const pendingResult = useRef(null);
  useEffect(() => {
    if (!open && !new URLSearchParams(location.search).has("formScreen") && pendingResult.current) {
      const saved = pendingResult.current;
      pendingResult.current = null;
      if (saved.deleted) onDeleted(saved.id); else onSaved(saved.test);
    }
  }, [open, location.search, onSaved, onDeleted]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const working = busy || deleting;
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setTitle(test?.title || ""); setError(""); setDeleteOpen(false); } }, [open, test]);
  function finish(result) {
    if (mobile) pendingResult.current = result;
    else if (result.deleted) onDeleted(result.id);
    else onSaved(result.test);
    onOpenChange(false);
  }
  async function submit(event) {
    event.preventDefault();
    if (working || deleteOpen || !title.trim()) return;
    setBusy(true); setError("");
    try { const result = await save({ title: title.trim() }); finish({ test: result.test }); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function removeTest(event) {
    event.preventDefault();
    if (working || !test?.id) return;
    setDeleting(true); setError("");
    try { await remove(test.id); setDeleteOpen(false); finish({ deleted: true, id: test.id }); }
    catch (cause) { setError(cause.message); setDeleteOpen(false); }
    finally { setDeleting(false); }
  }
  return <><Drawer open={open} onOpenChange={value => !working && onOpenChange(value)}>
    <DrawerContent className="rollapp-body app-drawer--form">
      <DrawerClose render={<Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2" disabled={working} />} aria-label="Закрыть настройки теста"><X /></DrawerClose>
      <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
        <DrawerHeader className="pr-16">
          <DrawerTitle>{test ? "Изменить тест" : "Добавить тест"}</DrawerTitle>
          <DrawerDescription>{test ? "Измените название теста или удалите его вместе с результатами." : "Укажите название, затем загрузите PDF с результатами."}</DrawerDescription>
        </DrawerHeader>
        <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {error && <Alert variant="destructive"><AlertTitle>{test ? "Не удалось изменить тест" : "Не удалось сохранить тест"}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          <Field><FieldLabel htmlFor={id}>Название теста</FieldLabel><Input id={id} required disabled={working} maxLength={80} placeholder="Например, Big Five или MBTI" value={title} onChange={event => setTitle(event.target.value)} /></Field>
          {test && <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4"><div className="min-w-0 flex-1"><strong className="block text-sm font-medium">Удалить тест</strong><span className="text-sm text-muted-foreground">Все PDF и результаты этого теста будут удалены.</span></div><Button type="button" variant="destructive" disabled={working} onClick={() => setDeleteOpen(true)}><Trash2 data-icon="inline-start" aria-hidden="true" />Удалить</Button></div>}
        </div>
        <DrawerFooter><Button type="submit" disabled={working || !title.trim()} aria-busy={busy || undefined}>{busy ? "Сохраняем" : test ? "Сохранить изменения" : "Добавить тест"}</Button></DrawerFooter>
      </form>
    </DrawerContent>
  </Drawer>
    <AlertDialog open={open && deleteOpen} onOpenChange={value => !working && setDeleteOpen(value)}><AlertDialogContent className="overflow-y-auto">
      <AlertDialogHeader><AlertDialogTitle className="wrap-anywhere">Удалить тест «{test?.title}»?</AlertDialogTitle><AlertDialogDescription>Тест, все его PDF и извлечённое содержимое будут удалены без возможности восстановления.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={working}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={working} aria-busy={deleting || undefined} onClick={removeTest}>{deleting ? "Удаляем" : "Удалить тест"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}

export function IdentityReportNavigation({ tests, onAddTest, disabled = false }) {
  return <div className="min-w-0 not-typeset" data-report-navigation>
    <div className="list-tabs horizontal-tile-scroller" data-tab-scroller>
      <TabsList className="contents" aria-label="Отчёт о личности">
        {[{ id: "gallup", title: "Gallup", detail: "CliftonStrengths" }, { id: "hogan", title: "Hogan", detail: "HPI · HDS · MVPI" }, ...tests].map(test => <TabsTrigger key={test.id} data-list-tile data-report-tile value={test.id} title={test.title} aria-label={test.title}>
          <ListTileContent title={test.title} detail={test.detail || "Личностный тест"} />
        </TabsTrigger>)}
      </TabsList>
      {onAddTest && <Button className="list-tabs__add" type="button" variant="ghost" size="icon" aria-label="Новый тест" title="Новый тест" disabled={disabled} onClick={onAddTest}><Plus className="size-5" aria-hidden="true" /></Button>}
    </div>
  </div>;
}

function SelectedIdentityReport({ section, label, navigation, renderBuiltin, onEdit, client }) {
  const reportState = useIdentityReport(section, client);
  const { state, error, load } = reportState;
  return <>
    <IdentityReportControls client={client} section={section} label={label} {...reportState} navigation={navigation} onEditTest={onEdit} />
    <TabsContent value={section} className="min-w-0">
      {renderBuiltin ? renderBuiltin(reportState) : state.mode === "loading" || state.mode === "error"
        ? <IdentityReportStatus mode={state.mode} error={error} onRetry={load} />
        : state.mode === "generated" ? <IdentityGeneratedDocuments report={state.report} /> : <IdentityReportEmpty label={label} />}
    </TabsContent>
  </>;
}

export function IdentityReportsPage({ renderGallup, renderHogan, client = api }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { readOnly, loading: sharingLoading } = useSphereSharing();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState(null);
  useEffect(() => {
    let active = true;
    if (sharingLoading) return () => { active = false; };
    setError("");
    if (readOnly) { setTests([]); setLoading(false); return; }
    setLoading(true);
    client.get("/identity/reports").then(result => { if (active) setTests(result.tests); }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [readOnly, sharingLoading, location.pathname, revision, client]);
  const search = new URLSearchParams(location.search);
  const requested = search.get("report") || (search.get("tab") === "hogan" ? "hogan" : "gallup");
  const selected = ["hogan", "gallup"].includes(requested) || tests.some(test => test.id === requested) ? requested : "gallup";
  const current = tests.find(test => test.id === selected);
  function selectReport(id) {
    const params = new URLSearchParams(location.search);
    params.set("tab", "identity-reports"); params.set("report", id);
    navigate({ pathname: location.pathname, search: `?${params}`, hash: location.hash }, { replace: true });
  }
  const navigation = ({ busy }) => <IdentityReportNavigation tests={tests} onAddTest={!readOnly ? () => setForm({}) : undefined} disabled={busy || loading || sharingLoading || Boolean(error)} />;
  return <Tabs className="identity-reports-page identity-report-workspace" value={selected} onValueChange={selectReport}>
    {error && <Alert variant="destructive"><AlertTitle>Не удалось загрузить тесты</AlertTitle><AlertDescription>{error}</AlertDescription><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Повторить</Button></Alert>}
    {loading && requested.startsWith("custom-") ? <IdentityReportStatus mode="loading" /> : <SelectedIdentityReport client={client} key={selected} section={selected} label={current?.title || (selected === "hogan" ? "Hogan" : "Gallup")} navigation={navigation}
      renderBuiltin={selected === "gallup" ? renderGallup : selected === "hogan" ? renderHogan : null}
      onEdit={current && !readOnly ? () => setForm(current) : undefined} />}
    <IdentityTestForm remove={id => client.delete(`/identity/reports/${id}/test`)} onDeleted={id => { setTests(value => value.filter(test => test.id !== id)); selectReport("gallup"); }} save={value => form?.id ? client.patch(`/identity/reports/${form.id}`, value) : client.post("/identity/reports", value)} test={form?.id ? form : null} open={Boolean(form)} onOpenChange={open => !open && setForm(null)} onSaved={test => { setTests(value => value.some(item => item.id === test.id) ? value.map(item => item.id === test.id ? test : item) : [...value, test]); selectReport(test.id); }} />
  </Tabs>;
}
