import "dotenv/config";
import dotenv from "dotenv";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { wishlistBusinessSchema } from "../server/wishlist-business.js";
if(process.argv.slice(2).some(arg=>arg!=="--apply"))throw new Error("Use node scripts/migrate-wishlist-business.mjs [--apply]");
dotenv.config({path:".env.local",override:false,quiet:true});
process.env.PG_POOL_SIZE="1";
const db=await productionRollsDatabase();
try {
 console.log("Verified production target:",db.target);
 const inspect=async client=>{
  const column=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='seller_space'");
  const tables=await client.query("SELECT to_regclass('wishlist_business_pages')::text AS pages,to_regclass('wishlist_business_items')::text AS items,to_regclass('wishlist_business_offers')::text AS offers");
  console.log({sellerSpace:column.rowCount>0,...tables.rows[0]});
 };
 await db.transaction(async client=>{await client.query("SET TRANSACTION READ ONLY");await inspect(client);});
 if(process.argv.includes("--apply")) {
  await db.transaction(async client=>{await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");await client.query(wishlistBusinessSchema);await inspect(client);});
  console.log("Additive Wishlist business schema applied. No account/grant/content backfill or deletion.");
 } else console.log("READ ONLY. --apply requires separate explicit authorization; adds one nullable column and three empty tables.");
}finally{await db.pool.end();}
