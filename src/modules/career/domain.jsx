import { EditableMarkdownDocument } from "@/modules/career/career-content.jsx";

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
