import { LabReportPanel, LabResults } from "@/modules/health/lab-results.jsx";
import { HealthTracker } from "@/modules/health/health-tracker.jsx";
import { Workouts } from "@/modules/health/workouts.jsx";
import { Medications } from "@/modules/health/medications.jsx";
import { localDateKey } from "../../shared/modules/planning/planning.js";
import { Page, Scenario, hold, fixtureError } from "../support.jsx";

export default { id: "rollapp-health", title: "РОЛЛАПП/Модули РОЛЛАПП/26 Здоровье" };

const groups = [{ id: "blood", title: "Общий анализ крови", items: [
  { name: "Гематокрит", code: "HCT", value: "42.5", unit: "%", reference: "39–49", status: "normal" },
  { name: "Гемоглобин", code: "HGB", value: "160", unit: "г/л", reference: "120–150", status: "high" },
  { name: "Лейкоциты", code: "WBC", value: "3.5", reference: "4–9", status: "low" },
]}];
const report = { id: "sample-lab", date: "2026-11-15", dateLabel: "15 ноября 2026", lab: "Лаборатория", groups };
function Health({ section, state, readOnly }) {
  const date = localDateKey(new Date());
  const workouts = state === "empty" ? [] : [{ id: "w1", title: "Тренировка в бассейне", status: "completed", workoutOn: date, workoutType: "swimming", durationMinutes: 45 }];
  const medications = state === "empty" ? [] : [{ id: "m1", title: "Назначение из примера", name: "Назначение из примера", status: "active", medicationForm: "capsule", dosage: "1 капсула", frequency: "custom", scheduleTimes: ["08:00", "20:00"] }];
  const sample = section === "sleep" ? [{ id: "sleep-1", date, bedtime: "23:30", wakeTime: "07:15", quality: 4, notes: "Спокойный сон" }]
    : [{ id: "meal-1", date, time: "12:00", mealType: "lunch", title: "Омлет и овощи", calories: 350, notes: "Домашний обед" }];
  const laboratory = state === "loading" ? hold : state === "error" ? () => { throw fixtureError("Лабораторные отчёты временно недоступны."); } : { reports: state === "empty" ? [] : [report] };
  const routes = {
    "GET /health/lab-results": laboratory,
    "GET /health/workouts": { workouts, lists: [] },
    "GET /health/medications": { medications, groups: [] },
    "DELETE /health/lab-results/sample-lab": { reports: [] },
    "GET /health/trackers/*": state === "loading" ? hold : () => { throw fixtureError("Не удалось загрузить записи."); },
  };
  return <Scenario path={`/app/spheres/health?tab=${section}`} access={{ sphere: "health", section, readOnly }} routes={routes}>
      <Page className="typeset typeset-rollapp">{section === "lab" ? <LabResults /> : section === "workouts" ? <Workouts /> : section === "medications" ? <Medications />
        : <HealthTracker tracker={section} initialEntries={state === "empty" ? [] : state === "ready" ? sample : undefined}
          onSaveEntry={async (entry, id) => ({ entry: { ...entry, id: id || crypto.randomUUID() } })} onDeleteEntry={async () => {}} />}
      </Page>
  </Scenario>;
}
export const LabHistory = { name: "История анализов", render: Health, args: { section: "lab", state: "ready", readOnly: false } };
export const Indicators = { name: "Показатели · ниже, в норме и выше", render: () => <Page><LabReportPanel report={report} /></Page> };
export const Empty = { ...LabHistory, name: "Анализов пока нет", args: { ...LabHistory.args, state: "empty" } };
export const Loading = { ...LabHistory, name: "Загрузка анализов", args: { ...LabHistory.args, state: "loading" } };
export const Error = { ...LabHistory, name: "Ошибка загрузки анализов", args: { ...LabHistory.args, state: "error" } };
export const Workout = { ...LabHistory, name: "Тренировки", args: { ...LabHistory.args, section: "workouts" } };
export const Medication = { ...LabHistory, name: "Препараты", args: { ...LabHistory.args, section: "medications" } };
export const Sleep = { ...LabHistory, name: "Сон", args: { ...LabHistory.args, section: "sleep" } };
export const Nutrition = { ...LabHistory, name: "Питание", args: { ...LabHistory.args, section: "nutrition" } };
export const ReadOnly = { ...LabHistory, name: "Анализы только для чтения", args: { ...LabHistory.args, readOnly: true } };
