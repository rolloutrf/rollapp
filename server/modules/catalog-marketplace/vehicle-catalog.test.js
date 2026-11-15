import assert from "node:assert/strict";
import test from "node:test";
import {
  createVehicleCatalog,
  findVehicleMake,
  findVehicleModel,
  resolveVehicleCatalogSchema,
} from "./vehicle-catalog.js";

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

test("vehicle catalog discovers the production Auto.ru JSONB snapshot", () => {
  const resolved = resolveVehicleCatalogSchema([
    textColumn("snapshot_rows", "run_id", "auto_catalog"),
    textColumn("snapshot_rows", "dataset", "auto_catalog"),
    textColumn("snapshot_rows", "row_key", "auto_catalog"),
    { ...textColumn("snapshot_rows", "data", "auto_catalog"), data_type: "jsonb" },
  ]);

  assert.deepEqual(resolved, {
    kind: "jsonb_snapshot",
    schema: "auto_catalog",
    table: "snapshot_rows",
    datasetColumn: "dataset",
    dataColumn: "data",
    datasetValue: "cars_for_sale",
    makeJsonKey: "make_name",
    modelJsonKey: "model_name",
    score: 100,
  });
});

test("vehicle catalog reads makes and models from the production Auto.ru JSONB snapshot", async () => {
  const calls = [];
  const fakePool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("information_schema.columns")) {
        return {
          rows: [
            textColumn("snapshot_rows", "dataset", "auto_catalog"),
            { ...textColumn("snapshot_rows", "data", "auto_catalog"), data_type: "jsonb" },
          ],
        };
      }
      if (sql.includes("information_schema.table_constraints")) return { rows: [] };
      if (params.length === 2) return { rows: [{ name: "X3" }, { name: "X5" }] };
      return { rows: [{ name: "Audi" }, { name: "BMW" }] };
    },
  };
  const catalog = createVehicleCatalog({ pool: fakePool });

  assert.deepEqual(await catalog.listMakes(), ["Audi", "BMW"]);
  assert.deepEqual(await catalog.listModels("BMW"), ["X3", "X5"]);
  assert.deepEqual(calls.at(-1).params, ["BMW", "cars_for_sale"]);
  assert.match(calls.at(-1).sql, /->>'model_name'/);
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

test("vehicle catalog reuses the production database role for the auto database", () => {
  const catalog = createVehicleCatalog({
    environment: {
      PGHOST: "cluster.example.net",
      PGUSER: "rollapp_app",
      PGPASSWORD: "secret",
      PGSSL_SERVERNAME: "cluster.example.net",
      AUTO_PGDATABASE: "auto",
    },
  });
  assert.equal(catalog.configured, true);
});

test("vehicle catalog reuses credentials from DATABASE_URL for the auto database", () => {
  const catalog = createVehicleCatalog({
    environment: {
      DATABASE_URL: "postgresql://rollapp_app:secret%25value@cluster.example.net:6432/rollapp",
      AUTO_PGDATABASE: "auto",
    },
  });
  assert.equal(catalog.configured, true);
});

test("vehicle catalog matches the longest make and model in listing text", () => {
  const text = "Mercedes-Benz GLE Coupe 2024, один владелец";
  const make = findVehicleMake(text, ["Mercedes", "Mercedes-Benz", "BMW"]);
  const model = findVehicleModel(text, make, ["GLE", "GLE Coupe", "GL"]);
  assert.equal(make, "Mercedes-Benz");
  assert.equal(model, "GLE Coupe");
});

test("single-character vehicle models only match together with their make", () => {
  assert.equal(findVehicleModel("Mazda 3 2021 года", "Mazda", ["3"]), "3");
  assert.equal(findVehicleModel("Автомобиль 2023 года", "Mazda", ["3"]), "");
});

test("vehicle catalog resolves a listing through the production-backed catalogue API", async () => {
  const fakePool = {
    async query(sql, params = []) {
      if (sql.includes("information_schema.columns")) {
        return { rows: [textColumn("vehicles", "make"), textColumn("vehicles", "model")] };
      }
      if (sql.includes("information_schema.table_constraints")) return { rows: [] };
      if (params.length) return { rows: [{ name: "X3" }, { name: "X5" }] };
      return { rows: [{ name: "Audi" }, { name: "BMW" }] };
    },
  };
  const catalog = createVehicleCatalog({ pool: fakePool });
  assert.deepEqual(await catalog.matchListing({
    title: "BMW X5 xDrive40i, 2022",
    description: "Автомобиль в наличии",
  }), { make: "BMW", model: "X5" });
  assert.deepEqual(await catalog.matchListing({
    url: "https://auto.ru/cars/used/sale/bmw/x5/1123456789-example/",
  }), { make: "BMW", model: "X5" });
});
