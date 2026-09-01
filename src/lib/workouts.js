const WORKOUT_STATUS_ORDER = ["planned", "completed", "skipped"];

function statusRank(status) {
  const rank = WORKOUT_STATUS_ORDER.indexOf(status);
  return rank === -1 ? WORKOUT_STATUS_ORDER.length : rank;
}

function workoutMoment(workout) {
  return `${workout.workoutOn || ""}T${workout.startTime || "00:00"}`;
}

export function sortWorkouts(workouts) {
  return [...workouts].sort((left, right) => {
    const sortOrderDifference = (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0);
    if (sortOrderDifference) return sortOrderDifference;
    const statusDifference = statusRank(left.status) - statusRank(right.status);
    if (statusDifference) return statusDifference;
    const momentDifference = workoutMoment(left).localeCompare(workoutMoment(right));
    if (left.status === "planned") return momentDifference;
    return -momentDifference || String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
  });
}

export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateFromInput(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function workoutWeekSummary(workouts, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const weekday = start.getDay() || 7;
  start.setDate(start.getDate() - weekday + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return workouts.reduce((summary, workout) => {
    if (workout.status !== "completed") return summary;
    const date = localDateFromInput(workout.workoutOn);
    if (!date || date < start || date >= end) return summary;
    summary.completedCount += 1;
    summary.durationMinutes += Number(workout.durationMinutes) || 0;
    summary.distanceKm += Number(workout.distanceKm) || 0;
    return summary;
  }, { completedCount: 0, durationMinutes: 0, distanceKm: 0 });
}
