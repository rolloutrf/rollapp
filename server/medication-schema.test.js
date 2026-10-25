import test from "node:test";
import assert from "node:assert/strict";
import { medicationSchema } from "./medication-schema.js";
const planned = { name: "Селен", medicationForm: "capsule", status: "planned", dosage: "", frequency: "custom", scheduleTimes: [], purpose: "", prescriber: "", instructions: "", startOn: "", endOn: "", notes: "" };
test("a purchased planned medication needs no invented time or course, active custom schedules still need a time", () => {
  assert(medicationSchema.safeParse(planned).success);
  assert(!medicationSchema.safeParse({ ...planned, status: "active" }).success);
  assert(medicationSchema.safeParse({ ...planned, status: "active", scheduleTimes: ["09:30"] }).success);
});
test("medication photos accept web URLs and canonical uploads, reject executable/ambiguous URLs, and preserve omitted legacy values", () => {
  assert.equal(medicationSchema.parse(planned).imageUrl, undefined);
  for (const imageUrl of ["", "https://ipsumvitamin.ru/photo.png", "http://example.com/a.jpg", "/api/media/11111111-1111-4111-8111-111111111111"]) assert(medicationSchema.safeParse({ ...planned, imageUrl }).success, imageUrl);
  for (const imageUrl of ["javascript:alert(1)", "data:image/png;base64,a", "//example.com/photo.png", "/arbitrary/private", "https://", "file:///tmp/a", "x".repeat(2001)]) assert(!medicationSchema.safeParse({ ...planned, imageUrl }).success, imageUrl);
});
