import { z } from "zod";

export const SLEEP_QUALITY = { 1: "Очень плохо", 2: "Плохо", 3: "Нормально", 4: "Хорошо", 5: "Отлично" };
export const MEAL_TYPES = { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", snack: "Перекус" };
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const notes = z.string().trim().max(4000).default("");
const optionalNumber = z.preprocess(value => value === "" || value == null ? null : typeof value === "string" && value.trim() ? Number(value) : value, z.number().finite().min(0).max(20000).nullable());

export function sleepMinutes(bedtime, wakeTime) {
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return (minutes(wakeTime) - minutes(bedtime) + 1440) % 1440;
}
export function durationLabel(minutes) {
  return `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ""}`;
}
export const trackerSchemas = {
  sleep: z.object({ date: z.string().date(), bedtime: time, wakeTime: time, quality: z.preprocess(value => typeof value === "string" && value.trim() ? Number(value) : value, z.number().int().min(1).max(5)), notes }).strict()
    .refine(value => sleepMinutes(value.bedtime, value.wakeTime) > 0, { message: "Время засыпания и пробуждения должно отличаться", path: ["wakeTime"] }),
  nutrition: z.object({ completed: z.boolean().default(true), date: z.string().date(), time: time, mealType: z.enum(Object.keys(MEAL_TYPES)), title: z.string().trim().min(1).max(200), calories: optionalNumber, protein: optionalNumber, fat: optionalNumber, carbs: optionalNumber, notes }).strict(),
};
export function nutritionTotals(entries) {
  return Object.fromEntries(["calories", "protein", "fat", "carbs"].map(key => [key, entries.some(entry => entry[key] != null) ? Math.round(entries.reduce((sum, entry) => sum + (entry[key] ?? 0), 0) * 10) / 10 : null]));
}

// Today's unsaved tile is presentation only. Historic records always come from PostgreSQL.
export function sleepHistoryDays(entries, today) {
  const grouped = new Map([[today, []]]);
  for (const entry of entries) {
    if (!grouped.has(entry.date)) grouped.set(entry.date, []);
    grouped.get(entry.date).push(entry);
  }
  return [today, ...[...grouped.keys()].filter(date => date !== today).sort().reverse()]
    .map(date => ({ date, entries: grouped.get(date).sort((a, b) => a.wakeTime.localeCompare(b.wakeTime)) }));
}
