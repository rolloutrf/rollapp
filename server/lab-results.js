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
