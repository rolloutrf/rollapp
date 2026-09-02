const GROUP_HEADING_PATTERN = /^##\s+(.+)$/u;
const SECTION_HEADING_PATTERN = /^###\s+(.+)$/u;
const LIST_ITEM_PATTERN = /^-\s+(.+)$/u;

function cleanBlock(lines) {
  return lines.join("\n").trim();
}

export function parseDevelopmentPlanMarkdown(source) {
  const groups = [];
  let group = null;
  let item = null;
  let stage = "";

  String(source || "").replace(/\r\n?/gu, "\n").split("\n").forEach((line) => {
    const groupHeading = line.match(GROUP_HEADING_PATTERN);
    if (groupHeading) {
      group = { title: groupHeading[1].trim(), introLines: [], items: [] };
      groups.push(group);
      item = null;
      stage = "intro";
      return;
    }

    const sectionHeading = line.match(SECTION_HEADING_PATTERN);
    if (sectionHeading && group) {
      const title = sectionHeading[1].trim();
      if (!item || item.actionsTitle) {
        item = {
          title,
          summaryLines: [],
          approachTitle: "",
          approach: [],
          actionsTitle: "",
          actions: [],
        };
        group.items.push(item);
        stage = "summary";
      } else if (!item.approachTitle) {
        item.approachTitle = title;
        stage = "approach";
      } else {
        item.actionsTitle = title;
        stage = "actions";
      }
      return;
    }

    if (!group) return;
    if (stage === "intro") group.introLines.push(line);
    else if (stage === "summary") item.summaryLines.push(line);
    else if (stage === "approach" || stage === "actions") {
      const listItem = line.match(LIST_ITEM_PATTERN);
      if (listItem) item[stage].push(listItem[1].trim());
    }
  });

  return {
    groups: groups.map(({ title, introLines, items }) => ({
      title,
      intro: cleanBlock(introLines),
      items: items.map(({ summaryLines, ...entry }) => ({
        ...entry,
        summary: cleanBlock(summaryLines),
        approachTitle: entry.approachTitle || "Как использовать",
        actionsTitle: entry.actionsTitle || "Что мне с этим делать",
      })),
    })),
  };
}

export function serializeDevelopmentPlanMarkdown({ groups = [] }) {
  const blocks = [];

  groups.forEach((group) => {
    blocks.push(`## ${String(group.title || "").trim()}`);
    const intro = String(group.intro || "").trim();
    if (intro) blocks.push(intro);

    group.items.forEach((item) => {
      blocks.push(`### ${String(item.title || "").trim()}`);
      const summary = String(item.summary || "").trim();
      if (summary) blocks.push(summary);
      blocks.push(`### ${String(item.approachTitle || "Как использовать").trim()}`);
      if (item.approach.length) blocks.push(item.approach.map((entry) => `- ${entry.trim()}`).join("\n"));
      blocks.push(`### ${String(item.actionsTitle || "Что мне с этим делать").trim()}`);
      if (item.actions.length) blocks.push(item.actions.map((entry) => `- ${entry.trim()}`).join("\n"));
    });
  });

  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
}

export function moveDevelopmentPlanItem(plan, fromGroupIndex, itemIndex, toGroupIndex) {
  const groups = Array.isArray(plan?.groups) ? plan.groups : [];
  if (fromGroupIndex === toGroupIndex) return plan;
  const item = groups[fromGroupIndex]?.items?.[itemIndex];
  if (!item || !groups[toGroupIndex]) return plan;

  return {
    ...plan,
    groups: groups.map((group, groupIndex) => {
      if (groupIndex === fromGroupIndex) {
        return { ...group, items: group.items.filter((_, index) => index !== itemIndex) };
      }
      if (groupIndex === toGroupIndex) {
        return { ...group, items: [...group.items, item] };
      }
      return group;
    }),
  };
}
