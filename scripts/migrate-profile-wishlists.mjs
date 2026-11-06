import { productionRollsDatabase } from "./rolls-database.mjs";
import { profileWishlistLinksColumn } from "../server/profile-wishlists.js";

// Deliberate additive migration, separate from development startup and release.
const db = await productionRollsDatabase();
try {
  await db.transaction(async (client) => {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query(profileWishlistLinksColumn);
    await client.query("SELECT wishlist_links FROM users LIMIT 0");
  });
  console.log("В проверенной production-базе доступно поле users.wishlist_links.");
} finally {
  await db.pool.end();
}
