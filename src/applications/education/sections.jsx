import { CoachingSessions } from "@/components/coaching-sessions";
import { Conferences } from "@/components/conferences";
import { Courses } from "@/components/courses";

const sections = {
  coaching: CoachingSessions,
  conferences: Conferences,
  courses: Courses,
};

export default function EducationSection({ tab }) {
  const Section = sections[tab.id];
  return <Section />;
}
