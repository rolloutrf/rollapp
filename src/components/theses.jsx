import { EditableMarkdownDocument } from "@/components/career-content";
import thesesSource from "@/data/theses.md?raw";

export function Theses() {
  return (
    <EditableMarkdownDocument
      scope="identity"
      section="theses"
      source={thesesSource}
      label="Тезисы"
      className="theses-source"
    />
  );
}
