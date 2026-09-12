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

export function addLifeStrategyPeriod(source, age, content = "") {
  const document = String(source || "");
  const ageValue = String(age).trim();

  if (!/^\d+$/u.test(ageValue)) throw new Error("Укажите возраст целым числом");

  const ageNumber = Number(ageValue);
  if (ageNumber < 1 || ageNumber > 150) throw new Error("Возраст должен быть от 1 до 150 лет");

  const periods = getLifeStrategyPeriods(document);
  const duplicate = periods.some((period) => Number(period.title.match(/\d+/u)?.[0]) === ageNumber);
  if (duplicate) throw new Error(`Период для возраста ${ageNumber} уже существует`);

  const nextContent = String(content || "")
    .replace(/\r\n/gu, "\n")
    .replace(/^\n+/u, "")
    .replace(/\n+$/u, "");
  const periodBlock = [`# ${ageNumber} y.o.`, nextContent].filter(Boolean).join("\n\n");
  const headings = [...document.matchAll(AGE_HEADING_PATTERN)];
  const nextHeading = headings.find((heading) => Number(heading[1].match(/\d+/u)?.[0]) > ageNumber);

  if (nextHeading) {
    const before = document.slice(0, nextHeading.index).replace(/(?:\r?\n)+$/u, "");
    const after = document.slice(nextHeading.index).replace(/^(?:\r?\n)+/u, "");
    const prefix = before ? `${before}\n\n` : "";
    return `${prefix}${periodBlock}\n\n---\n\n${after}`;
  }

  const before = document.replace(/(?:\r?\n)+$/u, "");
  const alreadySeparated = /(?:^|\r?\n)---[ \t]*$/u.test(before);
  const separator = before
    ? periods.length && !alreadySeparated ? "\n\n---\n\n" : "\n\n"
    : "";

  return `${before}${separator}${periodBlock}\n`;
}
