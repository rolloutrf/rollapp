const BLOCK_SEPARATOR_PATTERN = /\r?\n[ \t]*\r?\n/gu;
const QUOTE_PREFIX_PATTERN = /^>[ \t]?/u;
const HEADING_PREFIX_PATTERN = /^#{1,6}[ \t]+/u;

export function parseThesesMarkdown(source, legacyHeading = "Тезисы") {
  return String(source || "")
    .trim()
    .split(BLOCK_SEPARATOR_PATTERN)
    .filter((block) => !(HEADING_PREFIX_PATTERN.test(block)
      && block.replace(HEADING_PREFIX_PATTERN, "").trim().toLowerCase() === legacyHeading.toLowerCase()))
    .map((block) => block
      .split(/\r?\n/gu)
      .map((line) => line.replace(QUOTE_PREFIX_PATTERN, ""))
      .join("\n")
      .trim())
    .filter(Boolean);
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
