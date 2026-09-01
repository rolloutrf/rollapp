import { extractPdfLines } from "./lab-pdf.js";

const GALLUP_TALENTS = [
  ["Achiever", "Достижение", "executing"], ["Activator", "Активатор", "influencing"],
  ["Adaptability", "Адаптивность", "relationship"], ["Analytical", "Аналитик", "strategic"],
  ["Arranger", "Организатор", "executing"], ["Belief", "Убеждённость", "executing"],
  ["Command", "Командование", "influencing"], ["Communication", "Коммуникация", "influencing"],
  ["Competition", "Соревнование", "influencing"], ["Connectedness", "Связность", "relationship"],
  ["Consistency", "Последовательность", "executing"], ["Context", "Контекст", "strategic"],
  ["Deliberative", "Осмотрительность", "executing"], ["Developer", "Развитие", "relationship"],
  ["Discipline", "Дисциплина", "executing"], ["Empathy", "Эмпатия", "relationship"],
  ["Focus", "Фокус", "executing"], ["Futuristic", "Будущее", "strategic"],
  ["Harmony", "Гармония", "relationship"], ["Ideation", "Генерация идей", "strategic"],
  ["Includer", "Включение", "relationship"], ["Individualization", "Индивидуализация", "relationship"],
  ["Input", "Сбор информации", "strategic"], ["Intellection", "Мышление", "strategic"],
  ["Learner", "Обучаемость", "strategic"], ["Maximizer", "Максимизация", "influencing"],
  ["Positivity", "Позитивность", "relationship"], ["Relator", "Близость", "relationship"],
  ["Responsibility", "Ответственность", "executing"], ["Restorative", "Исправление", "executing"],
  ["Self-Assurance", "Уверенность", "influencing"], ["Significance", "Значимость", "influencing"],
  ["Strategic", "Стратегия", "strategic"], ["Woo", "Обаяние", "influencing"],
].map(([name, translation, domain]) => ({ name, translation, domain }));

const HOGAN_PROFILE_DEFINITIONS = [
  {
    id: "hpi", code: "HPI", title: "Сильные стороны",
    description: "Повседневный рабочий стиль и впечатление, которое складывается у окружающих.",
    scales: [
      ["Адаптация", ["adjustment", "адаптация"]],
      ["Амбициозность", ["ambition", "амбициозность"]],
      ["Общительность", ["sociability", "общительность"]],
      ["Межличностная восприимчивость", ["interpersonal sensitivity", "межличностная восприимчивость"]],
      ["Организованность", ["prudence", "организованность"]],
      ["Любознательность", ["inquisitive", "любознательность"]],
      ["Подход к обучению", ["learning approach", "подход к обучению"]],
    ],
  },
  {
    id: "mvpi", code: "MVPI", title: "Ценности и мотиваторы",
    description: "Ценности, предпочтительная среда и источники вовлечённости.",
    scales: [
      ["Признание", ["recognition", "признание"]], ["Власть", ["power", "власть"]],
      ["Жажда наслаждений", ["hedonism", "жажда наслаждений"]], ["Альтруизм", ["altruistic", "altruism", "альтруизм"]],
      ["Причастность", ["affiliation", "причастность"]], ["Традиционализм", ["tradition", "традиционализм"]],
      ["Безопасность", ["security", "безопасность"]], ["Коммерция", ["commerce", "коммерция"]],
      ["Эстетика", ["aesthetics", "эстетика"]], ["Научный подход", ["science", "научный подход"]],
    ],
  },
  {
    id: "hds", code: "HDS", title: "Риски под нагрузкой",
    description: "Тенденции, которые могут становиться заметнее в стрессе и неопределённости.",
    scales: [
      ["Эмоциональный", ["excitable", "эмоциональный"]], ["Скептичный", ["skeptical", "скептичный"]],
      ["Осторожный", ["cautious", "осторожный"]], ["Сам в себе", ["reserved", "сам в себе"]],
      ["Сам по себе", ["leisurely", "сам по себе"]], ["Самоуверенный", ["bold", "самоуверенный"]],
      ["Увлекающийся", ["mischievous", "увлекающийся"]], ["Театральный", ["colorful", "театральный"]],
      ["С богатым воображением", ["imaginative", "с богатым воображением"]], ["Прилежный", ["diligent", "прилежный"]],
      ["Исполненный сознания долга", ["dutiful", "исполненный сознания долга"]],
    ],
  },
];

const REPORT_FOOTER = /(?:copyright|all rights reserved|strengthsfinder|cliftonstrengths\.com|©|^®$)/i;
const PAGE_NUMBER = /^(?:page\s+)?\d{1,3}(?:\s+of\s+\d{1,3})?$/i;
const REPEATED_REPORT_HEADER = /^[A-ZА-ЯЁ][A-ZА-ЯЁ '-]+\s*\|\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s*\|.*)?$/;

function normalize(value) {
  return String(value || "").replaceAll("\u00a0", " ").replace(/\s+/g, " ").trim();
}

function filenameTitle(filename) {
  return String(filename || "Отчёт").replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Отчёт";
}

function cleanLines(lines) {
  const result = [];
  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line || REPORT_FOOTER.test(line) || PAGE_NUMBER.test(line) || REPEATED_REPORT_HEADER.test(line)) continue;
    if (line === result.at(-1)) continue;
    result.push(line.slice(0, 4_000));
  }
  return result.slice(0, 2_500);
}

function looksLikeHeading(line) {
  if (line.length < 3 || line.length > 120 || /[.!?;:]$/.test(line)) return false;
  if (/^\d{1,2}\.\s+[A-Za-zА-Яа-яЁё -]+$/.test(line)) return false;
  const letters = [...line].filter((char) => /[A-Za-zА-Яа-яЁё]/.test(char));
  const uppercase = letters.filter((char) => char === char.toLocaleUpperCase() && char !== char.toLocaleLowerCase());
  return /^(?:what|why|how|apply|take action|your |about |summary|introduction|overview|interpret|профиль|итоги|как |что |почему |рекомендац|вывод)/i.test(line)
    || (letters.length >= 4 && uppercase.length / letters.length > 0.72);
}

function sectionize(lines, fallbackTitle) {
  const sections = [];
  let current = { title: fallbackTitle, paragraphs: [] };
  const push = () => {
    if (!current.paragraphs.length) return;
    sections.push({ title: current.title, paragraphs: current.paragraphs.slice(0, 120) });
  };
  for (const line of lines) {
    if (looksLikeHeading(line)) {
      push();
      current = { title: line, paragraphs: [] };
      continue;
    }
    current.paragraphs.push(line);
  }
  push();
  return sections.slice(0, 80);
}

function findPerson(lines) {
  const gallup = lines.find((line) => /\b[A-ZА-ЯЁ][A-ZА-ЯЁ'-]+\s+[A-ZА-ЯЁ][A-ZА-ЯЁ'-]+\s*\|/.test(line));
  if (gallup) return gallup.split("|")[0].trim().split(/\s+/).map((word) => (
    `${word.slice(0, 1).toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}`
  )).join(" ");
  const named = lines.find((line) => /(?:name|имя)\s*[:：]/i.test(line));
  return named ? named.split(/[:：]/).slice(1).join(":").trim().slice(0, 120) : "";
}

function findDate(lines) {
  for (const line of lines.slice(0, 180)) {
    const match = line.match(/\b(\d{1,2})([./-])(\d{1,2})[./-](\d{2,4})\b/);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[3]);
    const yearValue = match[4];
    const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
    const dayFirst = match[2] === "." || first > 12;
    const month = dayFirst ? second : first;
    const day = dayFirst ? first : second;
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return "";
}

function parseGallupStrengths(lines) {
  const catalog = new Map(GALLUP_TALENTS.map((talent) => [talent.name.toLocaleLowerCase("en-US"), talent]));
  const ranks = new Map();
  const joined = lines.join("\n");
  for (const match of joined.matchAll(/(?:^|\s)(\d{1,2})\.\s*([A-Za-z][A-Za-z -]{2,30})(?=\s|$)/gm)) {
    const rank = Number(match[1]);
    if (rank < 1 || rank > 34 || ranks.has(rank)) continue;
    const rawName = match[2].trim().replace(/\s+(?:CliftonStrengths|themes?|helps?).*$/i, "");
    const talent = catalog.get(rawName.toLocaleLowerCase("en-US"));
    if (talent) ranks.set(rank, { rank, ...talent });
  }
  return [...ranks.values()].sort((left, right) => left.rank - right.rank);
}

function scoreNearAlias(lines, aliases) {
  for (let index = 0; index < lines.length; index += 1) {
    const lower = lines[index].toLocaleLowerCase("ru-RU");
    if (!aliases.some((alias) => lower.includes(alias))) continue;
    const sameLineNumbers = [...lines[index].matchAll(/\b(100|[1-9]?\d)\b/g)].map((match) => Number(match[1]));
    if (sameLineNumbers.length) return sameLineNumbers.at(-1);
    for (const adjacent of [lines[index + 1], lines[index - 1]]) {
      const match = normalize(adjacent).match(/^(100|[1-9]?\d)(?:\s*%|\s*percentile)?$/i);
      if (match) return Number(match[1]);
    }
  }
  return null;
}

function parseHoganProfiles(lines) {
  return HOGAN_PROFILE_DEFINITIONS.map((profile) => ({
    id: profile.id,
    code: profile.code,
    title: profile.title,
    description: profile.description,
    scores: profile.scales.map(([label, aliases]) => {
      const score = scoreNearAlias(lines, aliases);
      return score === null ? null : [label, score, "Извлечено из загруженного PDF."];
    }).filter(Boolean),
  })).filter((profile) => profile.scores.length);
}

export async function parseIdentityPdf(buffer, { section, id, filename, uploadedAt = new Date() }) {
  const extractedLines = await extractPdfLines(buffer);
  const lines = cleanLines(extractedLines);
  if (lines.length < 4) throw new Error("В PDF не найдено достаточно текста для создания страницы");
  const title = filenameTitle(filename);
  return {
    id,
    filename,
    title,
    uploadedAt: new Date(uploadedAt).toISOString(),
    person: findPerson(extractedLines),
    date: findDate(extractedLines),
    sections: sectionize(lines, title),
    ...(section === "gallup" ? { strengths: parseGallupStrengths(lines) } : { profiles: parseHoganProfiles(lines) }),
  };
}

export function identityReportForDisplay(section, report) {
  if (section !== "hogan" || !report) return report;
  return {
    ...report,
    documents: (report.documents || []).map(({ sections: _sections, ...document }) => document),
  };
}

export function generateIdentityReport(section, documents) {
  const ordered = [...documents].sort((left, right) => String(left.uploadedAt).localeCompare(String(right.uploadedAt)));
  const latest = ordered.at(-1) || {};
  if (section === "gallup") {
    const byRank = new Map();
    for (const document of ordered) {
      for (const strength of document.strengths || []) byRank.set(strength.rank, strength);
    }
    const strengths = [...byRank.values()].sort((left, right) => left.rank - right.rank);
    const domainCounts = strengths.slice(0, 10).reduce((counts, strength) => {
      counts[strength.domain] = (counts[strength.domain] || 0) + 1;
      return counts;
    }, {});
    const leadingDomain = Object.entries(domainCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || "";
    return {
      section,
      title: strengths.length ? "Профиль CliftonStrengths" : "Отчёт Gallup",
      person: ordered.find((document) => document.person)?.person || "",
      date: ordered.find((document) => document.date)?.date || "",
      strengths,
      leadingDomain,
      documents: ordered,
      generatedAt: new Date().toISOString(),
    };
  }
  const profiles = [];
  for (const definition of HOGAN_PROFILE_DEFINITIONS) {
    const scores = new Map();
    for (const document of ordered) {
      const profile = (document.profiles || []).find((item) => item.id === definition.id);
      for (const score of profile?.scores || []) scores.set(score[0], score);
    }
    if (scores.size) profiles.push({
      id: definition.id,
      code: definition.code,
      title: definition.title,
      description: definition.description,
      scores: [...scores.values()],
    });
  }
  return identityReportForDisplay(section, {
    section,
    title: profiles.length ? "Профиль Hogan" : "Отчёт Hogan",
    person: ordered.find((document) => document.person)?.person || "",
    date: ordered.find((document) => document.date)?.date || "",
    profiles,
    documents: ordered,
    generatedAt: latest.uploadedAt || new Date().toISOString(),
  });
}

export const identityReportFixtures = { GALLUP_TALENTS, HOGAN_PROFILE_DEFINITIONS };
