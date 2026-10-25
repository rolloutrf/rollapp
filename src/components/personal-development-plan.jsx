import { EditableMarkdownDocument } from "@/components/career-content";
import personalDevelopmentPlanSource from "@/data/personal-development-plan.md?raw";

export function PersonalDevelopmentPlan() {
  return (
    <EditableMarkdownDocument
      scope="identity"
      section="personal-development-plan"
      source={personalDevelopmentPlanSource}
      label="Персональный План Развития"
      hideSourceLabels
      showActionLabel
    />
  );
}
