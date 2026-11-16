import { Courses } from "@/modules/education/courses.jsx";
import { Conferences } from "@/modules/education/conferences.jsx";
import { CoachingSessions } from "@/modules/education/coaching-sessions.jsx";
import { Page, Scenario, hold, fixtureError } from "../support.jsx";

export default { id: "rollapp-education", title: "РОЛЛАПП/Модули/25 Образование" };

const displays = {
  courses: { View: Courses, key: "courses", titles: ["Дизайн цифровых продуктов", "История типографики", "Основы иллюстрации"], statuses: ["planned", "in_progress", "completed"] },
  conferences: { View: Conferences, key: "conferences", titles: ["Дизайн и город", "Системный дизайн", "Встреча практиков"], statuses: ["planned", "attended", "cancelled"] },
  "coaching-sessions": { View: CoachingSessions, key: "sessions", titles: ["Постановка цели", "Обратная связь", "План следующего шага"], statuses: ["planned", "completed", "cancelled"] },
};
function Education({ section, state, readOnly }) {
  const { View, key, titles, statuses } = displays[section];
  const path = `/education/${section}`;
  const items = state === "empty" ? [] : titles.map((title, index) => ({
    id: `teaching-${index}`, title, provider: "Школа дизайна", coach: "Софья Ветрова", location: "Москва", description: "Материалы и действия после встречи.",
    status: statuses[index], startedOn: "2026-10-12", completedOn: "2026-10-29", startsOn: "2026-11-19",
    endsOn: "2026-11-20", sessionOn: "2026-11-20", sessionTime: "10:30", durationMinutes: 60, role: "attendee", format: "offline",
  }));
  return <Scenario access={{ sphere: "education", section, readOnly }} routes={{
    [`GET ${path}`]: state === "loading" ? hold : state === "error" ? () => { throw fixtureError("Не удалось загрузить раздел образования."); } : { [key]: items, lists: [], groups: [] },
    [`POST ${path}`]: (_, body) => ({ [key === "sessions" ? "session" : section === "courses" ? "course" : "conference"]: { ...body, id: crypto.randomUUID() } }),
    [`PATCH ${path}/*`]: (target, body) => ({ [key === "sessions" ? "session" : section === "courses" ? "course" : "conference"]: { ...body, id: target.split("/").at(-1) } }),
  }}><Page className="typeset typeset-rollapp"><View /></Page></Scenario>;
}
export const CoursesList = { name: "Курсы и статусы", render: Education, args: { section: "courses", state: "ready", readOnly: false } };
export const ConferenceList = { ...CoursesList, name: "Конференции", args: { ...CoursesList.args, section: "conferences" } };
export const Coaching = { ...CoursesList, name: "Коучинг", args: { ...CoursesList.args, section: "coaching-sessions" } };
export const ReadOnly = { ...CoursesList, name: "Курсы только для чтения", args: { ...CoursesList.args, readOnly: true } };
export const Empty = { ...CoursesList, name: "Пустой список", args: { ...CoursesList.args, state: "empty" } };
export const Loading = { ...CoursesList, name: "Загрузка", args: { ...CoursesList.args, state: "loading" } };
export const Error = { ...CoursesList, name: "Ошибка и повтор", args: { ...CoursesList.args, state: "error" } };
