import { externalCatalogItemFromRow } from "./external-catalog.js";

// Also used by the importer so it never runs unrelated application migrations.
export const externalCatalogBrandsSchema = `
  CREATE TABLE IF NOT EXISTS external_catalog_brands (
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    label TEXT NOT NULL,
    logo_url TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    profile JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (source, external_id),
    UNIQUE (source, slug)
  );
  CREATE TABLE IF NOT EXISTS external_catalog_brand_items (
    source TEXT NOT NULL,
    brand_id TEXT NOT NULL,
    external_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    source_url TEXT NOT NULL,
    payload JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (source, brand_id, external_id),
    FOREIGN KEY (source, brand_id) REFERENCES external_catalog_brands(source, external_id),
    FOREIGN KEY (source, external_id) REFERENCES external_catalog_items(source, external_id)
  );
  CREATE INDEX IF NOT EXISTS idx_external_catalog_brand_items_page
    ON external_catalog_brand_items(source, brand_id, sort_order, external_id);
`;

function brandFromRow(row) {
  return { id: row.external_id, slug: row.slug, label: row.label, logoUrl: row.logo_url };
}

export async function getStoredCatalogBrands(query, source) {
  const result = await query(
    `SELECT * FROM external_catalog_brands WHERE source=$1 ORDER BY sort_order,slug`, [source],
  );
  return result.rows.map(brandFromRow);
}

export async function getStoredCatalogBrandPage(query, source, slug, limit, offset) {
  const result = await query(`SELECT * FROM external_catalog_brands WHERE source=$1 AND slug=$2`, [source, slug]);
  if (!result.rowCount) return null;
  const brand = brandFromRow(result.rows[0]);
  const from = `FROM external_catalog_brand_items bi
    JOIN external_catalog_brands b ON b.source=bi.source AND b.external_id=bi.brand_id AND b.synced_at=bi.synced_at
    JOIN external_catalog_items i ON i.source=bi.source AND i.external_id=bi.external_id
    WHERE bi.source=$1 AND bi.brand_id=$2 AND i.active=TRUE`;
  const [count, items] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total ${from}`, [source, brand.id]),
    query(`SELECT i.* ${from} ORDER BY bi.sort_order,bi.external_id LIMIT $3 OFFSET $4`, [source, brand.id, limit, offset]),
  ]);
  return { brand, total: count.rows[0].total, items: items.rows.map((row) => ({ ...externalCatalogItemFromRow(row), brand })) };
}
