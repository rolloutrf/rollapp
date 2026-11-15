import { CoachingSessions } from "@/modules/education/coaching-sessions.jsx";
import { Conferences } from "@/modules/education/conferences.jsx";
import { Courses } from "@/modules/education/courses.jsx";

const sections = {
  coaching: CoachingSessions,
  conferences: Conferences,
  courses: Courses,
};

export default function EducationSection({ tab }) {
  const Section = sections[tab.id];
  return <Section />;
}
