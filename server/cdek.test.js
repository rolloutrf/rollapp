import assert from "node:assert/strict";
import { test } from "node:test";
import { CdekError, listCdekCities, parseCdekPoints, searchCdekPoints } from "./cdek.js";

const point = '<Pvz Code="MSK1" countryCodeIso="RU" Type="PVZ" Status="ACTIVE" IsHandout="true" CityCode="44" City="Москва" Address="ул. Твёрская, 1 &amp; 2" coordX="37.6" coordY="55.7" />';
test("CDEK XML preserves strings/entities and excludes closed, foreign and non-handout offices", () => {
  const xml = `<PvzList>${point}${point.replace('Status="ACTIVE"', 'Status="CLOSED"').replace('MSK1', 'MSK2')}${point.replace('Type="PVZ"', 'Type="POSTAMAT"')}${point.replace('countryCodeIso="RU"', 'countryCodeIso="KZ"')}${point.replace('IsHandout="true"', 'IsHandout="false"')}</PvzList>`;
  const points = parseCdekPoints(xml);
  assert.equal(points.length, 1);
  assert.equal(points[0].cityCode, "44");
  assert.equal(points[0].address, "ул. Твёрская, 1 & 2");
  assert.deepEqual(points[0].coordinates, { latitude: 55.7, longitude: 37.6 });
  assert.equal(searchCdekPoints(points, "москва тверская").total, 1);
  assert.equal(searchCdekPoints(points, "msk1").total, 1);
  assert.equal(searchCdekPoints(points, "%_").total, 0);
});

test("CDEK rejects malformed, empty and entity-declaring responses", () => {
  for (const xml of ["<html>unavailable</html>", "<PvzList>", "<PvzList/>", `<!DOCTYPE x [<!ENTITY a 'bad'>]><PvzList>${point}</PvzList>`, `<PvzList>${point.replace('City="Москва"', '')}</PvzList>`]) {
    assert.throws(() => parseCdekPoints(xml), CdekError);
  }
});

test("CDEK search paginates without hiding later matches", () => {
  const points = Array.from({ length: 61 }, (_, index) => ({ ...parseCdekPoints(`<PvzList>${point}</PvzList>`)[0], code: `MSK${index}` }));
  const pages = [0, 30, 60].map((offset) => searchCdekPoints(points, "Москва", offset));
  assert.deepEqual(pages.map((page) => [page.points.length, page.nextOffset]), [[30, 30], [30, 60], [1, null]]);
  assert.equal(new Set(pages.flatMap((page) => page.points.map((item) => item.code))).size, 61);
  assert.deepEqual(searchCdekPoints(points, "Москва", 3, "", 3).points.map((item) => item.code), ["MSK3", "MSK4", "MSK5"]);
});

test("city codes isolate identical city names and address search stays in the selected city", () => {
  const base = parseCdekPoints(`<PvzList>${point}</PvzList>`)[0];
  const points = [base, { ...base, code: "MSK2" }, { ...base, cityCode: "other", region: "Другая область", code: "OTHER" }];
  const cities = listCdekCities(points);
  assert.equal(cities.length, 2);
  assert.equal(new Set(cities.map((city) => city.label)).size, 2);
  assert.equal(searchCdekPoints(points, "", 0, "44").total, 2);
  assert.equal(searchCdekPoints(points, "тверская", 0, "44").total, 2);
  assert.equal(searchCdekPoints(points, "OTHER", 0, "44").total, 0);
  assert.equal(searchCdekPoints(points, "", 0, "unknown").total, 0);
});
