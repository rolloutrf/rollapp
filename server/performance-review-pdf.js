import { extractPdfLines, LAB_PDF_MAX_BYTES, LabPdfError } from "./lab-pdf.js";

const SEASON_ALIASES = new Map([
  ["зима", "Зима"], ["winter", "Зима"],
  ["весна", "Весна"], ["spring", "Весна"],
  ["лето", "Лето"], ["summer", "Лето"],
  ["осень", "Осень"], ["autumn", "Осень"], ["fall", "Осень"],
]);
const SCORE_ALIASES = ["Супер", "Выше ожиданий", "Соответствует ожиданиям", "Хорошо"];
const PAGE_NUMBER = /^(?:page|страница)?\s*\d{1,3}(?:\s+(?:of|из)\s+\d{1,3})?$/iu;
const BOILERPLATE = /^(?:performance review|перфоманс[ -]?ревью|отч[её]т о результатах|самооценка сотрудника)(?:\s+(?:зима|весна|лето|осень|winter|spring|summer|autumn|fall|20\d{2}).*)?$/iu;
const CYCLE_METADATA = /^(?:(?:период|цикл|сотрудник|employee|review period)\s*[:—-]\s*.+|(?:зима|весна|лето|осень|winter|spring|summer|autumn|fall)\s*[-–—/]?\s*20\d{2})$/iu;

function normalize(value = "") {
  return String(value)
    .replaceAll("\u00a0", " ")
    .replace(/[\t ]+/gu, " ")
    .replace(/\s+$/gu, "")
    .trim();
}

function slug(value = "") {
  return normalize(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120) || "result";
}

function cleanLines(linesOrText) {
  const rawLines = Array.isArray(linesOrText) ? linesOrText : String(linesOrText || "").split(/\r?\n/u);
  const result = [];
  for (const rawLine of rawLines) {
    const line = normalize(rawLine);
    if (!line || PAGE_NUMBER.test(line)) continue;
    if (line === result.at(-1)) continue;
    result.push(line.slice(0, 4_000));
  }
  return result.slice(0, 4_000);
}

function filenameTitle(filename = "") {
  const title = normalize(filename)
    .replace(/\.pdf$/iu, "")
    .replace(/[_]+/gu, " ")
    .replace(/\b(?:performance[ -]?review|перфоманс[ -]?ревью|self[ -]?review)\b/giu, "")
    .replace(/\b20\d{2}\b/gu, "")
    .replace(/[-–—]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return title || "Результаты из PDF";
}

function inferPeriod(lines, filename, uploadedAt) {
  const source = [filename, ...lines.slice(0, 120)].join("\n");
  let season = "";
  let year = 0;
  for (const match of source.matchAll(/(?:^|\s)(зима|весна|лето|осень|winter|spring|summer|autumn|fall)\s*[-–—/]?\s*(20\d{2})(?=\s|$|\.)/gimu)) {
    season = SEASON_ALIASES.get(match[1].toLocaleLowerCase("ru-RU")) || "";
    year = Number(match[2]);
    break;
  }
  if (!season || !year) {
    for (const match of source.matchAll(/(?:^|\s)(20\d{2})\s*[-–—/]?\s*(зима|весна|лето|осень|winter|spring|summer|autumn|fall)(?=\s|$|\.)/gimu)) {
      year = Number(match[1]);
      season = SEASON_ALIASES.get(match[2].toLocaleLowerCase("ru-RU")) || "";
      break;
    }
  }
  if (!year) year = Number(source.match(/\b(20\d{2})\b/u)?.[1]) || new Date(uploadedAt).getUTCFullYear();
  return { season: season || "Ревью", year };
}

function sectionLabel(line) {
  const value = normalize(line).replace(/[:?]+$/gu, "").toLocaleLowerCase("ru-RU");
  if (/^(?:что (?:было )?сделано|что сделал(?:а)?|достижения|выполненные задачи|what (?:was )?done|achievements)$/iu.test(value)) return "Что сделано?";
  if (/^(?:какой результат|результат|эффект|влияние|impact|outcome|results?)$/iu.test(value)) return "Какой результат?";
  if (/^(?:цели|ключевые результаты|key results?|objectives?|okr)$/iu.test(value)) return "Ключевые результаты";
  if (/^(?:самооценка|self assessment|self review|комментарий сотрудника)$/iu.test(value)) return "Самооценка";
  return "";
}

function feedbackField(line) {
  const value = normalize(line).replace(/[:?]+$/gu, "").toLocaleLowerCase("ru-RU");
  if (/^(?:что было хорошо|сильные стороны|положительная обратная связь|positive feedback|what went well)$/iu.test(value)) return "positive";
  if (/^(?:что можно улучшить|зоны роста|рекомендации|areas? (?:for )?improvement|what (?:could|can) be improved)$/iu.test(value)) return "improve";
  if (/^(?:комментарий|обратная связь|feedback|comment)$/iu.test(value)) return "comment";
  return "";
}

function projectTitle(line) {
  const match = normalize(line).match(/^(?:проект|направление|результат|цель|project|key result)\s*(?:[:№#-]|—)\s*(.{2,500})$/iu);
  return match ? normalize(match[1]) : "";
}

function reviewerName(line) {
  const match = normalize(line).match(/^(?:отзыв(?:\s+от)?|ревьюер|имя|reviewer|feedback\s+from)\s*[:—-]\s*(.{2,240})$/iu);
  return match ? normalize(match[1]) : "";
}

function inlineField(line, labels) {
  const pattern = new RegExp(`^(?:${labels.join("|")})\\s*[:—-]\\s*(.+)$`, "iu");
  return normalize(line).match(pattern)?.[1]?.trim() || "";
}

function normalizeScore(value = "") {
  const normalized = normalize(value).replace(/[).]+$/gu, "").toLocaleLowerCase("ru-RU");
  return SCORE_ALIASES.find((score) => score.toLocaleLowerCase("ru-RU") === normalized) || "";
}

function blocksFromLines(lines = []) {
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ").trim().slice(0, 20_000) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list?.items.length) return;
    blocks.push({ ...list, items: list.items.slice(0, 500) });
    list = null;
  };
  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line) continue;
    const unordered = line.match(/^[-–—•·]\s*(.+)$/u);
    const ordered = line.match(/^\d+[.)]\s*(.+)$/u);
    if (unordered || ordered) {
      flushParagraph();
      const type = ordered ? "ordered-list" : "unordered-list";
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push(normalize((unordered || ordered)[1]).slice(0, 20_000));
      continue;
    }
    flushList();
    paragraph.push(line);
    if (paragraph.join(" ").length >= 900 || (/[.!?]$/u.test(line) && paragraph.join(" ").length >= 180)) flushParagraph();
  }
  flushParagraph();
  flushList();
  return blocks.slice(0, 100);
}

function emptyProject(title) {
  return { title, sectionBuilders: [{ label: "Содержимое PDF", lines: [] }], reviewerBuilders: [] };
}

function finalizeReviewer(builder, interaction = false) {
  const positive = blocksFromLines(builder.positive);
  const improve = blocksFromLines(builder.improve);
  const comment = blocksFromLines(builder.comment.length ? builder.comment : builder.positive);
  return interaction
    ? { name: builder.name || "Автор отзыва", role: builder.role, score: builder.score, comment }
    : { name: builder.name || "Автор отзыва", role: builder.role, score: builder.score, positive, improve };
}

function finalizeProject(builder, cycleId, index) {
  const sections = builder.sectionBuilders
    .map((section) => ({ label: section.label, blocks: blocksFromLines(section.lines) }))
    .filter((section) => section.blocks.length);
  return {
    id: `${cycleId}-${index + 1}-${slug(builder.title)}`.slice(0, 240),
    title: builder.title.slice(0, 500),
    sections: sections.length ? sections : [{ label: "Содержимое PDF", blocks: [{ type: "paragraph", text: "Данные проекта не распознаны." }] }],
    reviewers: builder.reviewerBuilders.map((reviewer) => finalizeReviewer(reviewer)).filter((reviewer) => reviewer.positive.length || reviewer.improve.length || reviewer.score),
  };
}

export function parsePerformanceReviewText(linesOrText, {
  id = `performance-${Date.now()}`,
  filename = "Перфоманс-ревью.pdf",
  uploadedAt = new Date(),
} = {}) {
  const lines = cleanLines(linesOrText);
  if (lines.length < 3) throw new LabPdfError("В PDF не найдено достаточно текста для импорта ревью", "PERFORMANCE_PDF_NO_TEXT");
  const { season, year } = inferPeriod(lines, filename, uploadedAt);
  const cycleId = String(id).slice(0, 240);
  const projects = [];
  const interactionBuilders = [];
  let project = emptyProject(filenameTitle(filename));
  let section = project.sectionBuilders[0];
  let reviewer = null;
  let reviewerField = "positive";
  let interactionMode = false;
  let recognizedStructure = false;

  const flushReviewer = () => {
    if (!reviewer) return;
    if (interactionMode) interactionBuilders.push(reviewer);
    else project.reviewerBuilders.push(reviewer);
    reviewer = null;
  };
  const flushProject = () => {
    flushReviewer();
    const hasContent = project.sectionBuilders.some((item) => item.lines.length) || project.reviewerBuilders.length;
    if (hasContent) projects.push(project);
  };
  const startReviewer = (name) => {
    flushReviewer();
    reviewer = { name, role: "", score: "", positive: [], improve: [], comment: [] };
    reviewerField = interactionMode ? "comment" : "positive";
  };

  for (const line of lines) {
    if (BOILERPLATE.test(line) || CYCLE_METADATA.test(line)) continue;
    if (/^(?:качество взаимодействия|взаимодействие|collaboration|teamwork)$/iu.test(line.replace(/[:?]+$/gu, ""))) {
      flushReviewer();
      interactionMode = true;
      recognizedStructure = true;
      continue;
    }
    const nextProjectTitle = projectTitle(line);
    if (nextProjectTitle && !interactionMode) {
      flushProject();
      project = emptyProject(nextProjectTitle);
      section = project.sectionBuilders[0];
      recognizedStructure = true;
      continue;
    }
    const nextReviewerName = reviewerName(line);
    if (nextReviewerName) {
      startReviewer(nextReviewerName);
      recognizedStructure = true;
      continue;
    }
    const nextFeedbackField = feedbackField(line);
    if (nextFeedbackField) {
      if (!reviewer) startReviewer("Автор отзыва");
      reviewerField = interactionMode ? "comment" : nextFeedbackField;
      recognizedStructure = true;
      continue;
    }
    if (reviewer) {
      const role = inlineField(line, ["роль", "должность", "role", "position"]);
      if (role) {
        reviewer.role = role.slice(0, 500);
        recognizedStructure = true;
        continue;
      }
      const rawScore = inlineField(line, ["оценка(?: ревьюера)?", "score", "rating"]);
      const score = normalizeScore(rawScore || line);
      if (score && (rawScore || SCORE_ALIASES.some((label) => label.toLocaleLowerCase("ru-RU") === line.toLocaleLowerCase("ru-RU")))) {
        reviewer.score = score;
        recognizedStructure = true;
        continue;
      }
      reviewer[reviewerField].push(line);
      continue;
    }
    const nextSectionLabel = sectionLabel(line);
    if (nextSectionLabel && !interactionMode) {
      section = { label: nextSectionLabel, lines: [] };
      project.sectionBuilders.push(section);
      recognizedStructure = true;
      continue;
    }
    if (!interactionMode) {
      section.lines.push(line);
    } else {
      if (!reviewer) startReviewer("Автор отзыва");
      reviewer.comment.push(line);
    }
  }
  flushProject();

  const finalizedProjects = projects.map((item, index) => finalizeProject(item, cycleId, index)).slice(0, 100);
  if (!finalizedProjects.length && !interactionBuilders.length) {
    throw new LabPdfError("В PDF не найдено содержимого ревью", "PERFORMANCE_PDF_NO_RESULTS");
  }
  return {
    cycle: {
      id: cycleId,
      year,
      season,
      projects: finalizedProjects,
      interaction: interactionBuilders.map((item) => finalizeReviewer(item, true)).filter((item) => item.comment.length || item.score).slice(0, 500),
    },
    warnings: recognizedStructure
      ? []
      : ["Структура PDF распознана частично. Проверьте название цикла, проекты и секции перед публикацией."],
  };
}

export async function parsePerformanceReviewPdf(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length > LAB_PDF_MAX_BYTES) {
    throw new LabPdfError("PDF должен быть не больше 12 МБ", "PERFORMANCE_PDF_TOO_LARGE");
  }
  const lines = await extractPdfLines(buffer);
  return parsePerformanceReviewText(lines, options);
}
