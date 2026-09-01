import assert from "node:assert/strict";
import test from "node:test";
import { createVehicleCatalog, resolveVehicleCatalogSchema } from "./vehicle-catalog.js";

const textColumn = (table, column, schema = "public") => ({
  table_schema: schema,
  table_name: table,
  column_name: column,
  data_type: "text",
});

test("vehicle catalog discovers a denormalized make/model source", () => {
  const resolved = resolveVehicleCatalogSchema([
    textColumn("car_offers", "id"),
    textColumn("car_offers", "brand"),
    textColumn("car_offers", "model"),
    textColumn("other", "title"),
  ]);

  assert.deepEqual(resolved, {
    kind: "direct",
    schema: "public",
    table: "car_offers",
    makeColumn: "brand",
    modelColumn: "model",
    score: 275,
  });
});

test("vehicle catalog discovers normalized brands and models", () => {
  const resolved = resolveVehicleCatalogSchema([
    textColumn("brands", "name"),
    { ...textColumn("brands", "id"), data_type: "uuid" },
    textColumn("models", "model_name"),
    { ...textColumn("models", "brand_id"), data_type: "uuid" },
  ], [{
    table_schema: "public",
    table_name: "models",
    column_name: "brand_id",
    foreign_table_schema: "public",
    foreign_table_name: "brands",
    foreign_column_name: "id",
  }]);

  assert.equal(resolved.kind, "normalized");
  assert.equal(resolved.makeTable, "brands");
  assert.equal(resolved.makeColumn, "name");
  assert.equal(resolved.modelTable, "models");
  assert.equal(resolved.modelColumn, "model_name");
});

test("vehicle catalog reads distinct makes and models from the discovered source", async () => {
  const calls = [];
  const fakePool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("information_schema.columns")) {
        return { rows: [textColumn("vehicles", "make"), textColumn("vehicles", "model")] };
      }
      if (sql.includes("information_schema.table_constraints")) return { rows: [] };
      if (params.length) return { rows: [{ name: "X5" }, { name: "X3" }] };
      return { rows: [{ name: "BMW" }, { name: "Audi" }, { name: "BMW" }] };
    },
  };
  const catalog = createVehicleCatalog({ pool: fakePool });

  assert.deepEqual(await catalog.listMakes(), ["BMW", "Audi"]);
  assert.deepEqual(await catalog.listModels("BMW"), ["X5", "X3"]);
  assert.deepEqual(calls.at(-1).params, ["BMW"]);
  assert.match(calls.at(-1).sql, /lower\(.*"make".*\)=lower\(\$1\)/s);
});

test("vehicle catalog never substitutes demo data when auto is not configured", async () => {
  const catalog = createVehicleCatalog({ environment: {} });
  assert.equal(catalog.configured, false);
  await assert.rejects(catalog.listMakes(), { code: "vehicle_catalog_not_configured" });
});
