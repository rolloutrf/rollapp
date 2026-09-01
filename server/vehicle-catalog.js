import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_CACHE_MS = 5 * 60 * 1000;
const SCHEMA_CACHE_MS = 30 * 60 * 1000;
const MAX_MAKES = 500;
const MAX_MODELS = 1_000;

const MAKE_COLUMN_SCORES = new Map([
  ["brand_name", 140],
  ["make_name", 140],
  ["mark_name", 140],
  ["manufacturer_name", 135],
  ["brand", 130],
  ["make", 130],
  ["mark", 130],
  ["manufacturer", 125],
  ["марка", 130],
]);

const MODEL_COLUMN_SCORES = new Map([
  ["model_name", 140],
  ["car_model", 135],
  ["vehicle_model", 135],
  ["model", 130],
  ["модель", 130],
]);

const normalizeIdentifier = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-zа-я0-9]+/gi, "_")
  .replace(/^_+|_+$/g, "");

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
const qualifiedTable = (schema, table) => `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
const textValue = (alias, column) => `btrim(CAST(${alias}.${quoteIdentifier(column)} AS text))`;

function scoreColumn(columnName, scores) {
  const normalized = normalizeIdentifier(columnName);
  if (normalized === "id" || normalized.endsWith("_id")) return 0;
  if (scores.has(normalized)) return scores.get(normalized);
  for (const [candidate, score] of scores) {
    if (normalized.endsWith(`_${candidate}`) || normalized.startsWith(`${candidate}_`)) return score - 25;
  }
  return 0;
}

function scoreTable(tableName) {
  const normalized = normalizeIdentifier(tableName);
  let score = 0;
  if (/^(cars?|vehicles?|autos?)$/.test(normalized)) score += 30;
  if (/(car|vehicle|auto|offer|listing|catalog)/.test(normalized)) score += 15;
  if (/models?/.test(normalized)) score += 8;
  return score;
}

function bestColumn(columns, scores) {
  return columns
    .map((column) => ({ column, score: scoreColumn(column.column_name, scores) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.column.column_name.localeCompare(b.column.column_name))[0] || null;
}

function tableKey(schema, table) {
  return `${schema}\u0000${table}`;
}

export function resolveVehicleCatalogSchema(columns, foreignKeys = []) {
  const tables = new Map();
  for (const column of columns) {
    const key = tableKey(column.table_schema, column.table_name);
    if (!tables.has(key)) {
      tables.set(key, {
        schema: column.table_schema,
        table: column.table_name,
        columns: [],
      });
    }
    tables.get(key).columns.push(column);
  }

  const direct = [...tables.values()]
    .map((table) => {
      const make = bestColumn(table.columns, MAKE_COLUMN_SCORES);
      const model = bestColumn(table.columns, MODEL_COLUMN_SCORES);
      if (!make || !model || make.column.column_name === model.column.column_name) return null;
      return {
        kind: "direct",
        schema: table.schema,
        table: table.table,
        makeColumn: make.column.column_name,
        modelColumn: model.column.column_name,
        score: make.score + model.score + scoreTable(table.table),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.table.localeCompare(b.table))[0];

  if (direct) return direct;

  const normalized = [];
  for (const foreignKey of foreignKeys) {
    const modelTable = tables.get(tableKey(foreignKey.table_schema, foreignKey.table_name));
    const makeTable = tables.get(tableKey(foreignKey.foreign_table_schema, foreignKey.foreign_table_name));
    if (!modelTable || !makeTable) continue;
    const model = bestColumn(modelTable.columns, MODEL_COLUMN_SCORES);
    const make = bestColumn(makeTable.columns, MAKE_COLUMN_SCORES)
      || bestColumn(makeTable.columns, new Map([["name", 90], ["title", 70]]));
    if (!model || !make) continue;
    normalized.push({
      kind: "normalized",
      modelSchema: modelTable.schema,
      modelTable: modelTable.table,
      modelColumn: model.column.column_name,
      modelMakeColumn: foreignKey.column_name,
      makeSchema: makeTable.schema,
      makeTable: makeTable.table,
      makeColumn: make.column.column_name,
      makeIdColumn: foreignKey.foreign_column_name,
      score: model.score + make.score + scoreTable(modelTable.table) + scoreTable(makeTable.table),
    });
  }

  return normalized.sort((a, b) => b.score - a.score || a.modelTable.localeCompare(b.modelTable))[0] || null;
}

function connectionConfig(environment = process.env) {
  const connectionString = String(environment.AUTO_DATABASE_URL || "").trim();
  if (connectionString) {
    return {
      pool: { connectionString },
      tlsServername: String(environment.AUTO_PGSSL_SERVERNAME || environment.PGSSL_SERVERNAME || "").trim(),
    };
  }

  const user = String(environment.AUTO_PGUSER || "").trim();
  const password = String(environment.AUTO_PGPASSWORD || "").trim();
  if (!user || !password) return null;
  const host = String(environment.AUTO_PGHOST || environment.PGHOST || "").trim();
  if (!host) return null;
  return {
    pool: {
      host,
      port: Number(environment.AUTO_PGPORT || environment.PGPORT || 5432),
      database: String(environment.AUTO_PGDATABASE || "auto").trim(),
      user,
      password,
    },
    tlsServername: String(environment.AUTO_PGSSL_SERVERNAME || environment.PGSSL_SERVERNAME || host).trim(),
  };
}

export class VehicleCatalogUnavailableError extends Error {
  constructor(message, code = "vehicle_catalog_unavailable", cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "VehicleCatalogUnavailableError";
    this.code = code;
  }
}

export function createVehicleCatalog({ environment = process.env, pool: providedPool = null } = {}) {
  const configuredConnection = connectionConfig(environment);
  let catalogPool = providedPool;
  let schemaCache = null;
  let makesCache = null;
  const modelsCache = new Map();

  const configured = Boolean(providedPool || configuredConnection);

  function getPool() {
    if (!configured) {
      throw new VehicleCatalogUnavailableError(
        "Справочник автомобилей не подключён",
        "vehicle_catalog_not_configured",
      );
    }
    if (catalogPool) return catalogPool;
    const caPath = path.resolve(__dirname, "../certs/yandex-cloud-ca.pem");
    const ssl = {
      rejectUnauthorized: true,
      ...(fs.existsSync(caPath) ? { ca: fs.readFileSync(caPath, "utf8") } : {}),
      ...(configuredConnection.tlsServername ? { servername: configuredConnection.tlsServername } : {}),
    };
    catalogPool = new pg.Pool({
      ...configuredConnection.pool,
      ssl,
      max: Number(environment.AUTO_PG_POOL_SIZE || 2),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 7_000,
      statement_timeout: 10_000,
      application_name: "rollapp-vehicle-catalog",
    });
    catalogPool.on("error", () => {
      console.error("[vehicle-catalog] Idle PostgreSQL client disconnected; the pool will reconnect when needed.");
    });
    return catalogPool;
  }

  async function discoverSchema() {
    if (schemaCache?.expiresAt > Date.now()) return schemaCache.value;
    const pool = getPool();
    const [columnsResult, foreignKeysResult] = await Promise.all([
      pool.query(
        `SELECT table_schema,table_name,column_name,data_type
         FROM information_schema.columns
         WHERE table_schema NOT IN ('pg_catalog','information_schema')
         ORDER BY table_schema,table_name,ordinal_position`,
      ),
      pool.query(
        `SELECT tc.table_schema,tc.table_name,kcu.column_name,
                ccu.table_schema AS foreign_table_schema,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
         WHERE tc.constraint_type='FOREIGN KEY'
         ORDER BY tc.table_schema,tc.table_name,kcu.ordinal_position`,
      ),
    ]);
    const resolved = resolveVehicleCatalogSchema(columnsResult.rows, foreignKeysResult.rows);
    if (!resolved) {
      throw new VehicleCatalogUnavailableError(
        "В базе auto не найден справочник марок и моделей",
        "vehicle_catalog_schema_not_found",
      );
    }
    schemaCache = { value: resolved, expiresAt: Date.now() + SCHEMA_CACHE_MS };
    return resolved;
  }

  async function run(operation) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof VehicleCatalogUnavailableError) throw error;
      throw new VehicleCatalogUnavailableError("Справочник автомобилей временно недоступен", "vehicle_catalog_unavailable", error);
    }
  }

  async function listMakes() {
    if (makesCache?.expiresAt > Date.now()) return makesCache.value;
    return run(async () => {
      const schema = await discoverSchema();
      const pool = getPool();
      let sql;
      if (schema.kind === "direct") {
        const make = textValue("source", schema.makeColumn);
        sql = `SELECT DISTINCT ${make} AS name
               FROM ${qualifiedTable(schema.schema, schema.table)} source
               WHERE ${make}<>''
               ORDER BY name
               LIMIT ${MAX_MAKES}`;
      } else {
        const make = textValue("makes", schema.makeColumn);
        sql = `SELECT DISTINCT ${make} AS name
               FROM ${qualifiedTable(schema.makeSchema, schema.makeTable)} makes
               WHERE ${make}<>''
               ORDER BY name
               LIMIT ${MAX_MAKES}`;
      }
      const result = await pool.query(sql);
      const values = [...new Set(result.rows.map((row) => String(row.name || "").trim()).filter(Boolean))];
      makesCache = { value: values, expiresAt: Date.now() + CATALOG_CACHE_MS };
      return values;
    });
  }

  async function listModels(makeName) {
    const make = String(makeName || "").trim();
    if (!make) return [];
    const cacheKey = make.toLocaleLowerCase("ru");
    const cached = modelsCache.get(cacheKey);
    if (cached?.expiresAt > Date.now()) return cached.value;
    return run(async () => {
      const schema = await discoverSchema();
      const pool = getPool();
      let sql;
      if (schema.kind === "direct") {
        const makeValue = textValue("source", schema.makeColumn);
        const modelValue = textValue("source", schema.modelColumn);
        sql = `SELECT DISTINCT ${modelValue} AS name
               FROM ${qualifiedTable(schema.schema, schema.table)} source
               WHERE lower(${makeValue})=lower($1) AND ${modelValue}<>''
               ORDER BY name
               LIMIT ${MAX_MODELS}`;
      } else {
        const makeValue = textValue("makes", schema.makeColumn);
        const modelValue = textValue("models", schema.modelColumn);
        sql = `SELECT DISTINCT ${modelValue} AS name
               FROM ${qualifiedTable(schema.modelSchema, schema.modelTable)} models
               JOIN ${qualifiedTable(schema.makeSchema, schema.makeTable)} makes
                 ON models.${quoteIdentifier(schema.modelMakeColumn)}=makes.${quoteIdentifier(schema.makeIdColumn)}
               WHERE lower(${makeValue})=lower($1) AND ${modelValue}<>''
               ORDER BY name
               LIMIT ${MAX_MODELS}`;
      }
      const result = await pool.query(sql, [make]);
      const values = [...new Set(result.rows.map((row) => String(row.name || "").trim()).filter(Boolean))];
      modelsCache.set(cacheKey, { value: values, expiresAt: Date.now() + CATALOG_CACHE_MS });
      return values;
    });
  }

  async function close() {
    if (catalogPool && catalogPool !== providedPool) await catalogPool.end();
  }

  return { configured, listMakes, listModels, close };
}

export const vehicleCatalog = createVehicleCatalog();
