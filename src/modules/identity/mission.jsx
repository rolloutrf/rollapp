import { EditableMarkdownDocument } from "@/modules/career/career-content.jsx";

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
