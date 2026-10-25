import { EditableMarkdownDocument } from "@/components/career-content";

export function Domain() {
  return (
    <EditableMarkdownDocument
      section="domain"
      source={""}
      label="Домен"
      className="career-domain"
      showActionLabel
    />
  );
}
