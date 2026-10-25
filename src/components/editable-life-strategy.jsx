import { EditableMarkdownDocument } from "@/components/career-content";

export function EditableLifeStrategy() {
  return (
    <EditableMarkdownDocument
      scope="identity"
      section="life-strategy"
      source={""}
      label="Жизненная стратегия"
      collapsibleAges
    />
  );
}
