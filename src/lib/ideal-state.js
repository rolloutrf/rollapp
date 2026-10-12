export function idealStateTopics(source) {
  const document = String(source || "");
  const headings = [...document.matchAll(/^##[ \t]+(.+?)[ \t]*\r?$/gm)];
  return headings.map((heading, index) => ({ id: String(index), title: heading[1], end: headings[index + 1]?.index ?? document.length }));
}

export function appendIdealStateItem(source, { topicId, topicTitle, text }) {
  const document = String(source || "");
  const value = text.trim();
  if (!value) throw new Error("Опишите желаемое состояние.");
  const item = `- ${value.replace(/\r\n/g, "\n").replace(/\n/g, "\n  ")}\n`;
  if (topicId === "new") {
    const title = topicTitle.trim();
    if (!title || /[\r\n]/.test(title)) throw new Error("Укажите название темы в одну строку.");
    return `${document.trimEnd()}${document.trim() ? "\n\n" : ""}## ${title}\n${item}`;
  }
  const topic = idealStateTopics(document).find(({ id }) => id === topicId);
  if (!topic) throw new Error("Тема не найдена. Выберите тему ещё раз.");
  return `${document.slice(0, topic.end).trimEnd()}\n${item}${topic.end < document.length ? "\n" : ""}${document.slice(topic.end)}`;
}
