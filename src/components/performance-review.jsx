import { PageActionButton } from "@/components/page-action-button";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  FileUp,
  MessageSquareQuote,
} from "lucide-react";
import { api } from "@/api";
import { SphereBusinessControls } from "@/components/business-marketplace-page";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CareerContentError, useCareerContent } from "@/components/career-content";
import { PerformanceEditor } from "@/components/performance-editor";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERFORMANCE_CYCLES } from "@/data/performance-review";
import { useSphereSharing } from "@/lib/sphere-sharing";

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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h3 className="m-0 font-medium wrap-anywhere">{reviewer.name}</h3>
            {reviewer.role && <p className="m-0 text-muted-foreground wrap-anywhere">{reviewer.role}</p>}
          </div>
        </div>
        <Score>{reviewer.score}</Score>
      </header>
      <div className="flex flex-col gap-4">
        <ReviewBlocks blocks={positive} />
        {showImprove && (
          <section className="flex min-w-0 flex-col gap-3" aria-label="Что можно улучшить">
            <h4 className="m-0 font-medium">Что можно улучшить</h4>
            <ReviewBlocks blocks={reviewer.improve} />
          </section>
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
  const { readOnly } = useSphereSharing();
  const [activeCycleId, setActiveCycleId] = useState(PERFORMANCE_CYCLES[0]?.id || "");
  const [editorOpen, setEditorOpen] = useState(false);
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
      setEditorOpen(false);
      setActionFeedback({ tone: "success", message: `Цикл «${activeCycle.season} ${activeCycle.year}» удалён.` });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="not-typeset rollapp-body career-content-rail page-stack">
      {!readOnly && <header className="flex min-h-12 w-full items-center justify-center">
        <div className="page-actions horizontal-action-scroller" role="group" aria-label="Действия с перфоманс-ревью">
          <PageActionButton
            className="shrink-0 min-w-[180px] max-[560px]:min-w-0"
            type="button"
            disabled={!activeCycle || careerContent.loading || importing || deleting}
            onClick={() => setEditorOpen(true)}
          >
            {careerContent.loading && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {careerContent.loading ? "Загружаем" : "Редактировать"}
          </PageActionButton>
          <PageActionButton
            className="shrink-0"
            variant="outline"
            type="button"
            disabled={careerContent.loading || importing || deleting}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {importing ? "Разбираем PDF" : "Импортировать PDF"}
          </PageActionButton>
          <SphereBusinessControls sphereId="career" />
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Импортировать перфоманс-ревью из PDF"
            onChange={importPdf}
          />
        </div>
      </header>}
      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />
      {actionFeedback && (
        <Alert variant={actionFeedback.tone === "error" ? "destructive" : "default"}>
          <AlertTitle>{actionFeedback.tone === "error" ? "Не удалось выполнить действие" : "Готово"}</AlertTitle>
          <AlertDescription>{actionFeedback.message}</AlertDescription>
        </Alert>
      )}
      {activeCycle ? <Tabs className="min-w-0 gap-6" value={activeCycle.id} onValueChange={setActiveCycleId}>
        <div className="min-w-0" data-report-navigation>
          <TabsList
            className="list-tabs h-auto! min-w-0 w-full flex-nowrap bg-transparent p-0"
            data-tab-scroller
            aria-label="Циклы перфоманс-ревью"
          >
            {cycles.map((cycle) => (
              <TabsTrigger
                data-list-tile
                data-report-tile
                key={cycle.id}
                value={cycle.id}
                aria-label={`${cycle.season} ${cycle.year}, результатов: ${cycle.projects.length}`}
              >
                <span data-slot="list-tile-label">{cycle.season} {cycle.year}</span>
                <span data-slot="list-tile-meta" aria-hidden="true">
                  <span data-slot="list-tile-count">{cycle.projects.length}</span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent className="flex min-w-0 flex-col gap-6" value={activeCycle.id}>
          <section className="flex min-w-0 flex-col gap-6" aria-labelledby="performance-cycle-summary">
            <header className="flex flex-col gap-2">
              <h2 id="performance-cycle-summary" className="m-0 scroll-m-20 text-lg leading-7 font-semibold tracking-tight">Ключевые результаты</h2>
              <p className="m-0 text-muted-foreground">
                Самооценка, подтверждённые результаты и комментарии ревьюеров за период {activeCycle.season.toLocaleLowerCase("ru-RU")} {activeCycle.year}.
              </p>
            </header>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard value={activeCycle.projects.length} label="направлений" />
              <MetricCard value={stats.feedback} label="отзывов" />
              <MetricCard value={stats.excellent} label="высоких оценок" />
            </div>
          </section>

          <ProjectAccordion key={activeCycle.id} projects={activeCycle.projects} />

          {activeCycle.interaction.length > 0 && (
            <section className="flex min-w-0 flex-col gap-6" aria-labelledby="performance-interaction">
              <header className="flex flex-col gap-2">
                <h2 id="performance-interaction" className="m-0 scroll-m-20 text-lg leading-7 font-semibold tracking-tight">Качество взаимодействия</h2>
                <p className="m-0 text-muted-foreground">
                  {activeCycle.interaction.length} комментариев о коммуникации, лидерстве и совместной работе.
                </p>
              </header>
              <div className="divide-y">
                {activeCycle.interaction.map((reviewer, index) => (
                  <ReviewerCard key={`${reviewer.name}-${index}`} reviewer={reviewer} interaction />
                ))}
              </div>
            </section>
          )}
        </TabsContent>
      </Tabs> : (
        <section className="flex min-w-0 flex-col items-start gap-4" aria-label="Циклов ревью пока нет">
          <h2 className="m-0 font-medium">Циклов ревью пока нет</h2>
          <p className="m-0 text-muted-foreground">{readOnly ? "Владелец пока не добавил циклы ревью." : "Импортируйте PDF, и его проекты, результаты и отзывы появятся на этой странице."}</p>
          {!readOnly && <Button variant="outline" type="button" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            <FileUp data-icon="inline-start" aria-hidden="true" />
            Выбрать PDF
          </Button>}
        </section>
      )}
      {!readOnly && activeCycle && <PerformanceEditor
        activeCycleId={activeCycle.id}
        content={performanceContent}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onDelete={deleteActiveCycle}
        onSave={careerContent.save}
      />}
    </article>
  );
}
