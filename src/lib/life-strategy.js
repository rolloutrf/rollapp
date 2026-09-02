const AGE_HEADING_PATTERN = /^#[ \t]+(\d+[ \t]+y\.o\.?)[ \t]*\r?$/gimu;
const LEADING_NEWLINES_PATTERN = /^(?:\r?\n)*/u;
const TRAILING_NEWLINES_PATTERN = /(?:\r?\n)*$/u;
const SECTION_SEPARATOR_PATTERN = /(?:\r?\n)*---[ \t]*(?:\r?\n)*$/u;

export function getLifeStrategyPeriods(source) {
  const document = String(source || "");
  const headings = [...document.matchAll(AGE_HEADING_PATTERN)];

  return headings.map((heading, index) => {
    const rawContentStart = heading.index + heading[0].length;
    const rawContentEnd = headings[index + 1]?.index ?? document.length;
    const rawContent = document.slice(rawContentStart, rawContentEnd);
    const separator = rawContent.match(SECTION_SEPARATOR_PATTERN);
    const contentBoundary = separator ? rawContentEnd - separator[0].length : rawContentEnd;
    const contentWithLeadingWhitespace = document.slice(rawContentStart, contentBoundary);
    const leadingNewlines = contentWithLeadingWhitespace.match(LEADING_NEWLINES_PATTERN)?.[0] || "";
    const contentWithTrailingWhitespace = contentWithLeadingWhitespace.slice(leadingNewlines.length);
    const trailingNewlines = contentWithTrailingWhitespace.match(TRAILING_NEWLINES_PATTERN)?.[0] || "";
    const contentStart = rawContentStart + leadingNewlines.length;
    const contentEnd = contentBoundary - trailingNewlines.length;
    const age = heading[1].replace(/[ \t]+/gu, " ");

    return {
      id: `age-${age.match(/\d+/u)?.[0] || index}-${index}`,
      title: age,
      content: document.slice(contentStart, contentEnd),
      contentStart,
      contentEnd,
    };
  });
}

export function replaceLifeStrategyPeriod(source, periodId, content) {
  const document = String(source || "");
  const period = getLifeStrategyPeriods(document).find((item) => item.id === periodId);
  if (!period) throw new Error("Период жизненной стратегии не найден");

  const nextContent = String(content || "")
    .replace(/\r\n/gu, "\n")
    .replace(/^\n+/u, "")
    .replace(/\n+$/u, "");

  return `${document.slice(0, period.contentStart)}${nextContent}${document.slice(period.contentEnd)}`;
}
