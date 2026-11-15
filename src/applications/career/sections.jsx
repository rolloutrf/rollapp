import { AboutMe } from "@/modules/career/about-me.jsx";
import { CvResume } from "@/modules/career/cv-resume.jsx";
import { DevelopmentPlan } from "@/modules/career/development-plan.jsx";
import { Domain } from "@/modules/career/domain.jsx";
import { PerformanceReview } from "@/modules/career/performance-review.jsx";

const sections = {
  about: AboutMe,
  cv: CvResume,
  "development-plan": DevelopmentPlan,
  domain: Domain,
  performance: PerformanceReview,
};

export default function CareerSection({ tab }) {
  const Section = sections[tab.id];
  return <Section />;
}
