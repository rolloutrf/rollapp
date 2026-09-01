import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SOURCE = "/Users/m.koloskov/Desktop/Obsidian/koloskof/03. Карьера/Feedback/Self Review and Feedback";
const DEFAULT_OUTPUT = path.resolve("src/data/performance-review.js");
const sourceRoot = path.resolve(process.argv[2] || process.env.PERFORMANCE_SOURCE_DIR || DEFAULT_SOURCE);
const outputFile = path.resolve(process.argv[3] || DEFAULT_OUTPUT);

const normalizeText = (value = "") => value
  .replace(/\r/gu, "")
  .replace(/\u00a0/gu, " ")
  .replace(/[ \t]+$/gmu, "")
  .trim();

const sanitizeLinks = (value = "") => value.replace(
  /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gu,
  (match, label, url) => {
    try {
      const parsed = new URL(url);
      if ([...parsed.searchParams.keys()].some((key) => /token|secret|password|auth/iu.test(key))) return label;
    } catch {
      return label;
    }
    return match;
  },
);

const cleanText = (value = "") => sanitizeLinks(normalizeText(value))
  .replace(/^\.\.\./u, "")
  .trim();

const REVIEW_SCORE_LABELS = new Set(["Супер", "Выше ожиданий", "Соответствует ожиданиям", "Хорошо"]);
const cleanReviewerScore = (value = "") => {
  const label = cleanText(value).replace(/[)]+$/u, "").trim();
  return REVIEW_SCORE_LABELS.has(label) ? label : "";
};

function parseBlocks(value = "") {
  const lines = cleanText(value).split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join("\n").trim() });
    paragraph = [];
  };
  const flushList = () => {
    if (!list?.items.length) return;
    blocks.push(list);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const unordered = line.match(/^[-–—]\s+(.+)$/u);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/u);
    if (unordered || ordered) {
      flushParagraph();
      const type = ordered ? "ordered-list" : "unordered-list";
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push(cleanText((unordered || ordered)[1]));
      continue;
    }
    flushList();
    paragraph.push(line.replace(/\s{2}$/u, ""));
  }
  flushParagraph();
  flushList();
  return blocks.filter((block) => block.text || block.items?.length);
}

function parseBoldSections(value = "") {
  const sections = [];
  let active = null;
  for (const line of normalizeText(value).split("\n")) {
    const heading = line.trim().match(/^\*\*(.+?)\*\*\s*$/u);
    if (heading) {
      if (active) sections.push({ label: cleanText(active.label), blocks: parseBlocks(active.lines.join("\n")) });
      active = { label: heading[1], lines: [] };
      continue;
    }
    if (!active) active = { label: "Описание", lines: [] };
    active.lines.push(line);
  }
  if (active) sections.push({ label: cleanText(active.label), blocks: parseBlocks(active.lines.join("\n")) });
  return sections.filter((section) => section.blocks.length);
}

const sectionKey = (label = "") => cleanText(label).toLocaleLowerCase("ru-RU").replace(/[?:!.]/gu, "").trim();

function reviewerFromChunk(name, value) {
  const lines = normalizeText(value).split("\n");
  const firstHeading = lines.findIndex((line) => /^\*\*(.+?)\*\*\s*$/u.test(line.trim()));
  const role = cleanText(lines.slice(0, firstHeading < 0 ? lines.length : firstHeading).join(" "));
  const sections = parseBoldSections(lines.slice(firstHeading < 0 ? lines.length : firstHeading).join("\n"));
  const fields = Object.fromEntries(sections.map((section) => [sectionKey(section.label), section.blocks]));
  const scoreBlocks = fields["оценка ревьюера"] || [];
  const score = cleanReviewerScore(scoreBlocks.map((block) => block.text || block.items?.join(" ") || "").join(" "));
  return {
    name: cleanText(name),
    role,
    score,
    positive: fields["что было хорошо"] || [],
    improve: fields["что можно улучшить"] || [],
  };
}

function parseProjectReview(value) {
  const chunks = normalizeText(value).split(/^##\s+(?!#)(.+)$/gmu);
  const reviewers = [];
  for (let index = 1; index < chunks.length; index += 2) {
    const reviewer = reviewerFromChunk(chunks[index], chunks[index + 1] || "");
    const isTemplate = /^(имя|name)$/iu.test(reviewer.name)
      || [reviewer.score, reviewer.role].some((field) => /^\.{3}$|^должность$/iu.test(field));
    if (!isTemplate && (reviewer.positive.length || reviewer.improve.length || reviewer.score)) reviewers.push(reviewer);
  }
  return reviewers;
}

function parseInteractionReview(value) {
  const normalized = normalizeText(value);
  if (!/^###\s+/mu.test(normalized)) {
    return parseProjectReview(normalized).map((reviewer) => ({
      name: reviewer.name,
      role: reviewer.role,
      score: reviewer.score,
      comment: reviewer.positive,
    }));
  }

  const chunks = normalized.split(/^###\s+(?!Результат\s*:)(.+)$/gimu);
  const records = [];
  for (let index = 1; index < chunks.length; index += 2) {
    const name = cleanText(chunks[index]);
    const lines = normalizeText(chunks[index + 1] || "").split("\n");
    const scoreIndex = lines.findIndex((line) => /^###\s+Результат\s*:/iu.test(line.trim()));
    if (scoreIndex < 0 || /^(имя|name)$/iu.test(name)) continue;
    const score = cleanReviewerScore(lines[scoreIndex].replace(/^###\s+Результат\s*:\s*/iu, ""));
    const role = cleanText(lines.slice(0, scoreIndex).join(" "));
    const comment = parseBlocks(lines.slice(scoreIndex + 1).join("\n"));
    if (comment.length || score) records.push({ name, role, score, comment });
  }

  const seen = new Set();
  return records.filter((record) => {
    const key = JSON.stringify(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function collectMarkdownFiles(root) {
  const files = [];
  for (const yearEntry of await readdir(root, { withFileTypes: true })) {
    if (!yearEntry.isDirectory() || !/^\d{4}$/u.test(yearEntry.name)) continue;
    const yearPath = path.join(root, yearEntry.name);
    for (const seasonEntry of await readdir(yearPath, { withFileTypes: true })) {
      if (!seasonEntry.isDirectory()) continue;
      const seasonPath = path.join(yearPath, seasonEntry.name);
      for (const fileEntry of await readdir(seasonPath, { withFileTypes: true })) {
        if (fileEntry.isFile() && fileEntry.name.endsWith(".md")) {
          files.push({ year: yearEntry.name, season: seasonEntry.name, file: path.join(seasonPath, fileEntry.name) });
        }
      }
    }
  }
  return files;
}

function titleFromFile(file) {
  return path.basename(file, ".md").replace(/^\d+\.\s*/u, "").trim();
}

const cycleMap = new Map();
for (const item of await collectMarkdownFiles(sourceRoot)) {
  const key = `${item.year}-${item.season}`;
  if (!cycleMap.has(key)) cycleMap.set(key, { id: key, year: Number(item.year), season: item.season, projects: [], interaction: [] });
  const cycle = cycleMap.get(key);
  const markdown = await readFile(item.file, "utf8");
  const [selfReview = "", reviewerReview = ""] = normalizeText(markdown).split(/^\s*-{3,}\s*$/mu, 2);
  const title = titleFromFile(item.file);
  if (/качество взаимодействия/iu.test(title)) {
    cycle.interaction.push(...parseInteractionReview(markdown));
  } else {
    cycle.projects.push({
      id: `${item.year}-${item.season}-${title}`.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, ""),
      order: Number(path.basename(item.file).match(/^(\d+)\./u)?.[1]) || Number.MAX_SAFE_INTEGER,
      title,
      sections: parseBoldSections(selfReview),
      reviewers: parseProjectReview(reviewerReview),
    });
  }
}

const seasonRank = new Map([["Зима", 2], ["Лето", 1]]);
const cycles = [...cycleMap.values()]
  .sort((left, right) => right.year - left.year || (seasonRank.get(right.season) || 0) - (seasonRank.get(left.season) || 0))
  .map((cycle) => ({
    ...cycle,
    projects: cycle.projects
      .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, "ru", { numeric: true }))
      .map(({ order, ...project }) => project),
  }));

const output = `// Generated from the Obsidian Self Review and Feedback archive.\n// Re-run scripts/import-obsidian-performance.mjs to refresh this snapshot.\nexport const PERFORMANCE_CYCLES = ${JSON.stringify(cycles, null, 2)};\n`;
await writeFile(outputFile, output, "utf8");

const projectCount = cycles.reduce((sum, cycle) => sum + cycle.projects.length, 0);
const projectFeedbackCount = cycles.reduce((sum, cycle) => sum + cycle.projects.reduce((count, project) => count + project.reviewers.length, 0), 0);
const interactionCount = cycles.reduce((sum, cycle) => sum + cycle.interaction.length, 0);
console.log(`Imported ${cycles.length} cycles, ${projectCount} projects and ${projectFeedbackCount + interactionCount} feedback records.`);
