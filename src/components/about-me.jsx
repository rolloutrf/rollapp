import { EditableMarkdownDocument } from "@/components/career-content";
import aboutMeSource from "@/data/about-me.md?raw";

export function AboutMe() {
  return <EditableMarkdownDocument section="about" source={aboutMeSource} label="О себе" className="about-me-source" />;
}
