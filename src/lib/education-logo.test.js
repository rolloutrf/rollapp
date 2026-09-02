import test from "node:test";
import assert from "node:assert/strict";
import { logoUrlAfterResourceChange, siteLogoUrl } from "./education-logo.js";

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
