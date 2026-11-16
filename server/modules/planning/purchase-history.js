import { randomUUID } from "node:crypto";
import { isPlanningDate } from "../../../shared/modules/planning/planning.js";
import { openPurchaseItem, plannedPurchaseItem, purchaseProductId, purchaseTaskId } from "../../../shared/modules/planning/purchase-plan.js";
import { subscriptionItem } from "../../../shared/modules/planning/subscription-renewal.js";

const historySpace = "purchase-history";
const monthlyLimitSpace = "purchase-monthly-limits";
const historyPageSize = 20;

function legacyRecords(task) {
  const purchase = plannedPurchaseItem(task);
  if (!purchase || purchase.historyRecorded || task.id !== purchaseTaskId(purchase.id)) return [];
  const { replenishment, purchaseReview } = purchase;
  const base = {
    planId: task.id,
    wishId: purchaseProductId(purchase),
    title: purchase.title,
    currency: purchase.purchaseBudget.currency,
    recordedAt: `${task.revision}Z`,
    replenishment: Boolean(replenishment),
  };
  const records = [];
  // The old decision only identifies the purchased product while it is still
  // the latest decision. A later substitution may have changed the wish ID.
  if (replenishment?.lastDecision?.action === "bought" && isPlanningDate(replenishment.lastPurchaseOn)) {
    records.push({ ...base, id: `purchase-history:legacy:${task.id}:last`,
      purchasedOn: replenishment.lastPurchaseOn, amountMinor: replenishment.lastAmountMinor ?? null });
  }
  if (purchaseReview?.outcome === "bought") {
    records.push({ ...base, id: `purchase-history:legacy:${task.id}:closed`, purchasedOn: null, amountMinor: purchaseReview.amountMinor ?? null });
  }
  return records;
}

async function insertRecord(q, userId, { id, title, purchasedOn, recordedAt, ...details }) {
  await q(`INSERT INTO planning_tasks (id,user_id,space_id,title,due_on,status,completed,archived,created_at,related_items)
    VALUES ($1,$2,$3,$4,$5,'done',true,true,COALESCE($6::timestamptz,clock_timestamp()),$7)
    ON CONFLICT (id) DO NOTHING`,
  [id, userId, historySpace, title, purchasedOn, recordedAt ?? null, JSON.stringify([details])]);
}

export async function preserveLegacyPurchaseHistory(q, userId, task) {
  const records = legacyRecords(task);
  for (const record of records) await insertRecord(q, userId, record);
  return records.length > 0;
}

export function recordPurchase(q, userId, task, purchase, wish, { amountMinor, purchasedOn, intervalDays, suited }) {
  return insertRecord(q, userId, {
    id: `purchase-history:${randomUUID()}`,
    planId: task.id,
    wishId: wish.id,
    ...(purchase.need && { needTitle: purchase.title, suited }),
    title: wish.title,
    purchasedOn: purchasedOn ?? new Date().toISOString().slice(0, 10),
    amountMinor,
    budgetMinor: purchase.purchaseBudget.minor,
    currency: purchase.purchaseBudget.currency,
    replenishment: Boolean(purchase.replenishment || intervalDays),
  });
}

export function recordSubscriptionCharge(q, userId, task, subscription, { purchasedOn, amountMinor }) {
  return insertRecord(q, userId, {
    id: `purchase-history:${randomUUID()}`, planId: task.id, title: subscription.title,
    purchasedOn, amountMinor, budgetMinor: subscription.budgetMinor, currency: subscription.currency, purchaseType: "subscription",
  });
}

function purchasedRecord({ id, title, purchasedOn, amountMinor, currency, purchaseType, care, revision }) {
  return { id, title, purchasedOn, amountMinor: amountMinor == null ? null : Number(amountMinor), currency,
    purchaseType: purchaseType ?? null, care: care ?? null, revision: revision ?? null };
}

export async function readPurchaseForCare(q, userId, id, { preserve = false } = {}) {
  const result = await q(`SELECT id,title,to_char(due_on,'YYYY-MM-DD') AS "purchasedOn",
      related_items->0->>'amountMinor' AS "amountMinor", related_items->0->>'currency' AS currency,
      related_items->0->>'purchaseType' AS "purchaseType", related_items->0->'care' AS care,
      CASE WHEN related_items->0 ? 'care' THEN to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') END AS revision
    FROM planning_tasks WHERE user_id=$1 AND space_id=$2 AND id=$3`, [userId, historySpace, id]);
  if (result.rowCount) return purchasedRecord(result.rows[0]);
  const legacyId = /^purchase-history:legacy:(purchase-plan:.+):(last|closed)$/u.exec(id);
  if (!legacyId) return null;
  const legacy = await q(`SELECT id,related_items AS "relatedItems",
      to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') AS revision
    FROM planning_tasks WHERE user_id=$1 AND space_id='main' AND id=$2`, [userId, legacyId[1]]);
  const record = legacy.rows[0] && legacyRecords(legacy.rows[0]).find((entry) => entry.id === id);
  if (!record) return null;
  if (!preserve) return purchasedRecord(record);
  await insertRecord(q, userId, record);
  return readPurchaseForCare(q, userId, id);
}

export async function updatePurchaseCare(q, userId, purchaseId, care) {
  await q(`UPDATE planning_tasks
    SET related_items=jsonb_set(related_items,'{0,care}',$4::jsonb), updated_at=clock_timestamp()
    WHERE user_id=$1 AND space_id=$2 AND id=$3`, [userId, historySpace, purchaseId, JSON.stringify(care)]);
}

export async function readPurchaseHistory(q, userId, cursor) {
  const legacy = await q(`SELECT id, related_items AS "relatedItems",
      to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS revision
    FROM planning_tasks
    WHERE user_id=$1 AND space_id='main' AND id LIKE 'purchase-plan:%'
      AND NOT related_items @> '[{"kind":"wishlist","historyRecorded":true}]'
      AND (related_items @> '[{"kind":"wishlist","purchaseReview":{"outcome":"bought"}}]'
        OR related_items @> '[{"kind":"wishlist","replenishment":{"lastDecision":{"action":"bought"}}}]')`, [userId]);
  const { rows } = await q(`WITH purchases AS (
    SELECT id,title,due_on AS "purchasedOn",created_at AS "recordedAt", related_items->0->>'planId' AS "planId",
      related_items->0->>'wishId' AS "wishId", (related_items->0->>'amountMinor')::bigint AS "amountMinor",
      related_items->0->>'currency' AS currency, (related_items->0->>'replenishment')::boolean AS replenishment,
      related_items->0->>'needTitle' AS "needTitle", (related_items->0->>'suited')::boolean AS suited, related_items->0->>'purchaseType' AS "purchaseType"
    FROM planning_tasks WHERE user_id=$1 AND space_id=$2
    UNION
    SELECT * FROM jsonb_to_recordset($3::jsonb) AS previous(id text, title text, "purchasedOn" date, "recordedAt" timestamptz,
      "planId" text, "wishId" text, "amountMinor" bigint, currency text, replenishment boolean, "needTitle" text, suited boolean, "purchaseType" text)
    WHERE NOT EXISTS (SELECT 1 FROM planning_tasks archived WHERE archived.user_id=$1 AND archived.space_id=$2 AND archived.id=previous.id)
  ), prices AS (
    SELECT *, coalesce("purchasedOn",'0001-01-01'::date) AS sort_date,
      CASE WHEN replenishment AND lag(replenishment) OVER cycle AND "purchasedOn" IS NOT NULL AND lag("purchasedOn") OVER cycle IS NOT NULL
          AND "wishId"=lag("wishId") OVER cycle AND currency=lag(currency) OVER cycle
        THEN "amountMinor"-lag("amountMinor") OVER cycle END AS "changeMinor"
    FROM purchases
    WINDOW cycle AS (PARTITION BY "planId" ORDER BY "purchasedOn" NULLS FIRST,"recordedAt",id)
  )
  SELECT id,title,to_char("purchasedOn",'YYYY-MM-DD') AS "purchasedOn","amountMinor",currency,"changeMinor","needTitle",suited,"purchaseType"
  FROM prices
  WHERE $4::text IS NULL OR (sort_date,"recordedAt",id) < (SELECT sort_date,"recordedAt",id FROM prices WHERE id=$4)
  ORDER BY sort_date DESC,"recordedAt" DESC,id DESC LIMIT $5`,
  [userId, historySpace, JSON.stringify(legacy.rows.flatMap(legacyRecords)), cursor, historyPageSize + 1]);
  const items = rows.slice(0, historyPageSize).map(({ amountMinor, changeMinor, needTitle, suited, purchaseType, ...row }) => ({
    ...row, amountMinor: amountMinor === null ? null : Number(amountMinor), changeMinor: changeMinor === null ? null : Number(changeMinor),
    ...(needTitle && { needTitle }), ...(suited !== null && { suited }), ...(purchaseType && { purchaseType }),
  }));
  return { items, nextCursor: rows.length > historyPageSize ? items.at(-1).id : null };
}

export async function readMonthlyPurchaseSummary(q, userId, month) {
  // Read open plans and their confirmed replacements in a single snapshot.
  const { rows } = await q(`SELECT t.id, t.space_id AS "spaceId", t.related_items AS "relatedItems",
      to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS revision,
      to_char(t.due_on,'YYYY-MM-DD') AS "dueOn", t.archived, COALESCE(t.completed,t.status='done') AS completed,
      w.status AS "wishStatus"
    FROM planning_tasks t
    LEFT JOIN LATERAL (
      SELECT item FROM jsonb_array_elements(t.related_items) AS link(item)
      WHERE item->>'kind'='wishlist' AND jsonb_typeof(item->'purchaseBudget')='object'
      LIMIT 1
    ) AS purchase ON t.space_id='main'
    LEFT JOIN wishes w ON w.user_id=t.user_id AND w.id=COALESCE(purchase.item->'replenishment'->>'wishId',purchase.item->>'id')
    WHERE t.user_id=$1 AND (
      (t.space_id=$2 AND t.due_on >= $3::date AND t.due_on < $3::date + interval '1 month')
      OR (t.space_id='main' AND t.id LIKE 'purchase-plan:%' AND (
        (t.due_on >= $3::date AND t.due_on < $3::date + interval '1 month' AND NOT t.archived AND NOT COALESCE(t.completed,t.status='done'))
        OR (purchase.item->'replenishment'->'lastDecision'->>'action'='bought'
          AND purchase.item->>'historyRecorded' IS DISTINCT FROM 'true'
          AND left(purchase.item->'replenishment'->>'lastPurchaseOn',7)=$4)
      ))
      OR (t.space_id='main' AND t.id LIKE 'subscription-renewal:%' AND NOT t.archived AND NOT COALESCE(t.completed,t.status='done')
        AND left(t.related_items->0->>'chargeOn',7)=$4)
      OR (t.space_id=$5 AND t.due_on=$3::date)
    )`, [userId, historySpace, `${month}-01`, month, monthlyLimitSpace]);
  const totals = new Map();
  const purchases = new Map();
  const monthlyLimits = [];
  const openTotals = new Map();
  const totalsFor = (currency) => {
    if (!totals.has(currency)) totals.set(currency, { currency, plannedMinor: 0, spentMinor: 0, purchaseCount: 0, missingAmountCount: 0, missingBudgetCount: 0 });
    return totals.get(currency);
  };
  for (const task of rows) {
    if (task.spaceId === monthlyLimitSpace) {
      monthlyLimits.push(task.relatedItems[0]);
      continue;
    }
    if (task.spaceId === historySpace) {
      purchases.set(task.id, task.relatedItems[0]);
      continue;
    }
    const subscription = subscriptionItem(task);
    if (subscription && !subscription.stopped) {
      const { currency, budgetMinor } = subscription;
      totalsFor(currency).plannedMinor += budgetMinor;
      openTotals.set(currency, (openTotals.get(currency) || 0) + budgetMinor);
      continue;
    }
    for (const record of legacyRecords(task)) {
      if (record.purchasedOn?.startsWith(`${month}-`) && !purchases.has(record.id)) purchases.set(record.id, record);
    }
    const purchase = openPurchaseItem(task);
    if (purchase && !task.completed && !task.archived && task.dueOn?.startsWith(`${month}-`)
      && (purchase.need || (task.wishStatus && (task.wishStatus === "active" || purchase.replenishment)))) {
      const { currency, minor } = purchase.purchaseBudget;
      totalsFor(currency).plannedMinor += minor;
      openTotals.set(currency, (openTotals.get(currency) || 0) + minor);
    }
  }
  for (const { currency, budgetMinor, amountMinor } of purchases.values()) {
    const total = totalsFor(currency);
    total.purchaseCount += 1;
    if (budgetMinor == null) total.missingBudgetCount += 1;
    else total.plannedMinor += budgetMinor;
    if (amountMinor == null) total.missingAmountCount += 1;
    else total.spentMinor += amountMinor;
  }
  const limits = monthlyLimits.sort((left, right) => left.currency.localeCompare(right.currency)).map(({ currency, minor }) => ({
    currency, minor, openMinor: openTotals.get(currency) || 0, spentMinor: totals.get(currency)?.spentMinor || 0,
    missingAmountCount: totals.get(currency)?.missingAmountCount || 0,
  }));
  return { totals: [...totals.values()].sort((left, right) => left.currency.localeCompare(right.currency)), limits };
}

export async function saveMonthlyPurchaseLimit(q, userId, { month, currency, minor }) {
  const id = `purchase-limit:${userId}:${month}:${currency}`;
  if (minor === null) {
    await q("DELETE FROM planning_tasks WHERE id=$1 AND user_id=$2 AND space_id=$3", [id, userId, monthlyLimitSpace]);
    return;
  }
  await q(`INSERT INTO planning_tasks (id,user_id,space_id,title,due_on,status,completed,archived,related_items)
      VALUES ($1,$2,$3,'Лимит покупок',$4,'done',true,true,$5)
      ON CONFLICT (id) DO UPDATE SET related_items=EXCLUDED.related_items, updated_at=clock_timestamp()
      WHERE planning_tasks.user_id=EXCLUDED.user_id AND planning_tasks.space_id=EXCLUDED.space_id`,
  [id, userId, monthlyLimitSpace, `${month}-01`, JSON.stringify([{ currency, minor }])]);
}
