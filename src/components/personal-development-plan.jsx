import { EditableMarkdownDocument } from "@/components/career-content";

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
