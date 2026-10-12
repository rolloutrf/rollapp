import { isPlanningDate } from "./planning.js";
import { addCalendarDays, dateFromKey } from "./planning-calendar.js";

export const RECURRENCE_OPTIONS = [
  { id: "none", label: "Не повторяется" },
  { id: "daily", label: "Каждый день" },
  { id: "weekdays", label: "По будням" },
  { id: "weekly", label: "Каждую неделю" },
  { id: "monthly", label: "Каждый месяц" },
  { id: "yearly", label: "Каждый год" },
];

export function recurrenceError({ dueOn, recurrence }) {
  if (!recurrence) return "";
  if (!isPlanningDate(dueOn)) return "Укажите дату начала повторения";
  if (!RECURRENCE_OPTIONS.some(({ id }) => id !== "none" && id === recurrence.frequency)) return "Выберите частоту повторения";
  if (recurrence.until && (!isPlanningDate(recurrence.until) || recurrence.until < dueOn)) return "Окончание повторения не может быть раньше первого события";
  return "";
}

const dayNumber = (key) => Date.parse(`${key}T00:00:00Z`) / 86400000;

export function occursOn(task, date) {
  if (!isPlanningDate(date) || !isPlanningDate(task.dueOn)) return false;
  if (!task.recurrence) return task.dueOn === date;
  if (recurrenceError(task) || date < task.dueOn || (task.recurrence.until && date > task.recurrence.until)) return false;
  switch (task.recurrence.frequency) {
    case "daily": return true;
    case "weekdays": return ![0, 6].includes(dateFromKey(date).getDay());
    case "weekly": return (dayNumber(date) - dayNumber(task.dueOn)) % 7 === 0;
    // Missing month days and February 29 in non-leap years are skipped.
    case "monthly": return date.slice(8) === task.dueOn.slice(8);
    case "yearly": return date.slice(5) === task.dueOn.slice(5);
    default: return false;
  }
}

export function expandRecurringTasks(tasks, from, to) {
  if (!isPlanningDate(from) || !isPlanningDate(to) || from > to) return [];
  const span = dayNumber(to) - dayNumber(from);
  if (span > 400) throw new RangeError("Calendar recurrence range is limited to 401 days");
  const dates = Array.from({ length: span + 1 }, (_, index) => addCalendarDays(from, index));
  return tasks.flatMap((task) => {
    if (task.archived) return [];
    if (!task.recurrence) return task.dueOn >= from && task.dueOn <= to ? [task] : [];
    const completedDates = new Set(task.recurrenceCompletedDates || []);
    return dates.filter((date) => occursOn(task, date)).map((date) => ({
      ...task, id: `${task.id}@${date}`, sourceId: task.id, occurrenceDate: date,
      // The board card represents the series; daily completion is independent.
      seriesDueOn: task.dueOn, dueOn: date, completed: completedDates.has(date),
    }));
  });
}

export function recurrenceLabel(recurrence) {
  if (!recurrence) return "";
  const label = RECURRENCE_OPTIONS.find(({ id }) => id === recurrence.frequency)?.label || "";
  return recurrence.until ? `${label}, до ${new Intl.DateTimeFormat("ru-RU").format(dateFromKey(recurrence.until))}` : label;
}
