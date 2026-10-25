import test from "node:test";
import assert from "node:assert/strict";
import { calendarDeviceToken, readCalendarDeviceToken, calendarDeviceSnapshotSchema, calendarDeviceTasks } from "./calendar-device.js";
import { hashToken } from "./security.js";
const env = { USER_CREDENTIALS_SECRET: "calendar-device-test-secret-never-used-in-production" };
test("device capability binds owner, space and nonce and cannot authenticate a browser session", () => {
  const nonce = "c".repeat(64), token = calendarDeviceToken("owner", "space", nonce, env);
  assert.deepEqual(readCalendarDeviceToken(token, env), { owner: "owner", space: "space", nonce });
  const [payload, signature] = token.split(".");
  for (const changed of [{ owner: "other" }, { space: "other" }, { nonce: "d".repeat(64) }]) {
    const modified = Buffer.from(JSON.stringify({ owner: "owner", space: "space", nonce, ...changed })).toString("base64url");
    assert.equal(readCalendarDeviceToken(`${modified}.${signature}`, env), null);
  }
  for (const value of ["", "x", `${token}.extra`, "x".repeat(1501), `${payload}.!`]) assert.equal(readCalendarDeviceToken(value, env), null);
  assert.equal(readCalendarDeviceToken(token, { USER_CREDENTIALS_SECRET: "changed-device-secret-never-used-in-production" }), null);
  assert.match(hashToken(token), /^[a-f0-9]{64}$/);
  assert.throws(() => calendarDeviceToken("owner", "space", nonce, {}), cause => cause.status === 503);
});
const event = { id: "event-1", title: "Встреча", description: "Детали", start: "2026-10-25T07:17:00Z", end: "2026-10-25T08:00:00Z", allDay: false, calendar: "Работа" };
const snapshot = events => ({ deviceId: "a238b3d8-d97e-434a-a0ef-c03b290ee8ee", deviceName: "Mac", from: "2026-10-24", to: "2026-10-28", timeZone: "Europe/Moscow", events });
test("device snapshot preserves real local minutes, splits midnight and all-day spans, and never changes the source", () => {
  const input = snapshot([event, { ...event, id: "night", start: "2026-10-25T20:30:00Z", end: "2026-10-25T22:00:00Z" }, { ...event, id: "all-day", start: "2026-10-24T21:00:00Z", end: "2026-10-26T21:00:00Z", allDay: true }]);
  const original = JSON.stringify(input), tasks = calendarDeviceTasks("owner", "space", calendarDeviceSnapshotSchema.parse(input));
  assert.equal(JSON.stringify(input), original); assert.equal(tasks.length, 5);
  assert.deepEqual([tasks[0].dueOn, tasks[0].startTime, tasks[0].durationMinutes], ["2026-10-25", "10:17", 43]);
  assert.deepEqual(tasks.slice(1, 3).map(task => [task.dueOn, task.startTime, task.durationMinutes]), [["2026-10-25", "23:30", 30], ["2026-10-26", "00:00", 60]]);
  assert.deepEqual(tasks.slice(3).map(task => [task.dueOn, task.startTime, task.durationMinutes]), [["2026-10-25", "00:00", 1440], ["2026-10-26", "00:00", 1440]]);
  assert(tasks.every(task => task.id.startsWith("apple-device:") && task.id.length <= 100));
  assert.equal(tasks[0].id, calendarDeviceTasks("owner", "space", snapshot([{ ...event, title: "Новое название", start: "2026-10-25T10:17:00Z", end: "2026-10-25T11:00:00Z" }]))[0].id);
  assert.notEqual(tasks[0].id, calendarDeviceTasks("other", "space", snapshot([event]))[0].id);
  assert.notEqual(tasks[0].id, calendarDeviceTasks("owner", "other", snapshot([event]))[0].id);
});
test("snapshot validation rejects duplicates, unknown fields, invalid ranges, negative events and unknown timezones", () => {
  for (const value of [snapshot([event, event]), { ...snapshot([event]), unknown: true }, { ...snapshot([event]), to: "2028-10-28" }, { ...snapshot([event]), timeZone: "Invalid/Zone" }, snapshot([{ ...event, end: event.start }])]) assert(!calendarDeviceSnapshotSchema.safeParse(value).success);
  const single = calendarDeviceTasks("owner", "space", snapshot([{ ...event, start: "2026-10-25T20:59:00Z", end: "2026-10-25T21:00:00Z" }]));
  assert.equal(single[0].durationMinutes, 1);
});
