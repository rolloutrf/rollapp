import { EditableMarkdownDocument } from "@/modules/career/career-content.jsx";

export function PersonalDevelopmentPlan() {
  return (
    <EditableMarkdownDocument
      scope="identity"
      section="personal-development-plan"
      source=""
      label="Персональный План Развития"
      hideSourceLabels
      showActionLabel
    />
  );
}
