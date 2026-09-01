import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { LAB_REPORTS } from "./lab-results-data.js";

export const LAB_PDF_MAX_BYTES = 12 * 1024 * 1024;
const LAB_PDF_MAX_PAGES = 50;
const LAB_PDF_MAX_TEXT_LENGTH = 2_000_000;

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

const ANALYTE_ALIASES = new Map([
  ["алат", ["алт", "alanine aminotransferase"]],
  ["асат", ["аст", "aspartate aminotransferase"]],
  ["гематокрит", ["hematocrit"]],
  ["гемоглобин", ["haemoglobin", "hemoglobin"]],
  ["эритроциты", ["rbc"]],
  ["лейкоциты", ["wbc"]],
  ["тромбоциты", ["plt"]],
  ["средний объём эритроцита", ["средний объем эритроцита", "mcv"]],
  ["ширина распределения эритроцитов", ["rdw"]],
  ["содержание hb в эритроците", ["mch"]],
  ["концентрация hb в эритроцитах", ["mchc"]],
  ["соэ", ["скорость оседания эритроцитов", "esr"]],
  ["ттг", ["тиреотропный гормон", "tsh"]],
  ["т4 свободный", ["тироксин свободный", "free t4"]],
  ["т3 свободный", ["трийодтиронин свободный", "free t3"]],
  ["витамин d · 25-oh", ["витамин d 25-oh", "25-oh витамин d", "25(oh)d"]],
  ["витамин b9 · фолиевая кислота", ["витамин b9", "фолиевая кислота", "folate"]],
  ["витамин b12", ["цианокобаламин", "cobalamin"]],
  ["протромбиновое время", ["пв", "pt"]],
  ["протромбин по квику", ["протромбин %", "quick"]],
  ["мно", ["inr"]],
  ["ачтв", ["aptt"]],
]);

const EXTRA_ANALYTES = [
  ["c-reactive-protein", "С-реактивный белок", "Биохимия", "biochemistry", "CRP"],
  ["glycated-hemoglobin", "Гликированный гемоглобин", "Углеводный обмен", "carbohydrate", "HbA1c"],
  ["insulin", "Инсулин", "Углеводный обмен", "carbohydrate", ""],
  ["total-testosterone", "Тестостерон общий", "Гормоны", "hormones", ""],
  ["prolactin", "Пролактин", "Гормоны", "hormones", ""],
  ["cortisol", "Кортизол", "Гормоны", "hormones", ""],
  ["total-ige", "Иммуноглобулин E общий", "Иммунология", "immunology", "IgE"],
];

const UNIT_PATTERN = [
  "10\\^?\\d+\\s*\\/\\s*(?:л|мкл)",
  "(?:тыс|млн)\\.?\\s*\\/\\s*мкл",
  "мкмоль\\s*\\/\\s*л", "ммоль\\s*\\/\\s*л", "нмоль\\s*\\/\\s*л", "пмоль\\s*\\/\\s*л",
  "мкме\\s*\\/\\s*мл", "ме\\s*\\/\\s*мл", "ед\\s*\\/\\s*л",
  "нг\\s*\\/\\s*мл", "пг\\s*\\/\\s*мл", "мг\\s*\\/\\s*л", "г\\s*\\/\\s*дл", "г\\s*\\/\\s*л",
  "мг\\s*\\/\\s*дл", "мкг\\s*\\/\\s*л", "мм\\s*\\/\\s*ч", "фл", "пг", "%", "сек(?:унд[а-я]*)?",
].join("|");

const RESULT_PATTERN = "(?:[<>≤≥]?\\s*[+-]?\\d+(?:[.,]\\d+)?|положительн(?:ый|ая|о)|отрицательн(?:ый|ая|о)|не обнаружено|обнаружено|[abo]{1,3}\\s*\\([ivx]+\\)|rhd\\s*[+-])";
const HEADER_PATTERN = /^(?:исследование|показатель|результат|единиц|референс|норматив|комментар|пациент|заказ|биоматериал)/i;

export class LabPdfError extends Error {
  constructor(message, code = "LAB_PDF_INVALID") {
    super(message);
    this.name = "LabPdfError";
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value || "")
    .replaceAll("\u00a0", " ")
    .replace(/[‐‑‒—]/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedKey(value) {
  return normalizeText(value).toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasPosition(text, alias) {
  const match = text.match(new RegExp(`(?:^|[^a-zа-я0-9])(${escapedRegex(alias)})(?=$|[^a-zа-я0-9])`, "i"));
  return match ? (match.index || 0) + match[0].indexOf(match[1]) : -1;
}

function slug(value) {
  return normalizedKey(value)
    .replace(/[^a-zа-я0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "indicator";
}

function createAnalyteCatalog() {
  const catalog = new Map();
  for (const report of LAB_REPORTS) {
    for (const group of report.groups) {
      for (const item of group.items) {
        const key = normalizedKey(item.name);
        if (catalog.has(key)) continue;
        catalog.set(key, {
          id: slug(item.name),
          name: item.name,
          code: item.code || "",
          unit: item.unit || "",
          groupId: group.id,
          groupTitle: group.title,
          aliases: [item.name, ...(ANALYTE_ALIASES.get(key) || [])],
        });
      }
    }
  }
  for (const [id, name, groupTitle, groupId, code] of EXTRA_ANALYTES) {
    const key = normalizedKey(name);
    if (!catalog.has(key)) catalog.set(key, { id, name, code, unit: "", groupId, groupTitle, aliases: [name] });
  }
  return [...catalog.values()].sort((a, b) => (
    Math.max(...b.aliases.map((alias) => alias.length)) - Math.max(...a.aliases.map((alias) => alias.length))
  ));
}

const ANALYTE_CATALOG = createAnalyteCatalog();

function pdfItemsToLines(items) {
  const rowMap = new Map();
  for (const item of items) {
    if (!item?.str?.trim() || !Array.isArray(item.transform)) continue;
    const x = Number(item.transform[4]) || 0;
    const y = Number(item.transform[5]) || 0;
    const rowKey = Math.round(y / 2) * 2;
    const row = rowMap.get(rowKey) || { y: rowKey, items: [] };
    row.items.push({ x, text: item.str });
    rowMap.set(rowKey, row);
  }
  return [...rowMap.values()]
    .sort((a, b) => b.y - a.y)
    .map((row) => normalizeText(row.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ")))
    .filter(Boolean);
}

export function isPdfBuffer(value) {
  if (!Buffer.isBuffer(value) || value.length < 5) return false;
  return value.subarray(0, Math.min(value.length, 1024)).indexOf(Buffer.from("%PDF-")) >= 0;
}

export async function extractPdfLines(buffer) {
  if (!isPdfBuffer(buffer)) throw new LabPdfError("Загрузите корректный PDF-файл");
  let document;
  try {
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    });
    document = await loadingTask.promise;
    if (document.numPages > LAB_PDF_MAX_PAGES) {
      throw new LabPdfError(`В PDF должно быть не больше ${LAB_PDF_MAX_PAGES} страниц`, "LAB_PDF_TOO_MANY_PAGES");
    }
    const lines = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageLines = pdfItemsToLines(content.items);
      length += pageLines.reduce((sum, line) => sum + line.length, 0);
      if (length > LAB_PDF_MAX_TEXT_LENGTH) {
        throw new LabPdfError("В PDF слишком много текста", "LAB_PDF_TOO_MUCH_TEXT");
      }
      lines.push(...pageLines);
      page.cleanup();
    }
    return lines;
  } catch (error) {
    if (error instanceof LabPdfError) throw error;
    if (error?.name === "PasswordException") {
      throw new LabPdfError("Снимите пароль с PDF и загрузите его снова", "LAB_PDF_PASSWORD_PROTECTED");
    }
    throw new LabPdfError("PDF повреждён или имеет неподдерживаемый формат");
  } finally {
    await document?.destroy?.();
  }
}

function parseDateValue(dayValue, monthValue, yearValue) {
  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = Number(yearValue.length === 2 ? `20${yearValue}` : yearValue);
  if (year < 2000 || year > new Date().getFullYear() + 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) return null;
  return date;
}

function findReportDate(lines, fallbackDate) {
  const preferred = lines.filter((line) => /дата (?:взятия|исследования|результата|заказа)|биоматериал/i.test(line));
  const candidates = [];
  for (const line of [...preferred, ...lines]) {
    for (const match of line.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g)) {
      const date = parseDateValue(match[1], match[2], match[3]);
      if (date) candidates.push(date);
    }
    if (candidates.length && preferred.includes(line)) break;
  }
  if (!candidates.length) return new Date(fallbackDate);
  return candidates.sort((a, b) => b.getTime() - a.getTime())[0];
}

function formatReportDate(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return {
    date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    dateLabel: `${day} ${RU_MONTHS[month]} ${year}`,
    shortDate: `${String(day).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}.${String(year).slice(-2)}`,
  };
}

function findLabName(text) {
  if (/инвитро|invitro/i.test(text)) return "ИНВИТРО";
  if (/(?:^|\W)емл(?:\W|$)|единая медицинская лаборатория/i.test(text)) return "ЕМЛ";
  if (/хеликс|helix/i.test(text)) return "Хеликс";
  if (/гемотест|gemotest/i.test(text)) return "Гемотест";
  if (/(?:^|\W)kdl(?:\W|$)|кдл/i.test(text)) return "KDL";
  if (/ситилаб|citilab/i.test(text)) return "Ситилаб";
  return "Загруженный PDF";
}

function findUnit(text) {
  const match = normalizeText(text).match(new RegExp(`(?:^|\\s)(${UNIT_PATTERN})(?=\\s|$)`, "i"));
  return match ? { unit: normalizeText(match[1]), index: match.index + match[0].indexOf(match[1]), end: match.index + match[0].indexOf(match[1]) + match[1].length } : null;
}

function extractReference(text) {
  const normalized = normalizeText(text)
    .replace(/^[*↑↓!\s]+/, "")
    .replace(/(?:норма|референс(?:ные значения)?|reference)\s*:?[ ]*/i, "");
  const range = normalized.match(/(?:желательно\s*)?(?:от\s*)?[<>≤≥]?\s*\d+(?:[.,]\d+)?(?:\s*(?:–|-|до)\s*\d+(?:[.,]\d+)?)?/i);
  return range ? normalizeText(range[0]) : "";
}

function numericValue(value) {
  const match = String(value).match(/[+-]?\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : null;
}

function statusFromReference(value, reference, line) {
  if (/↑|выше нормы|повышен/i.test(line)) return "high";
  if (/↓|ниже нормы|понижен/i.test(line)) return "low";
  const number = numericValue(value);
  if (number === null) return "info";
  const normalized = normalizedKey(reference);
  const range = normalized.match(/(?:от\s*)?([+-]?\d+(?:[.,]\d+)?)\s*(?:–|-|до)\s*([+-]?\d+(?:[.,]\d+)?)/);
  if (range) {
    const low = Number(range[1].replace(",", "."));
    const high = Number(range[2].replace(",", "."));
    if (number < low) return "low";
    if (number > high) return "high";
  }
  const upper = normalized.match(/[<≤]\s*([+-]?\d+(?:[.,]\d+)?)/);
  if (upper && number >= Number(upper[1].replace(",", "."))) return "high";
  const lower = normalized.match(/[>≥]\s*([+-]?\d+(?:[.,]\d+)?)/);
  if (lower && number <= Number(lower[1].replace(",", "."))) return "low";
  return "normal";
}

function itemFromKnownLine(line, entry) {
  const normalized = normalizeText(line);
  const searchable = normalizedKey(normalized);
  const aliasMatch = entry.aliases
    .map(normalizedKey)
    .sort((a, b) => b.length - a.length)
    .map((alias) => ({ alias, index: aliasPosition(searchable, alias) }))
    .find((candidate) => candidate.index >= 0);
  if (!aliasMatch) return null;
  const tail = normalizeText(normalized.slice(aliasMatch.index + aliasMatch.alias.length));
  const valueMatch = tail.match(new RegExp(`(?:^|\\s)(${RESULT_PATTERN})(?=\\s|$)`, "i"));
  if (!valueMatch) return null;
  const value = normalizeText(valueMatch[1]);
  const afterValue = normalizeText(tail.slice((valueMatch.index || 0) + valueMatch[0].length));
  const unitMatch = findUnit(afterValue);
  const unit = unitMatch?.unit || entry.unit;
  const referenceSource = unitMatch ? afterValue.slice(unitMatch.end) : afterValue;
  const reference = extractReference(referenceSource);
  return {
    code: entry.code,
    name: entry.name,
    value,
    unit,
    reference,
    status: statusFromReference(value, reference, normalized),
  };
}

function itemFromGenericLine(line) {
  const normalized = normalizeText(line);
  if (HEADER_PATTERN.test(normalized)) return null;
  const pattern = new RegExp(`^(.{2,120}?)\\s+(${RESULT_PATTERN})\\s+(${UNIT_PATTERN})(?:\\s+(.+))?$`, "i");
  const match = normalized.match(pattern);
  if (!match) return null;
  const name = normalizeText(match[1]).replace(/^(?:[a-z]{2,6}|\d{1,3})[.):\s-]+/i, "");
  if (name.length < 2 || /\b(?:дата|возраст|номер|заказ)\b/i.test(name)) return null;
  const value = normalizeText(match[2]);
  const unit = normalizeText(match[3]);
  const reference = extractReference(match[4] || "");
  return { code: "", name, value, unit, reference, status: statusFromReference(value, reference, normalized) };
}

export function parseLabText(linesOrText, {
  id = "uploaded-report",
  filename = "Анализы.pdf",
  uploadedAt = new Date(),
} = {}) {
  const lines = (Array.isArray(linesOrText) ? linesOrText : String(linesOrText || "").split(/\r?\n/))
    .map(normalizeText)
    .filter(Boolean);
  const fullText = lines.join("\n");
  if (!fullText.trim()) {
    throw new LabPdfError("В PDF нет текстового слоя. Загрузите оригинал из лаборатории, а не скан", "LAB_PDF_NO_TEXT");
  }

  const groups = new Map();
  const matchedAnalytes = new Set();
  const matchedLines = new Set();
  const addItem = (groupId, groupTitle, item) => {
    if (!groups.has(groupId)) groups.set(groupId, { id: groupId, title: groupTitle, items: [] });
    groups.get(groupId).items.push(item);
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const entry of ANALYTE_CATALOG) {
      if (matchedAnalytes.has(entry.id)) continue;
      const item = itemFromKnownLine(line, entry);
      if (!item) continue;
      matchedAnalytes.add(entry.id);
      matchedLines.add(lineIndex);
      addItem(entry.groupId, entry.groupTitle, item);
      break;
    }
  }

  const genericNames = new Set();
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (matchedLines.has(lineIndex)) continue;
    const item = itemFromGenericLine(lines[lineIndex]);
    const key = normalizedKey(item?.name);
    if (!item || matchedAnalytes.has(slug(item.name)) || genericNames.has(key)) continue;
    genericNames.add(key);
    addItem("other", "Другие показатели", item);
  }

  const parsedGroups = [...groups.values()].filter((group) => group.items.length);
  if (!parsedGroups.length) {
    throw new LabPdfError(
      "Не удалось распознать показатели. Убедитесь, что PDF содержит таблицу результатов с единицами измерения",
      "LAB_PDF_NO_RESULTS",
    );
  }

  const reportDate = findReportDate(lines, uploadedAt);
  const dateFields = formatReportDate(reportDate);
  const resultCount = parsedGroups.reduce((sum, group) => sum + group.items.length, 0);
  return {
    id,
    ...dateFields,
    lab: findLabName(fullText),
    note: `${resultCount} ${resultCount === 1 ? "показатель" : "показателей"} · ${filename}`,
    groups: parsedGroups,
  };
}

export async function parseLabPdf(buffer, options) {
  if (!Buffer.isBuffer(buffer) || buffer.length > LAB_PDF_MAX_BYTES) {
    throw new LabPdfError("PDF должен быть не больше 12 МБ", "LAB_PDF_TOO_LARGE");
  }
  const lines = await extractPdfLines(buffer);
  return parseLabText(lines, options);
}
