import { AboutMe } from "@/modules/career/about-me.jsx";
import { Domain } from "@/modules/career/domain.jsx";
import { CvResume } from "@/modules/career/cv-resume.jsx";
import { DevelopmentPlan } from "@/modules/career/development-plan.jsx";
import { PerformanceReview } from "@/modules/career/performance-review.jsx";
import { Page, Scenario, hold, fixtureError } from "../support.jsx";

export default { id: "rollapp-career", title: "РОЛЛАПП/Модули/23 Карьера" };

const sample = "# Профессиональный профиль\n\nРазвиваю дизайн продуктов и помогаю командам проверять гипотезы.\n\n## Опыт\n\n- Исследования и прототипирование\n- Дизайн цифровых сервисов\n";
const views = { about: AboutMe, domain: Domain, cv: CvResume, plan: DevelopmentPlan, performance: PerformanceReview };
function Career({ state, section, readOnly = false }) {
  const View = views[section];
  return <Scenario path={`/app/spheres/career?tab=${section}`} access={{ sphere: "career", section, readOnly }} routes={{
    "GET /career/content/*": () => {
      if (state === "loading") return hold();
      if (state === "error") throw fixtureError("Не удалось загрузить документ.");
      return { content: state === "empty" ? "" : sample };
    },
    "PATCH /career/content/*": (_, values) => values,
    "GET /business-marketplace/*": { items: [], listings: [], businesses: [] },
  }}><Page className="typeset typeset-rollapp"><View /></Page></Scenario>;
}
export const About = { name: "О себе · встроенный редактор", render: Career, args: { section: "about", state: "ready", readOnly: false } };
export const ReadOnly = { ...About, name: "Документ только для чтения", args: { ...About.args, readOnly: true } };
export const DomainStory = { ...About, name: "Домен", args: { ...About.args, section: "domain" } };
export const Cv = { ...About, name: "CV", args: { ...About.args, section: "cv" } };
export const Plan = { ...About, name: "Индивидуальный план развития", args: { ...About.args, section: "plan", state: "empty" } };
export const Review = { ...About, name: "Ревью и импорт PDF", args: { ...About.args, section: "performance", state: "empty" } };
export const Loading = { ...About, name: "Загрузка документа", args: { ...About.args, state: "loading" } };
export const Error = { ...About, name: "Ошибка документа и повтор", args: { ...About.args, state: "error" } };
