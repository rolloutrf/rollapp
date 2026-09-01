import { EditableMarkdownDocument } from "@/components/career-content";
import lifeStrategySource from "@/data/life-strategy.md?raw";

export function EditableLifeStrategy() {
  return (
    <EditableMarkdownDocument
      scope="identity"
      section="life-strategy"
      source={lifeStrategySource}
      label="Жизненная стратегия"
      collapsibleAges
    />
  );
}
