import { AddFab } from "@/components/add-fab";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Trash2, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { api } from "@/api";
import { useSphereSharing } from "@/lib/sphere-sharing";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { WishListNavigation } from "@/components/wish-list-navigation";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { IdentityGeneratedDocuments, IdentityReportEmpty, IdentityReportStatus, useIdentityReport } from "@/components/identity-report-manager";

const BUILTIN_TESTS = [
  { id: "gallup", title: "Gallup", detail: "CliftonStrengths" },
  { id: "hogan", title: "Hogan", detail: "HPI · HDS · MVPI" },
];

export function IdentityTestForm({ test, reportUpload, open, onOpenChange, onSaved, onDeleted, onAfterClose, finalFocus, remove = (id) => api.delete(`/identity/reports/${id}/test`), save = (value) => test ? api.patch(`/identity/reports/${test.id}`, value) : api.post("/identity/reports", value) }) {
  const id = useId();
  const uploadId = `${id}-pdf`;
  const builtInSettings = Boolean(reportUpload && !test);
  const FormBody = builtInSettings ? "div" : "form";
  const mobile = useIsMobile();
  const pendingResult = useRef(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const working = busy || deleting || Boolean(reportUpload?.busy);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setTitle(test?.title || ""); setError(""); setDeleteOpen(false); } }, [open, test]);
  function finish(result) {
    pendingResult.current = result;
    onOpenChange(false);
  }
  function applyResult() {
    const result = pendingResult.current;
    pendingResult.current = null;
    if (result?.deleted) onDeleted(result.id);
    else if (result) onSaved(result.test);
    onAfterClose?.();
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
  return <><Drawer open={open} onOpenChange={value => !working && onOpenChange(value)} onAfterClose={applyResult}>
    <DrawerContent className="rollapp-body app-drawer--form" finalFocus={finalFocus}>
      <DrawerClose render={<Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2" disabled={working} />} aria-label="Закрыть настройки теста"><X /></DrawerClose>
      <FormBody className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={builtInSettings ? undefined : submit}>
        <DrawerHeader className="pr-16">
          <DrawerTitle>{builtInSettings ? `Результаты ${reportUpload.label}` : test ? "Изменить тест" : "Добавить тест"}</DrawerTitle>
          <DrawerDescription>{builtInSettings ? `Загрузите PDF с результатами ${reportUpload.label}.` : test ? "Измените название теста или загрузите PDF с результатами." : "Укажите название. PDF можно загрузить через кнопку «⋯» на плитке теста."}</DrawerDescription>
        </DrawerHeader>
        <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {error && <Alert variant="destructive"><AlertTitle>{test ? "Не удалось изменить тест" : "Не удалось сохранить тест"}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {!builtInSettings && <Field><FieldLabel htmlFor={id}>Название теста</FieldLabel><Input id={id} required disabled={working} maxLength={80} placeholder="Например, Big Five или MBTI" value={title} onChange={event => setTitle(event.target.value)} /></Field>}
          {reportUpload && (
            <Field className="min-w-0">
              <FieldLabel className="min-w-0 wrap-anywhere" htmlFor={uploadId}>Загрузить PDF для {reportUpload.label}</FieldLabel>
              <Input id={uploadId} type="file" accept="application/pdf,.pdf" multiple disabled={working || reportUpload.disabled} onChange={reportUpload.onChange} aria-describedby={`${uploadId}-help`} />
              <FieldDescription id={`${uploadId}-help`}>
                {reportUpload.busy ? <span className="inline-flex items-center gap-2" role="status"><Spinner aria-hidden="true" />Загружаем PDF…</span>
                  : "До 8 файлов, каждый не больше 12 МБ."}
              </FieldDescription>
            </Field>
          )}
        </div>
        <DrawerFooter>
          {builtInSettings
            ? <DrawerClose render={<Button type="button" variant="outline" disabled={working} />}>Готово</DrawerClose>
            : <Button type="submit" aria-label={test ? "Сохранить изменения" : undefined} disabled={working || !title.trim()} aria-busy={busy || undefined}>{busy ? "Сохраняем" : test ? (mobile ? "Сохранить" : "Сохранить изменения") : "Добавить тест"}</Button>}
          {test && <Button data-control-icon type="button" variant="destructive" size="icon" aria-label="Удалить тест" title="Удалить тест" disabled={working} onClick={() => setDeleteOpen(true)}><Trash2 aria-hidden="true" /></Button>}
        </DrawerFooter>
      </FormBody>
    </DrawerContent>
  </Drawer>
    <AlertDialog open={open && deleteOpen} onOpenChange={value => !working && setDeleteOpen(value)}><AlertDialogContent className="overflow-y-auto">
      <AlertDialogHeader><AlertDialogTitle className="wrap-anywhere">Удалить тест «{test?.title}»?</AlertDialogTitle><AlertDialogDescription>Тест, все его PDF и извлечённое содержимое будут удалены без возможности восстановления.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={working}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={working} aria-busy={deleting || undefined} onClick={removeTest}>{deleting ? "Удаляем" : "Удалить тест"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}

export function IdentityReportNavigation({ tests, selected, onSelect, onSettings }) {
  return <WishListNavigation
    className="not-typeset"
    label="Отчёт о личности"
    settingsLabel={title => `Настройки теста «${title}»`}
    value={selected}
    items={[...BUILTIN_TESTS, ...tests.map(test => ({ ...test, detail: "Личностный тест" }))]}
    onSelect={onSelect}
    onSettings={onSettings}
  />;
}

function IdentityReportSettings({ target, reportState, client, ...formProps }) {
  const { uploading, uploadDisabled, upload } = reportState;
  const test = BUILTIN_TESTS.some(item => item.id === target.id) ? null : target;
  return <IdentityTestForm
    {...formProps}
    test={test}
    reportUpload={{ label: target.title, busy: uploading, disabled: uploadDisabled, onChange: upload }}
    remove={id => client.delete(`/identity/reports/${id}/test`)}
    save={value => client.patch(`/identity/reports/${target.id}`, value)}
  />;
}

function InactiveReportSettings({ target, client, ...formProps }) {
  const reportState = useIdentityReport(target.id, client);
  return <IdentityReportSettings {...formProps} target={target} reportState={reportState} client={client} />;
}

function SelectedIdentityReport({ report, renderBuiltin, settings, client }) {
  const reportState = useIdentityReport(report.id, client);
  const { state, error, load } = reportState;
  return <>
    <div className="min-w-0">
      {renderBuiltin ? renderBuiltin(reportState) : state.mode === "loading" || state.mode === "error"
        ? <IdentityReportStatus mode={state.mode} error={error} onRetry={load} />
        : state.mode === "generated" ? <IdentityGeneratedDocuments report={state.report} /> : <IdentityReportEmpty label={report.title} />}
    </div>
    {settings && <IdentityReportSettings {...settings} reportState={reportState} client={client} />}
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
  const addTrigger = useRef(null);
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
  const reports = [...BUILTIN_TESTS, ...tests];
  const current = reports.find(test => test.id === requested) ?? BUILTIN_TESTS[0];
  const selected = current.id;
  function selectReport(id) {
    if (!id) return;
    const params = new URLSearchParams(location.search);
    params.set("tab", "identity-reports"); params.set("report", id);
    navigate({ pathname: location.pathname, search: `?${params}`, hash: location.hash }, { replace: true });
  }
  const canManage = !readOnly && !sharingLoading;
  const openSettings = (id, opener) => {
    const target = reports.find(test => test.id === id);
    if (!target) return;
    opener.focus({ preventScroll: true });
    setForm({ target, opener, open: true });
  };
  const formProps = canManage && form ? {
    open: form.open,
    finalFocus: () => form.opener,
    onOpenChange: open => setForm(value => ({ ...value, open })),
    onAfterClose: () => setForm(value => value === form ? null : value),
    onSaved(test) {
      setTests(value => form.target ? value.map(item => item.id === test.id ? test : item) : [...value, test]);
      if (!form.target) selectReport(test.id);
    },
    onDeleted(id) {
      setTests(value => value.filter(test => test.id !== id));
      if (id === selected) selectReport("gallup");
    },
  } : null;
  const settings = formProps && form.target ? { ...formProps, target: form.target } : null;
  const loadingRequestedReport = loading && requested.startsWith("custom-") && selected !== requested;
  return <div className="identity-reports-page identity-report-workspace">
    {error && <Alert variant="destructive"><AlertTitle>Не удалось загрузить тесты</AlertTitle><AlertDescription>{error}</AlertDescription><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Повторить</Button></Alert>}
    {canManage && <AddFab triggerRef={addTrigger} actions={[{ label: "Добавить тест", disabled: loading || Boolean(error) || Boolean(settings?.open), onSelect: () => setForm({ opener: addTrigger.current, open: true }) }]} />}
    <IdentityReportNavigation tests={tests} selected={selected} onSelect={selectReport} onSettings={canManage ? openSettings : undefined} />
    {loadingRequestedReport ? <IdentityReportStatus mode="loading" /> : <SelectedIdentityReport client={client} key={selected} report={current}
      renderBuiltin={selected === "gallup" ? renderGallup : selected === "hogan" ? renderHogan : null}
      settings={settings?.target.id === selected ? settings : null} />}
    {settings && settings.target.id !== selected && <InactiveReportSettings key={settings.target.id} {...settings} client={client} />}
    {formProps && !form.target && <IdentityTestForm {...formProps} save={value => client.post("/identity/reports", value)} />}
  </div>;
}
