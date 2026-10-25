import { isReservedProfileUsername } from "./profile-paths.js";

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
    await client.query("SELECT user_id,contact_ids,description,expected_result,actual_result,due_on,start_time FROM planning_tasks LIMIT 0");
    await client.query("SELECT token_hash,user_id,expires_at FROM sessions LIMIT 0");
    await client.query("SELECT user_id,section,content_json,updated_at FROM identity_content LIMIT 0");
    await client.query("SELECT user_id,section,content_json,updated_at FROM career_content LIMIT 0");
    await client.query("SELECT id,user_id,image_url FROM health_medications LIMIT 0");
    await client.query("SELECT id,user_id,title,content,created_at,updated_at FROM planning_notes LIMIT 0");
    await client.query("SELECT id,user_id,tracker,entry_on,data_json,created_at,updated_at FROM health_tracker_entries LIMIT 0");
  });
  return mode;
}
