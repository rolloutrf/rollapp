import { isReservedProfileUsername } from "./profile-paths.js";
import { verifyAccountBackupSchema } from "./account-backup.js";

// Development reconnects to an existing production database. A reconnect must
// never run the normal schema/data migration and reservation cleanup routine.
export async function initializeRuntimeDatabase({ environment = process.env, isMemoryDatabase, transaction, migrate }) {
  const mode = environment.ROLLAPP_DATABASE_INITIALIZATION || "migrate";
  if (!["migrate", "verify"].includes(mode)) throw new Error("ROLLAPP_DATABASE_INITIALIZATION должен быть migrate или verify.");
  if (mode === "migrate") { await migrate(); return mode; }
  if (isMemoryDatabase) throw new Error("Проверка существующей базы требует настроенный production PostgreSQL. Демо-база отключена.");
  await transaction(async client => {
    await client.query("SET TRANSACTION READ ONLY");
    const users = await client.query("SELECT username FROM users");
    const reserved = users.rows.map(row => row.username).filter(isReservedProfileUsername);
    if (reserved.length) throw new Error(`Reserved profile usernames already exist: ${reserved.join(", ")}`);
    // Check the columns required by authentication and the edited documents.
    // LIMIT 0 validates the real schema without reading profile/document data.
    await client.query("SELECT account_type,business_category,seller_space FROM users LIMIT 0");
    await client.query("SELECT user_id,contact_ids,description,expected_result,actual_result,due_on,start_time FROM planning_tasks LIMIT 0");
    await client.query("SELECT token_hash,user_id,expires_at FROM sessions LIMIT 0");
    await client.query("SELECT user_id,section,content_json,updated_at FROM identity_content LIMIT 0");
    await client.query("SELECT user_id,section,content_json,updated_at FROM career_content LIMIT 0");
    await client.query("SELECT wishlist_links FROM users LIMIT 0");
    await client.query("SELECT id,user_id,image_url FROM health_medications LIMIT 0");
    await client.query("SELECT id,user_id,title,content,created_at,updated_at FROM planning_notes LIMIT 0");
    await client.query("SELECT id,user_id,tracker,entry_on,data_json,created_at,updated_at FROM health_tracker_entries LIMIT 0");
    await client.query("SELECT user_id,contact_id,source_order FROM contact_overrides LIMIT 0");
    await client.query("SELECT user_id,content_json FROM health_lab_content LIMIT 0");
    await client.query("SELECT id,user_id,source_path,file_sha256,size_bytes FROM private_files LIMIT 0");
    await client.query("SELECT key,value_text FROM application_settings LIMIT 0");
    await client.query("SELECT business_user_id,space,title,description,published FROM wishlist_business_pages LIMIT 0");
    await client.query("SELECT id,business_user_id,space,title,description,brand,image_url,action_url,price,active FROM wishlist_business_items LIMIT 0");
    await client.query("SELECT id,item_id,buyer_user_id,dismissed FROM wishlist_business_offers LIMIT 0");
    await client.query("SELECT id,business_user_id,recipient_id,item_id,wishlist_item_id,item_title,price_rolls,expires_at,created_at,idempotency_key,purchase_id FROM business_personal_offers LIMIT 0");

    await client.query("SELECT id,group_id,owner_id,title,target,accepting,created_at FROM wish_group_fundraisers LIMIT 0");
    await client.query("SELECT transaction_id,fundraiser_id,sender_id,idempotency_key FROM wish_group_contributions LIMIT 0");
    await client.query("SELECT id,user_id,video_data,size_bytes,duration_seconds,created_at,expires_at FROM stories LIMIT 0");
    if (environment.ROLLAPP_NEED_REWARDS_ENABLED === "true") {
      await client.query("SELECT id,user_id,title,description,category,status,idempotency_key,created_at FROM reward_needs LIMIT 0");
      await client.query("SELECT id,need_id,business_id,description,reward,status,idempotency_key,expires_at,claim_at,settled_at,dispute_reason,created_at FROM reward_need_offers LIMIT 0");
      await client.query("SELECT id,offer_id,user_id,kind,amount,created_at FROM reward_need_entries LIMIT 0");
      await client.query("SELECT id,offer_id,actor_id,action,note,created_at FROM reward_need_events LIMIT 0");
      await client.query("SELECT offer_id,content,digest,status,proof,bitcoin_height,bitcoin_hash,verified_at,attempts,next_attempt_at,lease_token,last_error,created_at FROM reward_blockchain_receipts LIMIT 0");
    }
    if (environment.YANDEX_DISK_BACKUP_ENABLED === "true") await verifyAccountBackupSchema(client);
  });
  return mode;
}
