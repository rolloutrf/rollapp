export const MOOD_LEVELS = Object.freeze([
  { level: 1, label: "Очень плохо", color: "#d86e9c" },
  { level: 2, label: "Плохо", color: "#7799ed" },
  { level: 3, label: "Нейтрально", color: "#929cae" },
  { level: 4, label: "Хорошо", color: "#42bf9d" },
  { level: 5, label: "Отлично", color: "#f2b84e" },
].map(Object.freeze));

export const moodAt = (level) => MOOD_LEVELS.find((mood) => mood.level === level) ?? null;
