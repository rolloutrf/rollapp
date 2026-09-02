import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, FileUp, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useSphereSharing } from "@/lib/sphere-sharing";

const MAX_PDF_BYTES = 12 * 1024 * 1024;

export function useIdentityReport(section) {
  const [state, setState] = useState({ mode: "loading", report: null, files: [], updatedAt: null });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setState(await api.get(`/identity/reports/${section}`));
    } catch (loadError) {
      setError(loadError.message);
      setState((current) => ({ ...current, mode: "error" }));
    }
  }, [section]);

  useEffect(() => { load(); }, [load]);
  return { state, setState, error, load };
}

export function IdentityReportControls({ section, label, state, setState, load }) {
  const { readOnly } = useSphereSharing();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const upload = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    if (files.length + (state.files?.length || 0) > 8) {
      toast.error("Для одного отчёта можно загрузить не больше 8 PDF");
      return;
    }
    const invalid = files.find((file) => (
      !file.name.toLocaleLowerCase("ru-RU").endsWith(".pdf")
      || (file.type && file.type !== "application/pdf")
      || file.size > MAX_PDF_BYTES
    ));
    if (invalid) {
      toast.error(invalid.size > MAX_PDF_BYTES ? "PDF должен быть не больше 12 МБ" : "Выберите PDF-файлы");
      return;
    }
    setBusy(true);
    let latest = null;
    try {
      for (const file of files) latest = await api.uploadIdentityReportPdf(section, file);
      if (latest) setState(latest);
      toast.success(files.length === 1 ? "PDF загружен, страница пересобрана" : "PDF загружены, страница пересобрана");
    } catch (uploadError) {
      await load();
      toast.error(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    setBusy(true);
    try {
      setState(await api.delete(`/identity/reports/${section}`));
      setDeleteOpen(false);
      toast.success(`Контент ${label} и загруженные PDF удалены`);
    } catch (deleteError) {
      toast.error(deleteError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="identity-report-manager not-typeset" aria-label={`Управление отчётом ${label}`}>
      {!readOnly && <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf"
        aria-label={`Загрузить PDF для ${label}`}
        multiple
        onChange={upload}
      />}
      {!readOnly && <div className="identity-report-manager__actions">
        <Button className="min-h-12 px-6 text-base" size="lg" shape="pill" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy && <Spinner data-icon="inline-start" />}
          {state.mode === "empty" ? "Загрузить PDF" : "Добавить PDF"}
        </Button>
        {state.mode !== "empty" && state.mode !== "loading" && state.mode !== "error" ? (
          <Button className="min-h-12 px-6 text-base" size="lg" shape="pill" variant="outline" disabled={busy} onClick={() => setDeleteOpen(true)}>
            Удалить весь контент
          </Button>
        ) : null}
      </div>}
      {state.files?.length ? (
        <div className="identity-report-manager__files" aria-label="Исходные PDF">
          <span>Исходные PDF</span>
          <div>
            {state.files.map((file) => (
              <a key={file.id} href={file.pdfUrl} target="_blank" rel="noreferrer">
                <FileText aria-hidden="true" />
                <span>{file.filename}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {!readOnly && <AlertDialog open={deleteOpen} onOpenChange={(open) => !busy && setDeleteOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить весь контент {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Сгенерированная страница и все загруженные PDF будут удалены. После этого раздел останется пустым до новой загрузки.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={removeAll}>
              {busy ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Удалить всё
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </section>
  );
}

export function IdentityReportEmpty({ label }) {
  const { readOnly } = useSphereSharing();
  return (
    <Empty className="identity-report-empty not-typeset">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileUp aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>Страница {label} пока пустая</EmptyTitle>
        <EmptyDescription>{readOnly ? "Владелец пока не добавил материалы в этот раздел." : "Загрузите один или несколько PDF — Rollapp извлечёт структуру отчёта и соберёт адаптивную страницу заново."}</EmptyDescription>
      </EmptyHeader>
      {!readOnly && <EmptyContent><p>До 8 файлов, каждый не больше 12 МБ.</p></EmptyContent>}
    </Empty>
  );
}

export function IdentityReportStatus({ mode, error, onRetry }) {
  if (mode === "loading") {
    return <div className="identity-report-loading not-typeset"><Spinner /><span>Загружаем отчёт…</span></div>;
  }
  if (mode !== "error") return null;
  return (
    <Alert variant="destructive" className="identity-report-error not-typeset">
      <AlertTitle>Не удалось загрузить отчёт</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
      <Button variant="outline" onClick={onRetry}><RotateCcw data-icon="inline-start" aria-hidden="true" />Повторить</Button>
    </Alert>
  );
}

export function IdentityGeneratedDocuments({ report }) {
  return (
    <section className="identity-generated-documents" aria-labelledby={`${report.section}-documents-title`}>
      <header className="identity-generated-documents__header">
        <span>Содержание PDF</span>
        <h3 id={`${report.section}-documents-title`}>Сгенерированный веб-документ</h3>
        <p>Текст очищен от разрывов страниц и собран в смысловые разделы. Исходники доступны выше.</p>
      </header>
      <div className="identity-generated-documents__list">
        {(report.documents || []).map((document) => (
          <article key={document.id} className="identity-generated-document typeset-document">
            <header>
              <span>PDF · {document.filename}</span>
              <h3>{document.title}</h3>
            </header>
            {(document.sections || []).map((section, sectionIndex) => (
              <section key={`${section.title}-${sectionIndex}`}>
                <h4>{section.title}</h4>
                {section.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={`${paragraph.slice(0, 60)}-${paragraphIndex}`}>{paragraph}</p>
                ))}
              </section>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
