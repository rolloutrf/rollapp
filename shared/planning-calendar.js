import { localDateKey } from "./planning.js";

export const CALENDAR_VIEWS = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "year", label: "Год" },
  { id: "list", label: "Список" },
];
export const dateFromKey = (key) => new Date(`${key}T12:00:00`);
export function addCalendarDays(key, amount) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}
export function calendarWeek(key) {
  const date = dateFromKey(key);
  const monday = addCalendarDays(key, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(monday, index));
}
export function shiftCalendarDate(key, view, amount) {
  if (view === "day") return addCalendarDays(key, amount);
  if (view === "week") return addCalendarDays(key, amount * 7);
  const date = dateFromKey(key);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + amount * (view === "year" ? 12 : 1));
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return localDateKey(date);
}
export function timeMinutes(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || "")) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
export function minutesTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function scheduleError({ dueOn, startTime, durationMinutes = 60 }) {
  if (!startTime) return "";
  if (!dueOn) return "Укажите дату для задачи со временем";
  const start = timeMinutes(startTime);
  if (start === null) return "Укажите корректное время";
  if (start + durationMinutes > 1440) return "Задача должна заканчиваться в пределах выбранного дня";
  return "";
}
export function taskTimeLabel(task) {
  const start = timeMinutes(task.startTime);
  return start === null ? "Весь день" : `${task.startTime}–${minutesTime(start + (task.durationMinutes || 60))}`;
}
export function sortCalendarTasks(tasks) {
  return [...tasks].sort((a, b) => (a.dueOn || "9999").localeCompare(b.dueOn || "9999")
    || (timeMinutes(a.startTime) ?? -1) - (timeMinutes(b.startTime) ?? -1)
    || a.title.localeCompare(b.title, "ru"));
}

// Partition overlapping appointments into lanes, with a shared width per overlap group.
export function layoutCalendarEvents(tasks) {
  const sorted = tasks.filter((task) => timeMinutes(task.startTime) !== null)
    .map((task) => ({ task, start: timeMinutes(task.startTime), end: timeMinutes(task.startTime) + Math.max(30, task.durationMinutes || 60) }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.task.id.localeCompare(b.task.id));
  const result = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const ends = [];
    for (const item of group) {
      let lane = ends.findIndex((end) => end <= item.start);
      if (lane === -1) lane = ends.length;
      ends[lane] = item.end;
      item.lane = lane;
    }
    result.push(...group.map((item) => ({ ...item, lanes: ends.length })));
    group = [];
  };
  for (const item of sorted) {
    if (item.start >= groupEnd && group.length) flush();
    if (!group.length) groupEnd = item.end;
    group.push(item); groupEnd = Math.max(groupEnd, item.end);
  }
  flush();
  return result;
}

// Snap gestures to a quarter-hour without allowing an event to cross midnight.
export function calendarRange(first, last) {
  const start = Math.max(0, Math.min(1425, Math.floor(Math.min(first, last) / 15) * 15));
  const end = Math.min(1440, Math.max(start + 15, Math.ceil(Math.max(first, last) / 15) * 15));
  return { startTime: minutesTime(start), durationMinutes: end - start };
}
export function calendarMove(task, dueOn, minute) {
  if (minute === null) return { dueOn, startTime: "" };
  const durationMinutes = task.durationMinutes || 60;
  const start = Math.max(0, Math.min(1440 - durationMinutes, Math.round(minute / 15) * 15));
  return { dueOn, startTime: minutesTime(start), durationMinutes };
}
export function calendarResize(task, minute) {
  const start = timeMinutes(task.startTime);
  return { durationMinutes: Math.max(15, Math.min(1440 - start, Math.round(minute / 15) * 15 - start)) };
}
