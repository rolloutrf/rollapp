import "dotenv/config";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { productionRollsDatabase } from "./rolls-database.mjs";
if(process.argv.slice(2).some(arg=>arg!=="--apply"))throw new Error("Use node scripts/seed-place-listings.mjs [--apply]");
dotenv.config({path:".env.local",override:false,quiet:true});
process.env.PG_POOL_SIZE="1";
const file=JSON.parse(await readFile(new URL("./seed-data/places-spb.json",import.meta.url),"utf8"));
if(!file||typeof file.space!=="string"||!file.space)throw new Error("Seed file must define a string space");
const places=Array.isArray(file.places)?file.places:[];
for(const place of places){
 if(!place||typeof place.slug!=="string"||!place.slug||typeof place.name!=="string"||!place.name)
  throw new Error("Each place requires non-empty string slug and name");
}
const db=await productionRollsDatabase();
try {
 console.log("Verified production target:",db.target);
 const existing=await db.query("SELECT COUNT(*)::int AS count FROM place_listings WHERE space=$1",[file.space]);
 console.log(`Seed file: ${places.length} places (space=${file.space}, source=${file.source||""}); place_listings now: ${existing.rows[0].count} rows in this space`);
 if(!process.argv.includes("--apply")) {
  console.log("READ ONLY dry-run. --apply requires separate explicit authorization; upserts place_listings rows only, place_waitlist is untouched.");
 } else {
  let upserted=0;
  for(let index=0;index<places.length;index+=50){
   const batch=places.slice(index,index+50);
   await db.transaction(async client=>{
    for(const place of batch){
     await client.query(`INSERT INTO place_listings(id,space,slug,name,category,category_label,subcategory,description,addresses,links,source)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
       ON CONFLICT(space,slug) DO UPDATE SET name=$4,category=$5,category_label=$6,subcategory=$7,description=$8,addresses=$9::jsonb,links=$10::jsonb,source=$11`,
      [randomUUID(),file.space,place.slug,place.name,place.category??"",place.categoryLabel??"",place.subcategory??"",place.description??"",
       JSON.stringify(place.addresses??[]),JSON.stringify(place.links??[]),file.source??""]);
     upserted+=1;
    }
   });
  }
  console.log(`Seeded ${upserted} place listings (space=${file.space}). Waitlist counters preserved.`);
 }
}finally{await db.pool.end();}
