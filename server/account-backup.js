import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

const owned = "t.user_id=$1";
const ownedList = "EXISTS (SELECT 1 FROM wishlists l WHERE l.id=t.wishlist_id AND l.user_id=$1)";
const ownedWish = "EXISTS (SELECT 1 FROM wishes w WHERE w.id=t.wish_id AND w.user_id=$1)";
const strip = (...columns) => `to_jsonb(t) - ARRAY[${columns.map((column) => `'${column}'`).join(",")}]`;
const pick = (...columns) => `jsonb_build_object(${columns.map((column) => `'${column}', t.${column}`).join(",")})`;
const bytes = (column, ...columns) => `${pick(...columns)} || jsonb_build_object('${column}_base64', encode(t.${column}, 'base64'))`;
const conversationParticipant = "(c.user_a=$1 OR c.user_b=$1)";
const needOfferParticipant = `(t.business_id=$1 OR EXISTS (SELECT 1 FROM reward_needs n WHERE n.id=t.need_id AND n.user_id=$1))`;

// A reviewed inventory: never infer ownership from table names or automatically
// follow references into another account. Credentials and operational caches
// are intentionally absent. Each relationship checks its owning endpoint(s).
const sources = [
  ["users", "t.id=$1", pick("id", "email", "username", "name", "account_type", "business_category", "seller_space",
    "bio", "birthday", "avatar_url", "wishlist_links", "member_number", "created_at")],
  ...[
    "profile_username_aliases", "wishes", "wish_book_notes", "catalog_item_likes",
    "education_lists", "education_courses", "education_course_groups", "education_item_groups",
    "education_conferences", "education_coaching_sessions", "health_workouts",
    "health_medication_groups", "health_medications", "lab_report_deletions",
    "contact_overrides", "contact_favorites", "career_content", "identity_content",
    "identity_generated_reports", "planning_tasks", "planning_spaces", "planning_boards",
    "reservations", "roll_wallets", "roll_wish_rewards", "planning_notes", "planning_note_layouts",
    "health_lab_content", "health_tracker_entries", "reward_need_entries", "messenger_reads",
    "place_waitlist",
  ].map((table) => [table, owned]),
  ["wishlists", owned, pick("id", "user_id", "title", "description", "privacy", "occasion_date", "color", "created_at", "space")],
  ["wish_participants", `(${owned} OR ${ownedWish})`, pick("wish_id", "user_id", "created_at")],
  ["account_invites", "t.created_by=$1", pick("id", "recipient_email", "created_at", "expires_at", "delivery_status", "consumed_by", "consumed_at")],
  ["membership_receipts", owned, pick("user_id", "member_number", "nonce", "receipt_hash", "created_at", "chain", "chain_transaction", "chain_status")],
  ["wish_groups", ownedList],
  ["wishlist_wishes", `${ownedList} AND ${ownedWish}`],
  ["wish_group_members", `${ownedList} AND ${ownedWish}
    AND EXISTS (SELECT 1 FROM wish_groups g WHERE g.id=t.group_id AND g.wishlist_id=t.wishlist_id)`],
  ["education_course_group_members", `EXISTS (SELECT 1 FROM education_course_groups g WHERE g.id=t.group_id AND g.user_id=$1)
    AND EXISTS (SELECT 1 FROM education_courses c WHERE c.id=t.course_id AND c.user_id=$1)`],
  ["education_item_group_members", `EXISTS (SELECT 1 FROM education_item_groups g WHERE g.id=t.group_id AND g.section=t.section AND g.user_id=$1)
    AND ((t.section='conferences' AND EXISTS (SELECT 1 FROM education_conferences c WHERE c.id=t.item_id AND c.user_id=$1))
      OR (t.section='coaching' AND EXISTS (SELECT 1 FROM education_coaching_sessions c WHERE c.id=t.item_id AND c.user_id=$1)))`],
  ["wish_images", owned, bytes("image_data", "id", "user_id", "mime_type", "size_bytes", "created_at"), 1],
  ["lab_report_uploads", owned, bytes("pdf_data", "id", "user_id", "filename", "mime_type", "size_bytes",
    "file_hash", "report_json", "created_at"), 1],
  ["identity_report_uploads", owned, bytes("pdf_data", "id", "user_id", "section", "filename", "mime_type",
    "size_bytes", "file_hash", "document_json", "created_at"), 1],
  // history.bundle is an operational snapshot of the Git repository, not an account attachment.
  ["private_files", `${owned} AND t.source_path<>'history.bundle'`, bytes("file_data", "id", "user_id",
    "source_path", "filename", "mime_type", "size_bytes", "file_sha256", "created_at"), 1],
  ["stories", `${owned} AND t.expires_at>CURRENT_TIMESTAMP`,
    bytes("video_data", "id", "user_id", "size_bytes", "duration_seconds", "created_at", "expires_at"), 1],
  // Catalog subscriptions reuse follows. Export only rows involving this account.
  ["follows", "(t.follower_id=$1 OR t.following_id=$1)"],
  ["sphere_section_shares", "t.owner_user_id=$1"],
  ["sphere_access_requests", "(t.requester_user_id=$1 OR t.owner_user_id=$1)"],
  ["messenger_conversations", "(t.user_a=$1 OR t.user_b=$1)"],
  ["messenger_messages", `EXISTS (SELECT 1 FROM messenger_conversations c WHERE c.id=t.conversation_id
    AND ${conversationParticipant})`, strip("client_id")],
  ["business_marketplace_items", "t.business_user_id=$1"],
  // place_listings is a platform-owned public catalog, so its descriptions are
  // deliberately excluded; the account-owned place_waitlist rows are exported above.
  ["wishlist_business_pages", "t.business_user_id=$1"],
  ["wishlist_business_items", "t.business_user_id=$1"],
  ["wishlist_business_offers", "t.buyer_user_id=$1"],
  ["business_personal_offers", "(t.business_user_id=$1 OR t.recipient_id=$1)",
    `${strip("idempotency_key")} || jsonb_build_object('refunded_at',
      (SELECT p.refunded_at FROM roll_store_purchases p WHERE p.id=t.purchase_id AND p.user_id=t.recipient_id))`],
  ["business_gift_cards", "t.owner_id=$1", strip("issue_key")],
  ["business_gift_card_events", "(t.actor_id=$1 OR t.recipient_id=$1)", strip("request_key")],
  ["wish_group_fundraisers", "t.owner_id=$1"],
  ["wish_group_contributions", `(t.sender_id=$1 OR EXISTS (SELECT 1 FROM wish_group_fundraisers f
    WHERE f.id=t.fundraiser_id AND f.owner_id=$1))`, strip("idempotency_key")],
  ["reward_needs", owned, strip("idempotency_key")],
  ["reward_need_offers", needOfferParticipant, strip("idempotency_key")],
  ["reward_need_events", "t.actor_id=$1"],
  ["reward_blockchain_receipts", `EXISTS (SELECT 1 FROM reward_need_offers o JOIN reward_needs n ON n.id=o.need_id
    WHERE o.id=t.offer_id AND (o.business_id=$1 OR n.user_id=$1))`, bytes("proof", "offer_id", "content", "digest",
    "status", "bitcoin_height", "bitcoin_hash", "verified_at", "created_at"), 1],
  ["roll_transactions", "(t.sender_id=$1 OR t.recipient_id=$1)", strip("idempotency_key")],
  ["roll_manual_grants", owned, strip("idempotency_key")],
  ["roll_store_purchases", owned, strip("idempotency_key")],
  ["roll_ton_orders", owned, strip("idempotency_key")],
  ["roll_star_orders", owned, strip("idempotency_key", "invoice_url", "checkout_query_id", "telegram_payment_charge_id", "telegram_user_id")],
];

async function accountBackupSources(client) {
  const { rows: [schema] } = await client.query(`SELECT to_regclass('user_mood_entries') IS NOT NULL AS mood_ready,
    to_regclass('profile_session_slots') IS NOT NULL AS slots_ready,
    to_regclass('profile_announcements') IS NOT NULL AS announcements_ready,
    to_regclass('roll_marketplace_orders') IS NOT NULL AS marketplace_orders,
    to_regclass('roll_marketplace_order_events') IS NOT NULL AS marketplace_events,
    to_regclass('notification_preferences') IS NOT NULL AS notification_preferences,
    to_regclass('notification_reminders') IS NOT NULL AS notification_reminders,
    to_regclass('user_notifications') IS NOT NULL AS user_notifications,
    to_regclass('notification_push_subscriptions') IS NOT NULL AS notification_push_subscriptions,
    to_regclass('notification_delivery_outbox') IS NOT NULL AS notification_delivery_outbox,
    to_regclass('friend_map_preferences') IS NOT NULL AS friend_map_preferences,
    to_regclass('friend_map_locations') IS NOT NULL AS friend_map_locations,
    to_regclass('friend_map_proximity') IS NOT NULL AS friend_map_proximity`);
  if (schema.marketplace_orders !== schema.marketplace_events) throw new Error("Incomplete marketplace settlement schema");
  const notificationTables = [schema.notification_preferences, schema.notification_reminders, schema.user_notifications,
    schema.notification_push_subscriptions, schema.notification_delivery_outbox];
  if (notificationTables.some(Boolean) && !notificationTables.every(Boolean)) throw new Error("Incomplete notification schema");
  // Push endpoints/keys are device credentials. The delivery outbox is
  // operational retry/lease state. Neither belongs in an account archive.
  const notifications = notificationTables.every(Boolean) ? [
    ["notification_preferences", owned, pick("user_id", "time_zone", "medication_reminders", "daily_overview", "booking_email", "booking_push")],
    ["notification_reminders", owned, pick("id", "user_id", "title", "start_on", "remind_at", "repeats_daily")],
    ["user_notifications", owned, pick("id", "user_id", "kind", "title", "action_path", "scheduled_at", "local_day", "local_time", "read_at")],
  ] : [];
  const friendMapTables = [schema.friend_map_preferences, schema.friend_map_locations, schema.friend_map_proximity];
  if (friendMapTables.some(Boolean) && !friendMapTables.every(Boolean)) throw new Error("Incomplete friend map schema");
  // Export durable consent settings. Exact live coordinates expire after ten
  // minutes and proximity rows are operational deduplication state, so neither
  // belongs in a long-lived account archive.
  const friendMap = friendMapTables.every(Boolean) ? [
    ["friend_map_preferences", owned, pick("user_id", "share_location", "nearby_notifications")],
  ] : [];
  const settlements = schema.marketplace_orders ? [
    ["roll_marketplace_orders", "(t.buyer_id=$1 OR t.seller_id=$1)",
      `${strip("request_key", "gift_card_id", "gift_payment_id")} || CASE WHEN t.buyer_id=$1
        THEN jsonb_build_object('gift_card_id',t.gift_card_id) ELSE '{}'::jsonb END`],
    ["roll_marketplace_order_events", `EXISTS (SELECT 1 FROM roll_marketplace_orders o
      WHERE o.id=t.order_id AND (o.buyer_id=$1 OR o.seller_id=$1))`, strip("operator_label")],
  ] : [];
  const [userSource, ...remaining] = sources;
  const bookings = schema.slots_ready ? [
    ["profile_session_slots", `(t.owner_id=$1 OR EXISTS (SELECT 1 FROM profile_session_bookings b
      WHERE b.slot_id=t.id AND b.guest_id=$1))`, pick("id", "owner_id", "starts_at", "ends_at", "title")],
    ["profile_session_bookings", `(t.guest_id=$1 OR EXISTS (SELECT 1 FROM profile_session_slots s
      WHERE s.id=t.slot_id AND s.owner_id=$1))`, pick("id", "slot_id", "guest_id", "status", "created_at", "responded_at")],
  ] : [];
  return [
    schema.mood_ready ? [userSource[0], userSource[1], `${userSource[2]} || ${pick("mood_level", "mood_public")}`] : userSource,
    ...(schema.mood_ready ? [["user_mood_entries", owned, pick("user_id", "id", "level", "recorded_at")]] : []),
    ...bookings,
    ...settlements,
    ...notifications,
    ...friendMap,
    ...(schema.announcements_ready ? [["profile_announcements", "t.owner_id=$1", pick("id", "owner_id", "title", "body", "created_at")]] : []),
    ...remaining,
  ];
}

// Check the same projections in production without reading any account rows.
export async function verifyAccountBackupSchema(client) {
  for (const [table, filter, projection = "to_jsonb(t)"] of await accountBackupSources(client)) {
    await client.query(`SELECT (${projection})::text AS record FROM ${table} t WHERE ${filter} LIMIT 0`, [""]);
  }
}

async function* accountJson(client, userId, createdAt, signal, privateNotes) {
  yield `{"format":"rollapp-account-backup","version":1,"createdAt":${JSON.stringify(createdAt)},"tables":{`;
  for (const [index, [table, filter, projection = "to_jsonb(t)", batchSize = 100]] of (await accountBackupSources(client)).entries()) {
    signal.throwIfAborted();
    yield `${index ? "," : ""}"${table}":[`;
    await client.query(`DECLARE rollapp_backup NO SCROLL CURSOR FOR
      SELECT (${projection})::text AS record FROM ${table} t WHERE ${filter}`, [userId]);
    let first = true;
    for (;;) {
      signal.throwIfAborted();
      const { rows } = await client.query(`FETCH FORWARD ${batchSize} FROM rollapp_backup`);
      for (const { record } of rows) {
        // Stream PostgreSQL's JSON text without rounding BIGINT/NUMERIC in JS.
        yield (first ? "" : ",") + record;
        first = false;
      }
      if (rows.length < batchSize) break;
    }
    await client.query("CLOSE rollapp_backup");
    if (table === "users" && first) throw new Error("Backup account no longer exists");
    yield "]";
  }
  yield "}";
  if (privateNotes !== undefined) yield `,"privateNotes":${JSON.stringify({ markdown: privateNotes })}`;
  yield "}\n";
}

export function writeAccountBackup({ transaction, userId, createdAt, output, signal, privateNotes }) {
  return transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '20s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await pipeline(Readable.from(accountJson(client, userId, createdAt, signal, privateNotes)), createGzip(), output, { signal });
  });
}
