import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FileText, FileUp, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { SphereBusinessControls } from "@/components/business-marketplace-page";
import { PageActionButton } from "@/components/page-action-button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

export function useIdentityReport(section, client = api) {
  const [state, setState] = useState({ mode: "loading", report: null, files: [], updatedAt: null });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setState(await client.get(`/identity/reports/${section}`));
    } catch (loadError) {
      setError(loadError.message);
      setState((current) => ({ ...current, mode: "error" }));
    }
  }, [section, client]);

  useEffect(() => { load(); }, [load]);
  return { state, setState, error, load };
}

export function IdentityReportControls({ section, label, state, setState, load, navigation, onEditTest, client = api }) {
  const { readOnly } = useSphereSharing();
  const uploadId = useId();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(null);
  const canUpload = !readOnly && (state.files?.length || 0) < 8;
  const canDelete = !readOnly && (state.files?.length || 0) > 0;
  const uploadDisabled = busy || !canUpload || state.mode === "loading" || state.mode === "error";

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
      for (const file of files) latest = await client.uploadIdentityReportPdf(section, file);
      if (latest) setState(latest);
      toast.success(files.length === 1 ? "PDF загружен" : "PDF загружены");
    } catch (uploadError) {
      await load();
      toast.error(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async (file) => {
    if (busy || !canDelete) return;
    setBusy(true);
    try {
      setState(await client.delete(`/identity/reports/${section}/files/${file.id}`));
      setDeleteOpen(null);
      toast.success(`PDF «${file.filename}» удалён`);
    } catch (deleteError) {
      toast.error(deleteError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="identity-report-manager not-typeset rollapp-body" aria-label={`Управление отчётом ${label}`}>
      {!readOnly && <div className="identity-report-manager__actions horizontal-action-scroller">
        {onEditTest && <PageActionButton type="button" variant="outline" disabled={busy} onClick={onEditTest}>Настройки теста</PageActionButton>}
        <SphereBusinessControls sphereId="identity" />
      </div>}
      {typeof navigation === "function" ? navigation({ busy }) : navigation}
      {!readOnly && <Field className="min-w-0">
        <FieldLabel className="min-w-0 wrap-anywhere" htmlFor={uploadId}>Загрузить PDF для {label}</FieldLabel>
        <Input id={uploadId} type="file" accept="application/pdf,.pdf" multiple disabled={uploadDisabled} onChange={upload} aria-describedby={`${uploadId}-help`} />
        <FieldDescription id={`${uploadId}-help`} className="text-xs">
          {busy ? <span className="inline-flex items-center gap-2" role="status"><Spinner aria-hidden="true" />Загружаем PDF…</span> : "До 8 файлов, каждый не больше 12 МБ. Можно выбрать несколько PDF."}
        </FieldDescription>
      </Field>}
      {state.files?.length ? (
        <section className="identity-report-files flex min-w-0 flex-col gap-3" aria-label="Исходные PDF">
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Исходные PDF</span>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {state.files.map((file) => (
              <div key={file.id} className="flex min-w-0 items-center gap-2">
                <a href={file.pdfUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "ghost" }), "h-auto min-w-0 flex-1 justify-start gap-3 px-3 py-3 text-left whitespace-normal wrap-anywhere")}>
                  <FileText className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">{file.filename}</span>
                </a>
                {!readOnly && <Button type="button" size="icon" variant="destructive" className="size-12 shrink-0" disabled={busy} aria-label={`Удалить PDF ${file.filename}`} onClick={() => setDeleteOpen(file)}><Trash2 aria-hidden="true" /></Button>}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!readOnly && <AlertDialog open={Boolean(deleteOpen)} onOpenChange={(open) => !busy && !open && setDeleteOpen(null)}>
        <AlertDialogContent className="overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="wrap-anywhere">Удалить PDF «{deleteOpen?.filename}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Файл и извлечённое из него содержимое будут удалены из отчёта.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => removeFile(deleteOpen)}>
              {busy ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Удалить
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
    <Empty className="identity-report-empty not-typeset rollapp-body wrap-anywhere">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileUp aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>Страница {label} пока пустая</EmptyTitle>
        <EmptyDescription>{readOnly ? "Владелец пока не добавил материалы в этот раздел." : "Загрузите один или несколько PDF — здесь появится извлечённый из них текст."}</EmptyDescription>
      </EmptyHeader>
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
  const prefix = useId();
  const chartReveal = useRef(0);
  useEffect(() => () => cancelAnimationFrame(chartReveal.current), []);
  const chartNames = { "score-chart": "Шкалы", "subscale-charts": "Субшкалы" };
  const chartLinks = (report.documents || []).flatMap((document, documentIndex) => {
    const seen = new Set();
    return (document.layout?.pages || []).flatMap((page, pageIndex) => page.blocks.flatMap((block, blockIndex) => {
      if (!chartNames[block.type] || seen.has(block.type)) return [];
      seen.add(block.type);
      return [{ id: `${prefix}-${documentIndex}-${pageIndex}-${blockIndex}`, label: chartNames[block.type], filename: document.filename, documentIndex }];
    }));
  });
  return (
    <section className="identity-generated-documents identity-report" aria-label="Содержание загруженных PDF">
      {chartLinks.length > 0 && <nav className="grid min-w-0 gap-4 not-typeset rollapp-body" aria-label="Графики отчёта">
        {[...new Set(chartLinks.map(link => link.documentIndex))].map(documentIndex => <div key={documentIndex} className="grid min-w-0 gap-2">
          {new Set(chartLinks.map(link => link.documentIndex)).size > 1 && <span className="text-xs text-muted-foreground wrap-anywhere">{report.documents[documentIndex].filename}</span>}
          <div className="flex min-w-0 flex-wrap gap-2">
            {chartLinks.filter(link => link.documentIndex === documentIndex).map((link) => <PageActionButton key={link.id} variant="secondary" nativeButton={false} role="link" render={<a href={`#${link.id}`} />} aria-label={`${link.label} — ${link.filename}`} onClick={event => {
              if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
              const target = event.currentTarget.ownerDocument.getElementById(link.id);
              // Cancel an in-flight focus scroll before the native fragment
              // navigation. The href and browser history keep their semantics.
              target?.focus({ preventScroll: true });
              target?.scrollIntoView({ block: "start", behavior: "instant" });
              cancelAnimationFrame(chartReveal.current);
              chartReveal.current = requestAnimationFrame(() => {
                chartReveal.current = requestAnimationFrame(() => {
                  chartReveal.current = 0;
                  // Native focus/fragment normalization can finish after click.
                  // Keep this correction tied to the same active destination.
                  if (target?.isConnected && target.ownerDocument.activeElement === target && location.hash === `#${target.id}`) target.scrollIntoView({ block: "start", behavior: "instant" });
                });
              });
            }}>
              {link.label}
            </PageActionButton>)}
          </div>
        </div>)}
      </nav>}
      <div className="identity-generated-documents__list">
        {(report.documents || []).map((document, documentIndex) => (
          <article key={document.id} className="identity-generated-document typeset-document">
            <header className="flex min-w-0 items-center gap-3 not-typeset">
                <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <h2 className="min-w-0 font-heading text-lg font-semibold wrap-anywhere">{document.filename}</h2>
            </header>
            <div className="identity-pdf-content typeset typeset-rollapp" data-typeset-group>
                {document.layout?.pages?.length ? document.layout.pages.map((page, pageIndex) => (
                  <section key={page.number} className="identity-pdf-page" data-pdf-page={page.number} data-pdf-wide={page.blocks.some((block) => block.type === "subscale-charts" || block.headers?.length === 3) || undefined}>
                    <IdentityPdfBlocks blocks={page.blocks} idPrefix={`${prefix}-${documentIndex}-${pageIndex}`} />
                  </section>
                )) : document.rawLines?.length ? (
                  <p className="whitespace-pre-wrap">{document.rawLines.join("\n")}</p>
                ) : <p role="status">Текст исходного PDF недоступен.</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function IdentityPdfBlocks({ blocks, idPrefix }) {
  return blocks.map((block, index) => {
    if (block.type === "heading") {
      const Heading = block.level === 3 ? "h3" : block.level === 5 ? "h5" : block.level === 6 ? "h6" : "h4";
      return <Heading key={index} data-typography={block.level === 6 ? "label" : undefined}><IdentityPdfInline text={block.text} runs={block.runs} /></Heading>;
    }
    if (block.type === "label") return <p key={index} data-typography="label" style={{ color: block.color }}>{block.text}</p>;
    if (block.type === "list") {
      const List = block.ordered ? "ol" : "ul";
      return <List key={index} className={block.plain ? "identity-pdf-lines" : undefined} start={block.ordered ? block.items[0]?.number : undefined}>
        {block.items.map((item, itemIndex) => <li key={itemIndex} value={block.ordered ? item.number : undefined}><IdentityPdfInline text={item.text} runs={item.runs} /></li>)}
      </List>;
    }
    if (block.type === "table") {
      const descriptive = block.headers?.length === 3;
      return <table key={index} className={cn("w-full", descriptive && "identity-pdf-scale-table")}>
        {block.headers && <thead><tr>{block.headers.map((header, headerIndex) => <th key={headerIndex} scope="col" data-typography="label">{header}</th>)}</tr></thead>}
        <tbody>{block.rows.map((row, rowIndex) => row.length === 1 ? <tr key={rowIndex} className="identity-pdf-table-group">
          <th colSpan={block.headers?.length || 2}><h4>{row[0]}</h4></th>
        </tr> : <tr key={rowIndex}>
          <th scope="row" className={descriptive ? undefined : "font-normal"}>{row[0]}</th>
          <td className="w-1 whitespace-nowrap text-right! tabular-nums">{row[1]}</td>
          {row.length > 2 && <td>{row[2]}</td>}
        </tr>)}</tbody>
      </table>;
    }
    if (block.type === "score-chart") {
      return <div key={index} id={idPrefix && `${idPrefix}-${index}`} data-report-chart-target tabIndex={-1} className="identity-pdf-scores not-typeset rollapp-body">
        {block.rows.map((row, rowIndex) => <div key={rowIndex} className="identity-pdf-score">
          <span>{row.label}</span>
          <span className="identity-pdf-score__value tabular-nums">{row.value}</span>
          <div className="identity-pdf-score__track" role="img" aria-label={`${row.label}: ${row.value}`}>
            <div style={{ width: `${Number(row.value)}%`, backgroundColor: row.color }} />
          </div>
        </div>)}
      </div>;
    }
    if (block.type === "rank-chart") {
      const rank = block.cells.findIndex((color) => sourceCellColor(color)) + 1;
      return <div key={index} className="identity-pdf-rank not-typeset" role="img" aria-label={`${rank} / ${block.cells.length}`}>
        {block.cells.map((color, cellIndex) => <span key={cellIndex} style={sourceCellColor(color) ? { backgroundColor: color } : undefined} />)}
      </div>;
    }
    if (block.type === "source-emphasis") {
      return <div key={index} className="identity-pdf-source-emphasis" data-typeset-group style={{ borderColor: block.color }}><IdentityPdfBlocks blocks={block.blocks} /></div>;
    }
    if (block.type === "subscale-charts") {
      return <div key={index} id={idPrefix && `${idPrefix}-${index}`} data-report-chart-target tabIndex={-1} className="identity-pdf-subscale-columns">
        {block.columns.map((column) => <section key={column.code} className="identity-pdf-subscale-column">
          <header><h4>{column.code}</h4><p data-typography="caption">{column.title}</p></header>
          {column.sections.map((section, sectionIndex) => <section key={sectionIndex} className="identity-pdf-subscale-section">
            {section.title && <h5>{section.title}</h5>}
            <div className="identity-pdf-subscales not-typeset rollapp-body">
              {section.rows.map((row, rowIndex) => {
                const active = row.cells.filter((color) => sourceCellColor(color)).length;
                return <div key={rowIndex} className="identity-pdf-subscale">
                  <span>{row.label}</span>
                  <span className="identity-pdf-subscale__cells" role="img" aria-label={`${row.label}: ${active} / ${row.cells.length}`}>
                    {row.cells.map((color, cellIndex) => <span key={cellIndex} style={sourceCellColor(color) ? { backgroundColor: color } : undefined} />)}
                  </span>
                </div>;
              })}
            </div>
          </section>)}
        </section>)}
      </div>;
    }
    return <p key={index} data-typography={block.type === "caption" ? "caption" : undefined}><IdentityPdfInline text={block.text} runs={block.runs} /></p>;
  });
}

function IdentityPdfInline({ text, runs }) {
  return runs?.length ? runs.map((run, index) => {
    let content = run.superscript ? <sup>{run.text}</sup> : run.text;
    content = run.italic ? <em>{content}</em> : content;
    return run.bold ? <strong key={index}>{content}</strong> : <span key={index}>{content}</span>;
  }) : text;
}

function sourceCellColor(color) {
  const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  return Math.max(...channels) - Math.min(...channels) > 40;
}
