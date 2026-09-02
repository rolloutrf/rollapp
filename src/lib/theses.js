const BLOCK_SEPARATOR_PATTERN = /\r?\n[ \t]*\r?\n/gu;
const QUOTE_PREFIX_PATTERN = /^>[ \t]?/u;
const LEGACY_HEADING_PATTERN = /^#{1,6}[ \t]+Тезисы[ \t]*$/iu;

export function parseThesesMarkdown(source) {
  return String(source || "")
    .trim()
    .split(BLOCK_SEPARATOR_PATTERN)
    .map((block) => block
      .split(/\r?\n/gu)
      .map((line) => line.replace(QUOTE_PREFIX_PATTERN, ""))
      .join("\n")
      .trim())
    .filter((thesis) => thesis && !LEGACY_HEADING_PATTERN.test(thesis));
}

export function serializeThesesMarkdown(theses) {
  const blocks = theses
    .map((thesis) => String(thesis || "").trim())
    .filter(Boolean)
    .map((thesis) => thesis
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n"));

  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
}
