import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarRange,
  FileUp,
  MessageSquareQuote,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "@/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CareerContentError, useCareerContent } from "@/components/career-content";
import { PerformanceEditor } from "@/components/performance-editor";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERFORMANCE_CYCLES } from "@/data/performance-review";

const DEFAULT_PERFORMANCE_CONTENT = {
  heading: "Перфоманс в динамике",
  description: "Архив рабочих результатов и обратной связи: от продуктовых запусков до развития команды, платформы и стратегического влияния.",
  cycles: PERFORMANCE_CYCLES,
};

const cleanScore = (score = "") => score.replace(/[)]+$/u, "").trim();
const REVIEW_SCORE_LABELS = new Set(["Супер", "Выше ожиданий", "Соответствует ожиданиям", "Хорошо"]);
const normalizedScore = (score = "") => {
  const label = cleanScore(score);
  return REVIEW_SCORE_LABELS.has(label) ? label : "";
};

function scoreTone(score = "") {
  const value = normalizedScore(score).toLocaleLowerCase("ru-RU");
  if (/выше|супер/u.test(value)) return "excellent";
  if (/соответ|хорош/u.test(value)) return "good";
  if (/ниже|плохо/u.test(value)) return "attention";
  return "neutral";
}

function scoreVariant(score = "") {
  const tone = scoreTone(score);
  if (tone === "excellent") return "default";
  if (tone === "good") return "secondary";
  if (tone === "attention") return "destructive";
  return "outline";
}

function textParts(text = "", keyPrefix = "text") {
  const nodes = [];
  const tokenPattern = /(\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*]+\*\*)/gu;
  let cursor = 0;
  let match;
  let index = 0;
  const pushPlain = (value) => {
    value.split("\n").forEach((part, partIndex) => {
      if (partIndex) nodes.push(<br key={`${keyPrefix}-br-${index++}`} />);
      if (part) nodes.push(part);
    });
  };

  while ((match = tokenPattern.exec(text))) {
    pushPlain(text.slice(cursor, match.index));
    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/u);
    if (link) {
      nodes.push(
        <a
          className="font-medium text-foreground underline underline-offset-4"
          key={`${keyPrefix}-link-${index++}`}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
        >
          {link[1]}
          <ArrowUpRight className="ml-1 inline size-3" aria-hidden="true" />
        </a>,
      );
    } else {
      nodes.push(
        <strong className="font-semibold text-foreground" key={`${keyPrefix}-strong-${index++}`}>
          {token.slice(2, -2)}
        </strong>,
      );
    }
    cursor = match.index + token.length;
  }
  pushPlain(text.slice(cursor));
  return nodes;
}

function ReviewBlocks({ blocks = [] }) {
  if (!blocks.length) return null;
  return (
    <div className="flex flex-col gap-5 text-foreground">
      {blocks.map((block, index) => {
        if (block.type === "unordered-list" || block.type === "ordered-list") {
          const List = block.type === "ordered-list" ? "ol" : "ul";
          return (
            <List
              className={`m-0 flex flex-col gap-2 pl-5 ${block.type === "ordered-list" ? "list-decimal" : "list-disc"}`}
              key={`${block.type}-${index}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item.slice(0, 32)}-${itemIndex}`}>
                  {textParts(item, `${block.type}-${index}-${itemIndex}`)}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p className="m-0" key={`paragraph-${index}`}>
            {textParts(block.text, `paragraph-${index}`)}
          </p>
        );
      })}
    </div>
  );
}

function hasMeaningfulContent(blocks = []) {
  const text = blocks.flatMap((block) => block.items || block.text || []).join(" ").replace(/[\s.\-–—]/gu, "");
  return Boolean(text);
}

function Score({ children }) {
  const label = normalizedScore(children);
  if (!label) return null;
  return <Badge variant={scoreVariant(label)}>{label}</Badge>;
}

function ReviewerCard({ reviewer, interaction = false }) {
  const positive = interaction ? reviewer.comment : reviewer.positive;
  const showImprove = !interaction && hasMeaningfulContent(reviewer.improve);
  const initials = reviewer.name.split(/\s+/u).slice(0, 2).map((part) => part[0]).join("");

  return (
    <article className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="truncate">{reviewer.name}</CardTitle>
            {reviewer.role && <CardDescription className="truncate">{reviewer.role}</CardDescription>}
          </div>
        </div>
        <Score>{reviewer.score}</Score>
      </header>
      <div className="flex flex-col gap-4">
        <ReviewBlocks blocks={positive} />
        {showImprove && (
          <Alert role="note">
            <AlertTitle>Что можно улучшить</AlertTitle>
            <AlertDescription>
              <ReviewBlocks blocks={reviewer.improve} />
            </AlertDescription>
          </Alert>
        )}
      </div>
    </article>
  );
}

function leadingScore(reviewers = []) {
  const counts = new Map();
  reviewers.forEach(({ score }) => {
    const label = normalizedScore(score);
    if (label) counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function feedbackNoun(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "отзывов";
  if (last === 1) return "отзыв";
  if (last >= 2 && last <= 4) return "отзыва";
  return "отзывов";
}

function ProjectAccordion({ projects }) {
  return (
    <Card className="min-w-0">
      <CardContent>
        <Accordion defaultValue={projects[0]?.id ? [projects[0].id] : []}>
          {projects.map((project) => {
            const score = leadingScore(project.reviewers);
            return (
              <AccordionItem key={project.id} value={project.id}>
                <AccordionTrigger className="w-full min-w-0 hover:no-underline">
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-2 pr-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex w-full min-w-0 flex-col gap-1 sm:flex-1">
                      <div className="truncate text-lg font-medium leading-7 text-foreground">{project.title}</div>
                      <div className="whitespace-nowrap text-xs font-normal text-muted-foreground">
                        {project.reviewers.length
                          ? `${project.reviewers.length} ${feedbackNoun(project.reviewers.length)}`
                          : "Самооценка"}
                      </div>
                    </div>
                    <Score>{score}</Score>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pt-2">
                    <div className="divide-y">
                      {project.sections.map((section) => (
                        <section className="flex max-w-none flex-col gap-3 py-5 first:pt-2" key={section.label}>
                          <h3 className="m-0 scroll-m-20 text-lg leading-7 font-semibold tracking-tight text-foreground">
                            {section.label}
                          </h3>
                          <ReviewBlocks blocks={section.blocks} />
                        </section>
                      ))}
                    </div>

                    {project.reviewers.length > 0 && (
                      <section className="flex max-w-none flex-col gap-4 border-t pt-5">
                        <header className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <MessageSquareQuote className="size-4 text-muted-foreground" aria-hidden="true" />
                            <h3 className="m-0 text-base leading-6 font-semibold tracking-tight text-foreground">Обратная связь</h3>
                          </div>
                          <p className="m-0 text-muted-foreground">Оценки и комментарии коллег по этому результату.</p>
                        </header>
                        <div className="divide-y">
                          {project.reviewers.map((reviewer, reviewerIndex) => (
                            <ReviewerCard key={`${reviewer.name}-${reviewerIndex}`} reviewer={reviewer} />
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function cycleStats(cycle) {
  const projectFeedback = cycle.projects.reduce((sum, project) => sum + project.reviewers.length, 0);
  const feedback = projectFeedback + cycle.interaction.length;
  const excellent = [
    ...cycle.projects.flatMap((project) => project.reviewers),
    ...cycle.interaction,
  ].filter((reviewer) => scoreTone(reviewer.score) === "excellent").length;
  return { feedback, excellent };
}

function MetricCard({ value, label }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 py-1">
      <div className="font-heading text-2xl leading-snug font-medium tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

const PERFORMANCE_SEASON_RANK = new Map([["Зима", 4], ["Осень", 3], ["Лето", 2], ["Весна", 1]]);

function orderPerformanceCycles(cycles) {
  return [...cycles].sort((left, right) => (
    right.year - left.year
    || (PERFORMANCE_SEASON_RANK.get(right.season) || 0) - (PERFORMANCE_SEASON_RANK.get(left.season) || 0)
  ));
}

export function PerformanceReview() {
  const [activeCycleId, setActiveCycleId] = useState(PERFORMANCE_CYCLES[0]?.id || "");
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);
  const fileInputRef = useRef(null);
  const careerContent = useCareerContent("performance", DEFAULT_PERFORMANCE_CONTENT);
  const performanceContent = careerContent.content && Array.isArray(careerContent.content.cycles)
    ? careerContent.content
    : DEFAULT_PERFORMANCE_CONTENT;
  const cycles = performanceContent.cycles;
  const activeCycle = cycles.find((cycle) => cycle.id === activeCycleId) || cycles[0];

  useEffect(() => {
    if (activeCycle && activeCycle.id !== activeCycleId) setActiveCycleId(activeCycle.id);
    if (!activeCycle && activeCycleId) setActiveCycleId("");
  }, [activeCycle, activeCycleId]);

  const totals = useMemo(() => {
    const projects = cycles.reduce((sum, cycle) => sum + cycle.projects.length, 0);
    const feedback = cycles.reduce((sum, cycle) => sum + cycleStats(cycle).feedback, 0);
    return { projects, feedback };
  }, [cycles]);

  const stats = activeCycle ? cycleStats(activeCycle) : { feedback: 0, excellent: 0 };

  const importPdf = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || importing || deleting) return;
    if (cycles.length >= 30) {
      setActionFeedback({ tone: "error", message: "Можно хранить не больше 30 циклов ревью. Удалите ненужный цикл и повторите импорт." });
      return;
    }
    if (file.type && file.type !== "application/pdf") {
      setActionFeedback({ tone: "error", message: "Выберите PDF-файл." });
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setActionFeedback({ tone: "error", message: "PDF должен быть не больше 12 МБ." });
      return;
    }
    setImporting(true);
    setActionFeedback(null);
    try {
      const result = await api.importPerformanceReviewPdf(file);
      const nextContent = {
        ...performanceContent,
        cycles: orderPerformanceCycles([...cycles, result.cycle]),
      };
      await careerContent.save(nextContent);
      setActiveCycleId(result.cycle.id);
      setActionFeedback({
        tone: "success",
        message: result.warnings?.[0]
          ? `PDF импортирован. ${result.warnings[0]}`
          : `Цикл «${result.cycle.season} ${result.cycle.year}» импортирован из PDF.`,
      });
    } catch (error) {
      setActionFeedback({ tone: "error", message: error.message });
    } finally {
      setImporting(false);
    }
  };

  const deleteActiveCycle = async () => {
    if (!activeCycle || deleting || importing || careerContent.loading) return;
    const activeIndex = cycles.findIndex((cycle) => cycle.id === activeCycle.id);
    const remainingCycles = cycles.filter((cycle) => cycle.id !== activeCycle.id);
    const nextCycle = remainingCycles[Math.min(activeIndex, remainingCycles.length - 1)] || null;
    setDeleting(true);
    setActionFeedback(null);
    try {
      await careerContent.save({ ...performanceContent, cycles: remainingCycles });
      setActiveCycleId(nextCycle?.id || "");
      setDeleteOpen(false);
      setActionFeedback({ tone: "success", message: `Цикл «${activeCycle.season} ${activeCycle.year}» удалён.` });
    } catch (error) {
      setActionFeedback({ tone: "error", message: error.message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="not-typeset rollapp-body mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-8 pb-12">
      <header className="flex min-h-12 w-full items-center justify-center">
        <div className="page-actions wishes-page__hero-actions flex flex-wrap justify-center gap-2" role="group" aria-label="Действия с перфоманс-ревью">
          <Button
            className="h-12 min-w-[180px] px-6 text-base max-[560px]:min-w-0"
            shape="pill"
            type="button"
            disabled={!activeCycle || careerContent.loading || importing || deleting}
            onClick={() => setEditorOpen(true)}
          >
            {careerContent.loading && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {careerContent.loading ? "Загружаем" : "Редактировать"}
          </Button>
          <Button
            className="h-12 px-5 text-base"
            shape="pill"
            variant="outline"
            type="button"
            disabled={careerContent.loading || importing || deleting}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {importing ? "Разбираем PDF" : "Импортировать PDF"}
          </Button>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Импортировать перфоманс-ревью из PDF"
            onChange={importPdf}
          />
        </div>
      </header>
      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />
      {actionFeedback && (
        <Alert variant={actionFeedback.tone === "error" ? "destructive" : "default"}>
          <AlertTitle>{actionFeedback.tone === "error" ? "Не удалось выполнить действие" : "Готово"}</AlertTitle>
          <AlertDescription>{actionFeedback.message}</AlertDescription>
        </Alert>
      )}
      <header className="flex flex-col gap-4">
        <Badge variant="secondary"><Sparkles data-icon="inline-start" aria-hidden="true" />История результатов</Badge>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 scroll-m-24 text-3xl leading-9 font-semibold tracking-tight">{performanceContent.heading}</h1>
          <p className="m-0 text-muted-foreground sm:text-balance">
            {performanceContent.description}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard value={cycles.length} label="циклов ревью" />
          <MetricCard value={totals.projects} label="результат" />
          <MetricCard value={totals.feedback} label="отзывов коллег" />
        </div>
      </header>

      <Separator />

      {activeCycle ? <Tabs className="min-w-0 gap-6" value={activeCycle.id} onValueChange={setActiveCycleId}>
        <div className="flex min-w-0 items-center gap-2">
          <TabsList
            className="w-full max-w-full justify-start overflow-x-auto group-data-horizontal/tabs:h-auto"
            aria-label="Циклы перфоманс-ревью"
          >
            {cycles.map((cycle) => (
              <TabsTrigger className="min-w-max" key={cycle.id} value={cycle.id}>
                <CalendarRange data-icon="inline-start" aria-hidden="true" />
                {cycle.season} {cycle.year}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button
            className="size-12 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            variant="ghost"
            size="icon"
            type="button"
            aria-label={`Удалить цикл «${activeCycle.season} ${activeCycle.year}»`}
            title="Удалить выбранный цикл"
            disabled={careerContent.loading || importing || deleting}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>

        <TabsContent className="flex min-w-0 flex-col gap-6" value={activeCycle.id}>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="m-0 scroll-m-20 text-lg leading-7 font-semibold tracking-tight">Ключевые результаты</h2>
              </CardTitle>
              <CardDescription>
                Самооценка, подтверждённые результаты и комментарии ревьюеров за период {activeCycle.season.toLocaleLowerCase("ru-RU")} {activeCycle.year}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard value={activeCycle.projects.length} label="направлений" />
                <MetricCard value={stats.feedback} label="отзывов" />
                <MetricCard value={stats.excellent} label="высоких оценок" />
              </div>
            </CardContent>
          </Card>

          <ProjectAccordion key={activeCycle.id} projects={activeCycle.projects} />

          {activeCycle.interaction.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="m-0 scroll-m-20 text-lg leading-7 font-semibold tracking-tight">Качество взаимодействия</h2>
                </CardTitle>
                <CardDescription>
                  {activeCycle.interaction.length} комментариев о коммуникации, лидерстве и совместной работе.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {activeCycle.interaction.map((reviewer, index) => (
                    <ReviewerCard key={`${reviewer.name}-${index}`} reviewer={reviewer} interaction />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs> : (
        <Card>
          <CardHeader>
            <CardTitle>Циклов ревью пока нет</CardTitle>
            <CardDescription>Импортируйте PDF, и его проекты, результаты и отзывы появятся на этой странице.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" type="button" disabled={importing} onClick={() => fileInputRef.current?.click()}>
              <FileUp data-icon="inline-start" aria-hidden="true" />
              Выбрать PDF
            </Button>
          </CardContent>
        </Card>
      )}
      {activeCycle && <PerformanceEditor
        activeCycleId={activeCycle.id}
        content={performanceContent}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={careerContent.save}
      />}
      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить цикл ревью?</AlertDialogTitle>
            <AlertDialogDescription>
              Цикл «{activeCycle?.season} {activeCycle?.year}» вместе со всеми проектами и отзывами будет удалён без возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting || importing || careerContent.loading} onClick={deleteActiveCycle}>
              {deleting && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {deleting ? "Удаляем" : "Удалить цикл"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
