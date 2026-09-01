import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMedicationTimes, sortMedications } from "./medications.js";

test("medication times are validated, de-duplicated and sorted", () => {
  assert.deepEqual(normalizeMedicationTimes(["20:00", "08:30", "20:00", "25:00", "", " 12:15 "]), [
    "08:30",
    "12:15",
    "20:00",
  ]);
});

test("medications sort current courses before planned and archived courses", () => {
  const medications = [
    { id: "completed", name: "Завершён", status: "completed", endOn: "2026-08-20" },
    { id: "planned-late", name: "Позже", status: "planned", startOn: "2026-09-10" },
    { id: "active-late", name: "Вечером", status: "active", scheduleTimes: ["20:00"] },
    { id: "paused", name: "Пауза", status: "paused", endOn: "2026-08-28" },
    { id: "active-early", name: "Утром", status: "active", scheduleTimes: ["08:00"] },
    { id: "planned-early", name: "Скоро", status: "planned", startOn: "2026-09-01" },
  ];

  assert.deepEqual(sortMedications(medications).map(({ id }) => id), [
    "active-early",
    "active-late",
    "planned-early",
    "planned-late",
    "paused",
    "completed",
  ]);
});
