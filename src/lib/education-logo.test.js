import test from "node:test";
import assert from "node:assert/strict";
import {
  automaticCourseLogoUrl, courseLogoUrls, courseProviderLogoKey, logoUrlAfterResourceChange,
  resolvedCourseLogoUrl, siteLogoUrl,
} from "./education-logo.js";

test("builds a stable automatic logo URL from the resource origin", () => {
  assert.equal(
    siteLogoUrl("https://conf.example.com/program/2026?ref=rollapp"),
    "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fconf.example.com&sz=128",
  );
  assert.equal(siteLogoUrl("not a URL"), "");
  assert.equal(siteLogoUrl("ftp://example.com/file"), "");
});

test("updates an empty or previously automatic logo when the resource changes", () => {
  const firstResourceUrl = "https://first.example/schedule";
  const secondResourceUrl = "https://second.example/register";

  assert.equal(
    logoUrlAfterResourceChange({
      currentLogoUrl: "",
      previousResourceUrl: "",
      resourceUrl: firstResourceUrl,
    }),
    siteLogoUrl(firstResourceUrl),
  );
  assert.equal(
    logoUrlAfterResourceChange({
      currentLogoUrl: siteLogoUrl(firstResourceUrl),
      previousResourceUrl: firstResourceUrl,
      resourceUrl: secondResourceUrl,
    }),
    siteLogoUrl(secondResourceUrl),
  );
});

test("keeps a manually uploaded logo when the resource changes", () => {
  assert.equal(
    logoUrlAfterResourceChange({
      currentLogoUrl: "/api/media/66c57d9a-8292-48de-ac53-e2b4fb391ba6",
      previousResourceUrl: "https://first.example",
      resourceUrl: "https://second.example",
    }),
    "/api/media/66c57d9a-8292-48de-ac53-e2b4fb391ba6",
  );
});

test("recognizes allow-listed course providers from their official URL, provider, or title", () => {
  assert.equal(
    courseProviderLogoKey({ url: "https://learn.productstar.ru/course", provider: "GoPractice" }),
    "productstar",
  );
  assert.equal(courseProviderLogoKey({ provider: "GoPractice" }), "gopractice");
  assert.equal(courseProviderLogoKey({ provider: "Go Practice" }), "gopractice");
  assert.equal(courseProviderLogoKey({ title: "Go Practive — продуктовый курс" }), "gopractice");
  assert.equal(courseProviderLogoKey({ title: "Курс от Product-Star" }), "productstar");
  assert.equal(courseProviderLogoKey({ provider: "Неизвестная школа" }), "");
});

test("builds parsed course logo URLs and safe fallbacks", () => {
  assert.equal(
    automaticCourseLogoUrl({ title: "Go Practice" }),
    "/api/education/provider-logos/gopractice",
  );
  assert.equal(
    automaticCourseLogoUrl({ url: "https://productstar.ru/courses/manager" }),
    "/api/education/course-logo?url=https%3A%2F%2Fproductstar.ru%2Fcourses%2Fmanager",
  );
  assert.equal(
    automaticCourseLogoUrl({ url: "https://academy.gopractice.io/program" }),
    "/api/education/course-logo?url=https%3A%2F%2Facademy.gopractice.io%2Fprogram",
  );
  assert.equal(
    automaticCourseLogoUrl({ url: "https://private-academy.example/course" }),
    "/api/education/course-logo?url=https%3A%2F%2Fprivate-academy.example%2Fcourse",
  );
  assert.equal(courseProviderLogoKey({ url: "https://evilproductstar.ru/course" }), "");
  assert.equal(courseProviderLogoKey({ url: "https://productstar.ru.attacker.example/course" }), "");
  assert.equal(automaticCourseLogoUrl({ provider: "academy.example.com" }), "");
});

test("orders a saved logo, parsed page logo, provider logo, and favicon fallbacks", () => {
  assert.deepEqual(
    courseLogoUrls({
      logoUrl: "/api/media/66c57d9a-8292-48de-ac53-e2b4fb391ba6",
      title: "Product Star",
      url: "https://productstar.ru/course#program",
    }),
    [
      "/api/media/66c57d9a-8292-48de-ac53-e2b4fb391ba6",
      "/api/education/course-logo?url=https%3A%2F%2Fproductstar.ru%2Fcourse",
      "/api/education/provider-logos/productstar",
      "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fproductstar.ru&sz=128",
    ],
  );
  assert.deepEqual(
    courseLogoUrls({ title: "Go Practive" }),
    [
      "/api/education/provider-logos/gopractice",
      "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fgopractice.ru&sz=128",
    ],
  );
});

test("keeps a saved logo ahead of an automatically recognized provider", () => {
  assert.equal(
    resolvedCourseLogoUrl({
      logoUrl: "/api/media/66c57d9a-8292-48de-ac53-e2b4fb391ba6",
      title: "Product Star",
    }),
    "/api/media/66c57d9a-8292-48de-ac53-e2b4fb391ba6",
  );
  assert.equal(
    resolvedCourseLogoUrl({ title: "Product Star" }),
    "/api/education/provider-logos/productstar",
  );
});
