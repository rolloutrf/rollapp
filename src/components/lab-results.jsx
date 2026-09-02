import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Check, CheckCircle2, ExternalLink, FileUp, RotateCcw,
} from "lucide-react";
import { api } from "@/api";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
            <div className="flex items-baseline gap-1.5">
              <strong className="text-xl font-medium tracking-tight tabular-nums">{result.value}</strong>
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
    <AccordionItem className="not-last:data-open:border-b-0" value={group.id}>
      <AccordionTrigger
        className="w-full min-w-0 items-center hover:no-underline"
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
      <AccordionContent>
        <ul className="grid list-none gap-2 px-px pt-2 sm:grid-cols-2">
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
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  useEffect(() => {
    let current = true;
    setRequestState((state) => ({ ...state, loading: true, error: null }));
    api.get("/health/lab-results").then((data) => {
      if (!current) return;
      setRequestState({ loading: false, data, error: null });
      setSelectedReportId((id) => id || data.reports?.[0]?.id || "");
    }).catch((error) => {
      if (current) setRequestState({ loading: false, data: null, error });
    });
    return () => { current = false; };
  }, [requestVersion]);

  async function uploadPdf(file) {
    if (!file) return;
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
    if (uploadState.loading) return;
    const [file] = event.dataTransfer.files || [];
    void uploadPdf(file);
  }

  if (requestState.loading) {
    return (
      <Card className="not-typeset rollapp-body mx-auto w-full max-w-3xl">
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
  if (requestState.error || !requestState.data?.reports?.length) {
    return (
      <Alert variant="destructive" className="not-typeset rollapp-body mx-auto max-w-3xl pr-32">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Не удалось загрузить анализы</AlertTitle>
        <AlertDescription>{requestState.error?.message || "В истории пока нет результатов."}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" type="button" onClick={() => setRequestVersion((version) => version + 1)}>
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Повторить
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const reports = requestState.data.reports;
  const selectedReport = reports.find((report) => report.id === selectedReportId) || reports[0];
  const selectedPdfSources = (selectedReport.sources || (selectedReport.source ? [selectedReport.source] : []))
    .filter((source, index, sources) => source.pdfUrl && sources.findIndex((item) => item.pdfUrl === source.pdfUrl) === index);

  return (
    <article className="not-typeset rollapp-body mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-8 pb-12" aria-label="Анализы крови">
      <section className="min-w-0 max-w-none">
        <Tabs className="min-w-0" value={selectedReport.id} onValueChange={setSelectedReportId}>
          <TabsList className="flex h-auto! w-full flex-nowrap gap-1 overflow-x-auto" aria-label="Дата исследования">
            {reports.map((report, index) => (
              <TabsTrigger className="h-auto! min-w-48 flex-1 shrink-0 flex-col items-start px-3! py-2.5! text-left" key={report.id} value={report.id}>
                <span className="w-full truncate">{report.dateLabel}</span>
                <span className="w-full truncate text-xs font-normal text-muted-foreground">
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
      </section>

      <section className="flex max-w-none flex-col gap-5">
        {!readOnly && <><Input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          aria-describedby="lab-pdf-help"
          onChange={handleFileChange}
          disabled={uploadState.loading}
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
            if (!uploadState.loading) setIsDraggingPdf(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsDraggingPdf(false);
          }}
          onDrop={handlePdfDrop}
          disabled={uploadState.loading}
        >
          {uploadState.loading ? <Spinner className="size-6" aria-hidden="true" /> : <FileUp className="size-7" aria-hidden="true" />}
          <span className="text-base font-medium">
            {uploadState.loading ? "Разбираем PDF" : isDraggingPdf ? "Отпустите PDF здесь" : "Перетащите PDF сюда"}
          </span>
          <span className="text-sm font-normal text-muted-foreground" id="lab-pdf-help">
            {uploadState.loading ? "Это может занять немного времени" : "или нажмите, чтобы выбрать файл до 12 МБ с выделяемым текстом"}
          </span>
        </Button></>}

        {selectedPdfSources.length ? (
          <div className="flex flex-wrap justify-end gap-2">
            {selectedPdfSources.map((source) => (
              <a
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 px-4 text-base")}
                href={source.pdfUrl}
                key={source.pdfUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink data-icon="inline-start" aria-hidden="true" />
                {selectedPdfSources.length > 1 ? source.filename || source.lab || "Открыть PDF" : "Открыть PDF"}
              </a>
            ))}
          </div>
        ) : null}

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
    </article>
  );
}
