import { EditableMarkdownDocument } from "@/components/career-content";
import missionSource from "@/data/mission.md?raw";

export function Mission() {
  return (
    <EditableMarkdownDocument
      scope="identity"
      section="mission"
      source={missionSource}
      label="Миссия"
      className="mission-text"
    />
  );
}
