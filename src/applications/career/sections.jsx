import { AboutMe } from "@/components/about-me";
import { CvResume } from "@/components/cv-resume";
import { DevelopmentPlan } from "@/components/development-plan";
import { Domain } from "@/components/domain";
import { PerformanceReview } from "@/components/performance-review";

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
