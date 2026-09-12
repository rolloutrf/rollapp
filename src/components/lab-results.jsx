import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Check, CheckCircle2, FileUp, RotateCcw, Trash2,
} from "lucide-react";
import { api } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card, CardAction, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useSphereSharing } from "@/lib/sphere-sharing";

const STATUS_LABELS = {
  normal: "В норме",
  low: "Ниже нормы",
  high: "Выше нормы",
  info: "Определено",
};

const MAX_PDF_BYTES = 12 * 1024 * 1024;

function sortReports(reports) {
  return [...reports].sort((left, right) => (
    String(right.date || "").localeCompare(String(left.date || ""))
    || ((right.source?.uploadedAt ? Date.parse(right.source.uploadedAt) : 0)
      - (left.source?.uploadedAt ? Date.parse(left.source.uploadedAt) : 0))
  ));
}

function ResultItem({ item }) {
  const result = item.variants?.[0] || item;
  const needsAttention = result.status === "low" || result.status === "high";
  return (
    <li className="min-w-0">
      <Card size="sm" className={cn("h-full min-w-0", needsAttention && "border-destructive/30 bg-destructive/5")}>
        <CardHeader>
          <CardTitle className="text-sm">{item.name}</CardTitle>
          {item.code && <CardAction className="text-xs font-medium text-muted-foreground">{item.code}</CardAction>}
        </CardHeader>
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
              <strong className="min-w-0 break-words text-xl font-medium tracking-tight tabular-nums">{result.value}</strong>
              {result.unit && <span className="text-xs text-muted-foreground">{result.unit}</span>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {result.reference ? `Референс ${result.reference}` : "Референс не указан"}
              </span>
              <Badge variant={needsAttention ? "destructive" : "secondary"}>
                {result.status === "normal" && <Check data-icon="inline-start" aria-hidden="true" />}
                {STATUS_LABELS[result.status]}
              </Badge>
            </div>
            {result.secondary && <p className="m-0! text-xs! leading-4! text-muted-foreground!">{result.secondary}</p>}
            {result.note && <p className="m-0! text-xs! leading-4! text-muted-foreground!">{result.note}</p>}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function ReportGroup({ group }) {
  const countLabel = group.items.length === 1 ? "показатель" : group.items.length < 5 ? "показателя" : "показателей";
  return (
    <AccordionItem className="not-last:data-open:border-b-0 [&>h2]:m-0" value={group.id}>
      <AccordionTrigger
        className="w-full min-w-0 items-center py-4 hover:no-underline"
        headerAs="h2"
      >
        <span className="flex min-w-0 flex-1 items-center gap-3 pr-3">
          <span className="min-w-0 flex-1 truncate text-left text-3xl leading-9 font-semibold tracking-tight">
            {group.title}
          </span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
            {group.items.length} {countLabel}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-0">
        <ul className="m-0 grid list-none gap-2 px-px sm:grid-cols-2">
          {group.items.map((item, index) => <ResultItem key={`${item.name}-${index}`} item={item} />)}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
}

function LabReportPanel({ report }) {
  return (
    <div>
      <Accordion defaultValue={report.groups[0]?.id ? [report.groups[0].id] : []}>
        {report.groups.map((group) => <ReportGroup key={group.id} group={group} />)}
      </Accordion>
    </div>
  );
}

export function LabResults() {
  const { readOnly } = useSphereSharing();
  const fileInputRef = useRef(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [requestState, setRequestState] = useState({ loading: true, data: null, error: null });
  const [selectedReportId, setSelectedReportId] = useState("");
  const [uploadState, setUploadState] = useState({ loading: false, error: "", success: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteState, setDeleteState] = useState({ busy: false, error: "" });
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  useEffect(() => {
    let current = true;
    setRequestState((state) => ({ ...state, loading: true, error: null }));
    api.get("/health/lab-results").then((data) => {
      if (!current) return;
      setRequestState({ loading: false, data, error: null });
      setSelectedReportId((id) => data.reports?.some((report) => report.id === id) ? id : data.reports?.[0]?.id || "");
    }).catch((error) => {
      if (current) setRequestState({ loading: false, data: null, error });
    });
    return () => { current = false; };
  }, [requestVersion]);

  async function uploadPdf(file) {
    if (!file || deleteState.busy) return;
    if (!(file.type === "application/pdf" || file.name.toLocaleLowerCase("ru-RU").endsWith(".pdf"))) {
      setUploadState({ loading: false, error: "Выберите файл в формате PDF.", success: "" });
      return;
    }
    if (!file.size || file.size > MAX_PDF_BYTES) {
      setUploadState({ loading: false, error: "PDF должен быть не больше 12 МБ.", success: "" });
      return;
    }

    setUploadState({ loading: true, error: "", success: "" });
    try {
      const { report, reports: responseReports } = await api.uploadLabPdf(file);
      setRequestState((state) => ({
        ...state,
        data: {
          ...state.data,
          reports: responseReports
            ? sortReports(responseReports)
            : sortReports([report, ...(state.data?.reports || []).filter((item) => item.id !== report.id)]),
        },
      }));
      setSelectedReportId(report.id);
      setUploadState({ loading: false, error: "", success: `«${file.name}» добавлен в историю анализов.` });
    } catch (error) {
      setUploadState({ loading: false, error: error.message, success: "" });
    }
  }

  function handleFileChange(event) {
    const [file] = event.target.files || [];
    event.target.value = "";
    void uploadPdf(file);
  }

  function handlePdfDrop(event) {
    event.preventDefault();
    setIsDraggingPdf(false);
    if (uploadState.loading || deleteState.busy) return;
    const [file] = event.dataTransfer.files || [];
    void uploadPdf(file);
  }

  function requestDeleteReport(report) {
    setUploadState({ loading: false, error: "", success: "" });
    setDeleteState({ busy: false, error: "" });
    setDeleteTarget(report);
  }

  async function deleteReport() {
    if (!deleteTarget || deleteState.busy) return;
    const targetId = deleteTarget.id;
    const currentReports = requestState.data?.reports || [];
    const deletedIndex = Math.max(0, currentReports.findIndex((report) => report.id === targetId));
    const applyResponse = (response) => {
      const reports = sortReports(response.reports || []);
      const nextReport = reports[Math.min(deletedIndex, Math.max(0, reports.length - 1))] || null;
      setRequestState((state) => ({
        loading: false,
        error: null,
        data: { ...state.data, ...response, reports },
      }));
      setSelectedReportId(nextReport?.id || "");
      setUploadState({ loading: false, error: "", success: "" });
      setDeleteTarget(null);
      setDeleteState({ busy: false, error: "" });
    };
    setDeleteState({ busy: true, error: "" });
    try {
      applyResponse(await api.delete(`/health/lab-results/${encodeURIComponent(targetId)}`));
    } catch (error) {
      try {
        const refreshed = await api.get("/health/lab-results");
        if (!(refreshed.reports || []).some((report) => report.id === targetId)) {
          applyResponse(refreshed);
          return;
        }
      } catch {
        // Preserve the original mutation error when reconciliation is unavailable.
      }
      setDeleteState({ busy: false, error: error.message });
    }
  }

  if (requestState.loading) {
    return (
      <Card className="not-typeset rollapp-body mx-auto w-full max-w-(--layout-text-width)">
        <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center" aria-live="polite">
          <Spinner className="size-5" aria-label="Загружаем анализы" />
          <div className="flex flex-col gap-1">
            <div className="font-medium">Загружаем анализы</div>
            <div className="text-sm text-muted-foreground">Личные данные передаются только после проверки аккаунта.</div>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (requestState.error) {
    return (
      <Alert variant="destructive" className="not-typeset rollapp-body mx-auto max-w-(--layout-text-width)">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Не удалось загрузить анализы</AlertTitle>
        <AlertDescription>{requestState.error.message}</AlertDescription>
        <div className="col-start-2 flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" type="button" onClick={() => setRequestVersion((version) => version + 1)}>
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Повторить
          </Button>
        </div>
      </Alert>
    );
  }

  const reports = requestState.data?.reports || [];
  const selectedReport = reports.find((report) => report.id === selectedReportId) || reports[0] || null;

  return (
    <article className="not-typeset rollapp-body page-stack mx-auto w-full max-w-(--layout-collection-width)" aria-label="Анализы крови">
      {selectedReport && !readOnly && (
        <div className="page-actions w-full justify-center" role="group" aria-label="Действия с анализом">
          <Button
            className="min-h-12 shrink-0 rounded-full px-5"
            variant="destructive"
            size="lg"
            type="button"
            disabled={deleteState.busy || uploadState.loading}
            aria-label={`Удалить анализ от ${selectedReport.dateLabel}`}
            title="Удалить анализ"
            onClick={() => requestDeleteReport(selectedReport)}
          >
            Удалить
          </Button>
        </div>
      )}
      <section className="min-w-0 max-w-none">
        {selectedReport ? (
          <Tabs className="min-w-0" value={selectedReport.id} onValueChange={setSelectedReportId}>
            <TabsList className="h-auto! min-w-0 w-full flex-wrap gap-1" aria-label="Дата исследования">
              {reports.map((report, index) => (
                <TabsTrigger className="h-auto min-w-0 basis-48 flex-col items-start px-3! py-2.5! text-left whitespace-normal wrap-anywhere" key={report.id} value={report.id}>
                  <span className="w-full">{report.dateLabel}</span>
                  <span className="w-full text-xs font-normal text-muted-foreground">
                    {index === 0 ? "Последний" : (report.labs || [report.lab]).filter(Boolean).join(" · ")}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {reports.map((report) => (
              <TabsContent className="min-w-0" key={report.id} value={report.id}>
                <LabReportPanel report={report} />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <Card>
            <CardContent className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
              <FileUp className="size-6 text-muted-foreground" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <div className="font-medium">Анализов пока нет</div>
                <div className="text-sm text-muted-foreground">{readOnly ? "Владелец пока не добавил анализы." : "Добавьте PDF, чтобы показатели появились здесь."}</div>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="flex max-w-none flex-col gap-5">
        {!readOnly && <><Input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          aria-label="Загрузить PDF с результатами анализов"
          aria-describedby="lab-pdf-help"
          onChange={handleFileChange}
          disabled={uploadState.loading || deleteState.busy}
        />
        <Button
          className="h-auto min-h-40 w-full flex-col gap-2 border-dashed px-6 py-8 whitespace-normal data-[dragging=true]:border-primary data-[dragging=true]:bg-muted"
          variant="outline"
          type="button"
          data-dragging={isDraggingPdf || undefined}
          aria-describedby="lab-pdf-help"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!uploadState.loading && !deleteState.busy) setIsDraggingPdf(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsDraggingPdf(false);
          }}
          onDrop={handlePdfDrop}
          disabled={uploadState.loading || deleteState.busy}
        >
          {uploadState.loading ? <Spinner className="size-6" aria-hidden="true" /> : <FileUp className="size-7" aria-hidden="true" />}
          <span className="text-base font-medium">
            {uploadState.loading ? "Разбираем PDF" : isDraggingPdf ? "Отпустите PDF здесь" : "Перетащите PDF сюда"}
          </span>
          <span className="text-sm font-normal text-muted-foreground" id="lab-pdf-help">
            {uploadState.loading ? "Это может занять немного времени" : "или нажмите, чтобы выбрать файл до 12 МБ с выделяемым текстом"}
          </span>
        </Button></>}

        {!readOnly && uploadState.error && (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Не удалось добавить PDF</AlertTitle>
            <AlertDescription>{uploadState.error}</AlertDescription>
          </Alert>
        )}
        {!readOnly && uploadState.success && (
          <Alert aria-live="polite">
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Анализ добавлен</AlertTitle>
            <AlertDescription>{uploadState.success}</AlertDescription>
          </Alert>
        )}
      </section>

      {deleteTarget && !readOnly && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !deleteState.busy) {
              setDeleteTarget(null);
              setDeleteState({ busy: false, error: "" });
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить анализ от {deleteTarget.dateLabel}?</AlertDialogTitle>
              <AlertDialogDescription>
                Исследование и все прикреплённые к этой дате PDF будут удалены без возможности восстановления.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteState.error && (
              <Alert variant="destructive">
                <AlertTitle>Не удалось удалить анализ</AlertTitle>
                <AlertDescription>{deleteState.error}</AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteState.busy}>Отмена</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deleteState.busy}
                aria-busy={deleteState.busy || undefined}
                onClick={deleteReport}
              >
                {deleteState.busy ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </article>
  );
}
