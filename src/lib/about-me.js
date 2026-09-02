const QUESTION_HEADING_PATTERN = /^###\s+(?:\d+\.\s*)?(.+?)\s*$/u;

function cleanBlock(lines) {
  return lines.join("\n").trim();
}

export function parseAboutMeMarkdown(source) {
  const lines = String(source || "").replace(/\r\n?/gu, "\n").split("\n");
  const preamble = [];
  const questions = [];
  let current = null;

  lines.forEach((line) => {
    const heading = line.match(QUESTION_HEADING_PATTERN);
    if (heading) {
      current = { question: heading[1].trim(), descriptionLines: [] };
      questions.push(current);
      return;
    }

    if (current) current.descriptionLines.push(line);
    else preamble.push(line);
  });

  return {
    preamble: cleanBlock(preamble),
    questions: questions.map(({ question, descriptionLines }) => ({
      question,
      description: cleanBlock(descriptionLines),
    })),
  };
}

export function serializeAboutMeMarkdown({ preamble = "", questions = [] }) {
  const blocks = [];
  const cleanPreamble = String(preamble || "").trim();
  if (cleanPreamble) blocks.push(cleanPreamble);

  questions.forEach(({ question, description }, index) => {
    const cleanQuestion = String(question || "").trim();
    const cleanDescription = String(description || "").trim();
    if (!cleanQuestion || !cleanDescription) return;
    blocks.push(`### ${index + 1}. ${cleanQuestion}\n\n${cleanDescription}`);
  });

  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
}
