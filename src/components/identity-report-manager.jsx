import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, FileUp, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { SphereBusinessControls } from "@/components/business-marketplace-page";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useSphereSharing } from "@/lib/sphere-sharing";

const MAX_PDF_BYTES = 12 * 1024 * 1024;

export function IdentityReportOverview({ titleId, eyebrow, title, description, date, dateLabel, person, stats = [] }) {
  return (
    <Card className="identity-report-overview not-typeset rollapp-body" aria-labelledby={titleId}>
      <CardHeader className="gap-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-semibold tracking-widest uppercase">{eyebrow}</span>
          {dateLabel && <time dateTime={date || undefined}>{dateLabel}</time>}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h2 id={titleId} className="m-0 font-heading text-3xl leading-9 font-semibold tracking-tight text-balance">{title}</h2>
          <p className="m-0 max-w-(--layout-text-width) text-pretty">{description}</p>
          {person && <span className="text-xs text-muted-foreground">{person}</span>}
        </div>
      </CardHeader>
      {stats.length > 0 && <CardFooter className="grid gap-4 sm:grid-cols-2" aria-label="Состав профиля">
        {stats.map((stat) => <div key={stat.label} className="flex min-w-0 items-center gap-3">
          <strong className="font-heading text-3xl leading-9 font-semibold tabular-nums">{stat.value}</strong>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-medium">{stat.label}</span>
            <span className="text-xs text-muted-foreground">{stat.detail}</span>
          </div>
        </div>)}
      </CardFooter>}
    </Card>
  );
}

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
  const canUpload = !readOnly && state.mode === "empty";
  const canDelete = !readOnly && (state.mode === "default" || state.mode === "generated");
  const uploadDisabled = busy || !canUpload;

  const upload = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (uploadDisabled || !files.length) return;
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
    if (busy || !canDelete) return;
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
    <section className="identity-report-manager not-typeset rollapp-body" aria-label={`Управление отчётом ${label}`}>
      {canUpload && <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf"
        aria-label={`Загрузить PDF для ${label}`}
        multiple
        disabled={uploadDisabled}
        onChange={upload}
      />}
      {!readOnly && <div className="identity-report-manager__actions horizontal-action-scroller">
        {canUpload ? (
          <Button type="button" className="min-h-12 px-6 text-base" size="lg" shape="pill" disabled={uploadDisabled} onClick={() => inputRef.current?.click()}>
            {busy && <Spinner data-icon="inline-start" />}
            Загрузить
          </Button>
        ) : (
          <Button type="button" className="min-h-12 px-6 text-base" size="lg" shape="pill" variant="destructive" disabled={busy} onClick={() => setDeleteOpen(true)}>
            {busy && <Spinner data-icon="inline-start" />}
            Удалить
          </Button>
        )}
        <SphereBusinessControls sphereId="identity" />
      </div>}
      {state.files?.length ? (
        <Card className="identity-report-files" aria-label="Исходные PDF">
          <CardHeader><span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Исходные PDF</span></CardHeader>
          <CardContent className="grid min-w-0 gap-2 sm:grid-cols-2">
            {state.files.map((file) => (
              <a key={file.id} href={file.pdfUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "h-auto min-w-0 justify-start gap-3 px-3 py-3 text-left whitespace-normal wrap-anywhere")}>
                <FileText className="size-5" aria-hidden="true" />
                <span className="min-w-0">{file.filename}</span>
              </a>
            ))}
          </CardContent>
        </Card>
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
    <Empty className="identity-report-empty not-typeset rollapp-body">
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
    return <div className="identity-report-loading not-typeset rollapp-body" role="status"><Spinner aria-hidden="true" /><span>Загружаем отчёт…</span></div>;
  }
  if (mode !== "error") return null;
  return (
    <Alert variant="destructive" className="identity-report-error not-typeset rollapp-body">
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
