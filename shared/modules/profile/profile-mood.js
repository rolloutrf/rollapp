export const NEUTRAL_MOOD_LEVEL = 3;

export const MOOD_LEVELS = Object.freeze([
  { level: 1, label: "Очень плохо", color: "#d86e9c" },
  { level: 2, label: "Плохо", color: "#7799ed" },
  { level: NEUTRAL_MOOD_LEVEL, label: "Нейтрально", color: "#929cae" },
  { level: 4, label: "Хорошо", color: "#42bf9d" },
  { level: 5, label: "Отлично", color: "#f2b84e" },
].map(Object.freeze));

export const moodAt = (level) => MOOD_LEVELS.find((mood) => mood.level === level) ?? null;
export const highlightedMood = (level) => level === NEUTRAL_MOOD_LEVEL ? null : moodAt(level);
