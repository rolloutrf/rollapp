import { EditableMarkdownDocument } from "@/components/career-content";
import domainSource from "@/data/domain.md?raw";

export function Domain() {
  return (
    <EditableMarkdownDocument
      section="domain"
      source={domainSource}
      label="Домен"
      className="career-domain"
    />
  );
}
