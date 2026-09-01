import { EditableMarkdownDocument } from "@/components/career-content";

const STRENGTHS = [];

const DEVELOPMENT_AREAS = [];

function planItemsMarkdown(items) {
  return items.map((item) => [
    `### ${item.title}`,
    item.summary,
    `### ${item.approachTitle}`,
    ...item.approach.map((entry) => `- ${entry}`),
    "### Что мне с этим делать",
    ...item.actions.map((entry) => `- ${entry}`),
  ].join("\n\n")).join("\n\n");
}

const DEVELOPMENT_PLAN_SOURCE = [];

export function DevelopmentPlan() {
  return (
    <EditableMarkdownDocument
      section="development"
      source={DEVELOPMENT_PLAN_SOURCE}
      label="Индивидуальный план развития"
      className="development-plan"
    />
  );
}
