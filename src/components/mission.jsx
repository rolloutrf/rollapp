import { EditableMarkdownDocument } from "@/components/career-content";

export function Mission() {
  return (
    <EditableMarkdownDocument
      scope="identity"
      section="mission"
      source={""}
      label="Миссия"
      className="mission-text"
      hideSourceLabels
      showActionLabel
    />
  );
}
