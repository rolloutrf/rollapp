import { reorderCards, savedOrder } from "./card-order.js";

const STATUS_ORDER = ["in_progress", "planned", "completed"];

function courseSortValue(course) {
  const index = STATUS_ORDER.indexOf(course.status);
  return index === -1 ? STATUS_ORDER.length : index;
}

export function sortCourses(courses) {
  return [...courses].sort((left, right) => (
    savedOrder(left) - savedOrder(right)
    || courseSortValue(left) - courseSortValue(right)
    || String(right.completedOn || right.startedOn || "").localeCompare(String(left.completedOn || left.startedOn || ""))
    || String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
  ));
}

export function reorderCourses(courses, courseId, targetIndex) {
  return reorderCards(courses, courseId, targetIndex);
}
