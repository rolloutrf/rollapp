const MEDICATION_STATUS_ORDER = ["active", "planned", "paused", "completed"];
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function statusRank(status) {
  const rank = MEDICATION_STATUS_ORDER.indexOf(status);
  return rank === -1 ? MEDICATION_STATUS_ORDER.length : rank;
}

export function normalizeMedicationTimes(values) {
  return [...new Set((values || []).map((value) => String(value).trim()).filter((value) => TIME_PATTERN.test(value)))]
    .sort()
    .slice(0, 6);
}

export function sortMedications(medications) {
  return [...medications].sort((left, right) => {
    const statusDifference = statusRank(left.status) - statusRank(right.status);
    if (statusDifference) return statusDifference;
    if (left.status === "planned") {
      const leftStart = String(left.startOn || "9999-12-31");
      const rightStart = String(right.startOn || "9999-12-31");
      return leftStart.localeCompare(rightStart) || String(left.name || "").localeCompare(String(right.name || ""), "ru");
    }
    if (left.status === "active") {
      const leftTime = normalizeMedicationTimes(left.scheduleTimes)[0] || "99:99";
      const rightTime = normalizeMedicationTimes(right.scheduleTimes)[0] || "99:99";
      return leftTime.localeCompare(rightTime) || String(left.name || "").localeCompare(String(right.name || ""), "ru");
    }
    const leftEnd = String(left.endOn || left.updatedAt || "");
    const rightEnd = String(right.endOn || right.updatedAt || "");
    return rightEnd.localeCompare(leftEnd);
  });
}
