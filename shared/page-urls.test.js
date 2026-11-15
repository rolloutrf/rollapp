import assert from "node:assert/strict";
import test from "node:test";
import { internalPageSearch, internalPageUrl, localizedPageUrl } from "./page-urls.js";

test("browser routes localize Rollapp vocabulary while preserving usernames, IDs and anchor positions", () => {
  for (const [source, display] of [
    ["/app/spheres/health?tab=sleep&date=2026-11-15#section", "/приложение/сферы/здоровье?раздел=сон&дата=2026-11-15#section"],
    ["/app/spheres/career/business/store?tab=contacts&owner=Smith", "/приложение/сферы/карьера/бизнес/магазин?раздел=контакты&владелец=Smith"],
    ["/app/planning?tab=calendar&view=week&space=list-a", "/приложение/планирование?раздел=календарь&вид=неделя&список=list-a"],
    ["/app/friends/followers", "/приложение/друзья/подписчики"],
    ["/wishes/products", "/wishes/товары"],
    ["/health/calendar/book?slot=a%2Fb&zone=Europe%2FMoscow", "/health/календарь/запись?время=a%2Fb&часовой-пояс=Europe%2FMoscow"],
    ["/values/wishes/health", "/values/желания/health"],
    ["/s/health/wishes/a%2Fb", "/поделиться/health/желания/a%2Fb"],
    ["/app/wishes/catalog/item/external%3Aohmywishes%3A123", "/приложение/желания/каталог/позиция/external%3Aohmywishes%3A123"],
    ["/register#invite=Ab-C_1", "/регистрация#приглашение=Ab-C_1"],
    ["/reset-password#token=aBc123", "/новый-пароль#ключ=aBc123"],
  ]) {
    const localized = localizedPageUrl(source);
    assert.equal(decodeURI(localized), display);
    assert.equal(localizedPageUrl(localized), localized);
    assert.equal(internalPageUrl(localized), source);
  }
});

test("legacy and canonical URLs round-trip nested return paths and raw opaque input", () => {
  const next = "/app/spheres/identity?tab=four-questions&owner=user#section";
  const source = `/login?next=${encodeURIComponent(next)}&add_account=1&x=one+two&x=%2b`;
  const localized = new URL(localizedPageUrl(source), "https://rollapp.example");
  assert.equal(decodeURI(localized.pathname), "/вход");
  assert.equal(localized.searchParams.get("далее"), localizedPageUrl(next));
  assert.equal(internalPageUrl(localized.pathname + localized.search), source);
  assert.equal(internalPageSearch("?владелец=Smith&форма=task-123"), "?owner=Smith&formScreen=task-123");
  assert.equal(internalPageUrl("/приложение/spheres/здоровье?tab=сон"), "/app/spheres/health?tab=sleep");
});

test("API and unrelated URLs retain their spelling", () => {
  for (const path of ["/api/wishes/catalog?tab=sleep", "/assets/wishes/mock-id", "//example.org/app/wishes",
    "https://example.org/app/wishes", "/user/unrecognized", "/friend"]) {
    assert.equal(localizedPageUrl(path), path);
    assert.equal(internalPageUrl(path), path);
  }
});
