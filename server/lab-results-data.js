// Sanitized transcription of the owner's private laboratory summaries.
export const LAB_REPORTS = [
  {
    id: "2026-07-15",
    date: "2026-07-15",
    dateLabel: "15 июля 2026",
    shortDate: "15.07.26",
    lab: "ИНВИТРО СПб",
    note: "Последнее исследование: биохимия, клинический анализ крови и лейкоцитарная формула.",
    groups: [
      {
        id: "biochemistry",
        title: "Биохимия",
        items: [
          { code: "ALT", name: "АлАТ", value: "39", unit: "Ед/л", reference: "< 41", status: "normal" },
          { code: "AST", name: "АсАТ", value: "22", unit: "Ед/л", reference: "< 37", status: "normal" },
          { name: "Билирубин общий", value: "14,5", unit: "мкмоль/л", reference: "3,4–20,5", status: "normal" },
          { name: "Глюкоза", value: "5,1", unit: "ммоль/л", reference: "4,1–6", status: "normal" },
          { name: "Креатинин", value: "91", unit: "мкмоль/л", reference: "64–104", status: "normal" },
          { name: "Мочевая кислота", value: "393", unit: "мкмоль/л", reference: "210–420", status: "normal", note: "Целевой уровень при подагре — < 360" },
          { name: "Общий белок", value: "68", unit: "г/л", reference: "64–83", status: "normal" },
          { name: "Холестерин", value: "4,25", unit: "ммоль/л", reference: "желательно < 5,0", status: "normal" },
        ],
      },
      {
        id: "blood-count",
        title: "Клинический анализ крови",
        items: [
          { code: "HCT", name: "Гематокрит", value: "42,5", unit: "%", reference: "39–49", status: "normal" },
          { code: "HGB", name: "Гемоглобин", value: "15,1", unit: "г/дл", reference: "13,2–17,3", status: "normal" },
          { code: "RBC", name: "Эритроциты", value: "5,07", unit: "млн/мкл", reference: "4,3–5,7", status: "normal" },
          { code: "MCV", name: "Средний объём эритроцита", value: "83,8", unit: "фл", reference: "80–99", status: "normal" },
          { code: "RDW", name: "Ширина распределения эритроцитов", value: "12,4", unit: "%", reference: "11,6–14,8", status: "normal" },
          { code: "MCH", name: "Содержание Hb в эритроците", value: "29,7", unit: "пг", reference: "27–34", status: "normal" },
          { code: "MCHC", name: "Концентрация Hb в эритроцитах", value: "35,5", unit: "г/дл", reference: "32–37", status: "normal" },
          { code: "PLT", name: "Тромбоциты", value: "267", unit: "тыс/мкл", reference: "150–400", status: "normal" },
          { code: "WBC", name: "Лейкоциты", value: "4,56", unit: "тыс/мкл", reference: "4,5–11", status: "normal" },
          { name: "СОЭ", value: "2", unit: "мм/ч", reference: "< 15", status: "normal" },
        ],
      },
      {
        id: "differential",
        title: "Лейкоцитарная формула",
        items: [
          { name: "Нейтрофилы", value: "52,9", unit: "%", reference: "48–78", status: "normal", secondary: "2,41 тыс/мкл · норма 1,78–5,38" },
          { name: "Лимфоциты", value: "37", unit: "%", reference: "19–37", status: "normal", secondary: "1,69 тыс/мкл · норма 1,32–3,57" },
          { name: "Моноциты", value: "7,2", unit: "%", reference: "3–11", status: "normal", secondary: "0,33 тыс/мкл · норма 0,2–0,95" },
          { name: "Эозинофилы", value: "2,6", unit: "%", reference: "1–5", status: "normal", secondary: "0,12 тыс/мкл · норма < 0,7" },
          { name: "Базофилы", value: "0,3", unit: "%", reference: "< 1,0", status: "normal", secondary: "0,01 тыс/мкл · норма < 0,2" },
        ],
      },
    ],
  },
  {
    id: "2025-08-10",
    date: "2025-08-10",
    dateLabel: "10 августа 2025",
    shortDate: "10.08.25",
    lab: "ЕМЛ, Санкт-Петербург",
    note: "Контроль клинического анализа, коагулограмма, группа крови и резус-фактор.",
    groups: [
      {
        id: "blood-type",
        title: "Группа крови",
        items: [
          { name: "Группа крови", value: "A (II)", unit: "", reference: "", status: "info" },
          { name: "Резус-фактор", value: "RhD+", unit: "положительный", reference: "", status: "info" },
        ],
      },
      {
        id: "blood-count",
        title: "Клинический анализ крови",
        items: [
          { code: "WBC", name: "Лейкоциты", value: "5,94", unit: "тыс/мкл", reference: "", status: "normal" },
          { code: "RBC", name: "Эритроциты", value: "5,22", unit: "млн/мкл", reference: "", status: "normal" },
          { code: "HGB", name: "Гемоглобин", value: "15,2", unit: "г/дл", reference: "", status: "normal" },
          { code: "HCT", name: "Гематокрит", value: "44,5", unit: "%", reference: "", status: "normal" },
          { code: "MCV", name: "Средний объём эритроцита", value: "85,2", unit: "фл", reference: "", status: "normal" },
          { code: "PLT", name: "Тромбоциты", value: "255", unit: "тыс/мкл", reference: "", status: "normal" },
          { name: "СОЭ", value: "2", unit: "мм/ч", reference: "< 15", status: "normal" },
        ],
      },
      {
        id: "differential",
        title: "Лейкоцитарная формула",
        items: [
          { name: "Нейтрофилы", value: "56", unit: "%", reference: "48–78", status: "normal", secondary: "3,34 тыс/мкл · норма 1,78–5,38" },
          { name: "Лимфоциты", value: "33,9", unit: "%", reference: "19–37", status: "normal", secondary: "2,01 тыс/мкл · норма 1,32–3,57" },
          { name: "Моноциты", value: "7,3", unit: "%", reference: "3–11", status: "normal", secondary: "0,43 тыс/мкл · норма 0,2–0,95" },
          { name: "Эозинофилы", value: "2,6", unit: "%", reference: "1–5", status: "normal", secondary: "0,15 тыс/мкл · норма < 0,7" },
          { name: "Базофилы", value: "0,2", unit: "%", reference: "< 1,0", status: "normal", secondary: "0,01 тыс/мкл · норма < 0,2" },
        ],
      },
      {
        id: "coagulation",
        title: "Коагулограмма",
        items: [
          { name: "Протромбиновое время", value: "10,7", unit: "сек", reference: "10–13,2", status: "normal" },
          { name: "Протромбин по Квику", value: "109", unit: "%", reference: "80–133", status: "normal" },
          { name: "МНО", value: "0,95", unit: "", reference: "", status: "normal" },
          { name: "АЧТВ", value: "29,7", unit: "сек", reference: "25,4–36,9", status: "normal" },
          { name: "Фибриноген", value: "3,1", unit: "г/л", reference: "2–4", status: "normal" },
          { name: "Тромбиновое время", value: "12,9", unit: "сек", reference: "10,3–16,6", status: "normal" },
        ],
      },
    ],
  },
  {
    id: "2025-07-07",
    date: "2025-07-07",
    dateLabel: "7 июля 2025",
    shortDate: "07.07.25",
    lab: "ЕМЛ, Санкт-Петербург",
    note: "Расширенное исследование: кровь, щитовидная железа, белковый и витаминный статус.",
    groups: [
      {
        id: "blood-count",
        title: "Клинический анализ крови",
        items: [
          { code: "WBC", name: "Лейкоциты", value: "4,24", unit: "тыс/мкл", reference: "4,5–11", status: "low" },
          { code: "RBC", name: "Эритроциты", value: "5,10", unit: "млн/мкл", reference: "4,3–5,7", status: "normal" },
          { code: "HGB", name: "Гемоглобин", value: "147", unit: "г/л", reference: "132–173", status: "normal" },
          { code: "HCT", name: "Гематокрит", value: "44,1", unit: "%", reference: "39–49", status: "normal" },
          { code: "MCV", name: "Средний объём эритроцита", value: "86,4", unit: "фл", reference: "80–99", status: "normal" },
          { code: "PLT", name: "Тромбоциты", value: "254", unit: "тыс/мкл", reference: "150–400", status: "normal" },
          { name: "СОЭ", value: "2", unit: "мм/ч", reference: "0–15", status: "normal" },
          { name: "Нейтрофилы", value: "50,8", unit: "%", reference: "48–78", status: "normal" },
          { name: "Лимфоциты", value: "39,6", unit: "%", reference: "19–37", status: "high" },
        ],
      },
      {
        id: "thyroid",
        title: "Щитовидная железа",
        items: [
          { name: "Т3 свободный", value: "2,83", unit: "пг/мл", reference: "2–4,2", status: "normal" },
          { name: "Т4 свободный", value: "14,9", unit: "пмоль/л", reference: "11,45–22,14", status: "normal" },
          { name: "ТТГ", value: "1,96", unit: "мкМЕ/мл", reference: "0,3–4,5", status: "normal" },
        ],
      },
      {
        id: "metabolism",
        title: "Белковый и железистый обмен",
        items: [
          { name: "Общий белок", value: "67,38", unit: "г/л", reference: "66–83", status: "normal" },
          { name: "Альбумин", value: "45,25", unit: "г/л", reference: "35–53", status: "normal" },
          { name: "Железо", value: "16,13", unit: "мкмоль/л", reference: "8,1–28,3", status: "normal" },
          { name: "Ферритин", value: "58,2", unit: "нг/мл", reference: "24–425", status: "normal" },
        ],
      },
      {
        id: "vitamins",
        title: "Витамины",
        items: [
          { name: "Витамин B12", value: "392,81", unit: "пг/мл", reference: "180–916", status: "normal", note: "В сводке отмечено улучшение с 130 пг/мл" },
          { name: "Витамин B9 · фолиевая кислота", value: "4,9", unit: "нмоль/л", reference: "7,25–44,4", status: "low" },
          { name: "Витамин D · 25-OH", value: "29", unit: "нг/мл", reference: "30–100", status: "low" },
        ],
      },
    ],
  },
];

export const LAB_TRENDS = [
  {
    id: "wbc",
    name: "Лейкоциты",
    unit: "тыс/мкл",
    reference: "4,5–11",
    points: [
      { date: "07.07.25", value: 4.24, label: "4,24", status: "low" },
      { date: "10.08.25", value: 5.94, label: "5,94", status: "normal" },
      { date: "15.07.26", value: 4.56, label: "4,56", status: "normal" },
    ],
  },
  {
    id: "hemoglobin",
    name: "Гемоглобин",
    unit: "г/дл",
    reference: "13,2–17,3",
    points: [
      { date: "07.07.25", value: 14.7, label: "14,7", status: "normal" },
      { date: "10.08.25", value: 15.2, label: "15,2", status: "normal" },
      { date: "15.07.26", value: 15.1, label: "15,1", status: "normal" },
    ],
    note: "147 г/л приведено к 14,7 г/дл для сопоставления",
  },
  {
    id: "platelets",
    name: "Тромбоциты",
    unit: "тыс/мкл",
    reference: "150–400",
    points: [
      { date: "07.07.25", value: 254, label: "254", status: "normal" },
      { date: "10.08.25", value: 255, label: "255", status: "normal" },
      { date: "15.07.26", value: 267, label: "267", status: "normal" },
    ],
  },
  {
    id: "lymphocytes",
    name: "Лимфоциты",
    unit: "%",
    reference: "19–37",
    points: [
      { date: "07.07.25", value: 39.6, label: "39,6", status: "high" },
      { date: "10.08.25", value: 33.9, label: "33,9", status: "normal" },
      { date: "15.07.26", value: 37, label: "37", status: "normal" },
    ],
  },
];

export const LAB_ATTENTION_ITEMS = [
  {
    name: "Фолиевая кислота",
    code: "B9",
    value: "4,9 нмоль/л",
    reference: "норма от 7,25",
    date: "07.07.2025",
    level: 68,
  },
  {
    name: "Витамин D",
    code: "25-OH",
    value: "29 нг/мл",
    reference: "норма от 30",
    date: "07.07.2025",
    level: 97,
  },
];

export function flattenLabReport(report) {
  return report.groups.flatMap((group) => group.items);
}

export function labReportStatus(report) {
  const items = flattenLabReport(report);
  const attentionCount = items.filter((item) => item.status === "low" || item.status === "high").length;
  return { resultCount: items.length, attentionCount };
}

function normalizedMergeKey(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
}

function reportSources(report) {
  const sources = Array.isArray(report.sources)
    ? report.sources
    : report.source
      ? [report.source]
      : [];
  if (!sources.length && report.lab) return [{ lab: report.lab }];
  return sources.map((source) => ({ ...source, lab: source.lab || report.lab || "Лаборатория не указана" }));
}

function uploadedAtValue(report) {
  const sourceDates = reportSources(report)
    .map((source) => Date.parse(source.uploadedAt || ""))
    .filter(Number.isFinite);
  return sourceDates.length ? Math.max(...sourceDates) : 0;
}

function mergeReportsForDate(reports) {
  const orderedReports = [...reports].sort((left, right) => (
    Number(Boolean(right.source?.uploaded)) - Number(Boolean(left.source?.uploaded))
    || uploadedAtValue(right) - uploadedAtValue(left)
  ));
  const primary = orderedReports[0];
  if (orderedReports.length === 1) {
    return {
      ...primary,
      labs: primary.labs || (primary.lab ? [primary.lab] : []),
      sources: reportSources(primary),
    };
  }

  const labs = [];
  const sources = [];
  const sourceKeys = new Set();
  for (const report of orderedReports) {
    if (report.lab && !labs.some((lab) => normalizedMergeKey(lab) === normalizedMergeKey(report.lab))) labs.push(report.lab);
    for (const source of reportSources(report)) {
      const key = source.pdfUrl || `${normalizedMergeKey(source.lab)}:${source.filename || ""}`;
      if (sourceKeys.has(key)) continue;
      sourceKeys.add(key);
      sources.push(source);
    }
  }

  const groups = [];
  const groupsByKey = new Map();
  const selectedResults = new Map();
  for (const report of orderedReports) {
    for (const group of report.groups || []) {
      const groupKey = normalizedMergeKey(group.id || group.title);
      let mergedGroup = groupsByKey.get(groupKey);
      if (!mergedGroup) {
        mergedGroup = { id: group.id, title: group.title, items: [] };
        groupsByKey.set(groupKey, mergedGroup);
        groups.push(mergedGroup);
      }
      for (const item of group.items || []) {
        const analyteKey = normalizedMergeKey(item.code || item.name);
        const selected = selectedResults.get(analyteKey);
        if (selected) {
          const existing = selected.group.items[selected.index];
          selected.group.items[selected.index] = {
            ...existing,
            code: existing.code || item.code,
            reference: existing.reference || item.reference,
            secondary: existing.secondary || item.secondary,
            note: existing.note || item.note,
          };
          continue;
        }

        const { variants: ignoredVariants, ...nextItem } = item;
        const nextIndex = mergedGroup.items.push(nextItem) - 1;
        selectedResults.set(analyteKey, { group: mergedGroup, index: nextIndex });
      }
    }
  }

  const cleanGroups = groups.filter((group) => group.items.length);
  const resultCount = cleanGroups.reduce((count, group) => count + group.items.length, 0);
  const uploadedSource = sources.find((source) => source.pdfUrl);
  return {
    ...primary,
    id: `lab-${primary.date}`,
    lab: labs.join(" · "),
    labs,
    note: `${resultCount} ${resultCount === 1 ? "показатель" : "показателей"} · объединено за одну дату`,
    groups: cleanGroups,
    source: uploadedSource || primary.source,
    sources,
  };
}

export function mergeLabReportsByDate(reports) {
  const reportsByDate = new Map();
  for (const report of reports || []) {
    const dateKey = report.date || `undated:${report.id}`;
    reportsByDate.set(dateKey, [...(reportsByDate.get(dateKey) || []), report]);
  }
  return [...reportsByDate.values()]
    .map(mergeReportsForDate)
    .sort((left, right) => (
      String(right.date || "").localeCompare(String(left.date || ""))
      || uploadedAtValue(right) - uploadedAtValue(left)
    ));
}
