import { EditableMarkdownDocument } from "@/components/career-content";
import cvSource from "@/data/cv.md?raw";

export function CvResume() {
  return <EditableMarkdownDocument section="cv" source={cvSource} label="CV" className="cv-source" />;
}
