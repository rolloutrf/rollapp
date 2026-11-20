import "dotenv/config";
import dotenv from "dotenv";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { placeListingsSchema } from "../server/modules/catalog-marketplace/place-listings.js";
if(process.argv.slice(2).some(arg=>arg!=="--apply"))throw new Error("Use node scripts/migrate-place-listings.mjs [--apply]");
dotenv.config({path:".env.local",override:false,quiet:true});
process.env.PG_POOL_SIZE="1";
const db=await productionRollsDatabase();
try {
 console.log("Verified production target:",db.target);
 const inspect=async client=>{
  const tables=await client.query("SELECT to_regclass('place_listings')::text AS listings,to_regclass('place_waitlist')::text AS waitlist");
  console.log(tables.rows[0]);
 };
 await db.transaction(async client=>{await client.query("SET TRANSACTION READ ONLY");await inspect(client);});
 if(process.argv.includes("--apply")) {
  await db.transaction(async client=>{await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");await client.query(placeListingsSchema);await inspect(client);});
  console.log("Additive place listings schema applied. No content backfill or deletion.");
 } else console.log("READ ONLY. --apply requires separate explicit authorization; adds two empty tables (place_listings, place_waitlist).");
}finally{await db.pool.end();}
