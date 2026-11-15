import assert from "node:assert/strict";
import test from "node:test";
import { imageIsInUse } from "./image-usage.js";

const userId="owner",imageUrl="/api/media/11111111-1111-4111-8111-111111111111";
test("a media reference in a career or identity document prevents deleting its asset",async()=>{
  for(const table of ["career_content","identity_content","planning_notes"]){
    const calls=[];
    const used=await imageIsInUse(async(sql,params)=>{calls.push({sql,params});return{rowCount:sql.includes(`FROM ${table} `)?1:0};},userId,imageUrl);
    assert(used);const documentQuery=calls.find(call=>call.sql.includes(`FROM ${table} `));
    assert(documentQuery.sql.includes(`POSITION($2 IN ${table === "planning_notes" ? "content" : "content_json"})>0`));assert(documentQuery.sql.includes("user_id=$1"));assert.deepEqual(documentQuery.params,[userId,imageUrl]);
    assert(calls.every(call=>call.sql.startsWith("SELECT ")));
  }
});
test("the original wish, profile, course, conference and contact references remain protected",async()=>{
  for(const table of ["health_medications","wishes","users","education_courses","education_conferences","contact_overrides"]){
    assert(await imageIsInUse(async sql=>({rowCount:sql.includes(`FROM ${table} `)?1:0}),userId,imageUrl));
  }
});
test("an unused asset can still be released and database failures fail closed",async()=>{
  assert.equal(await imageIsInUse(async()=>({rowCount:0}),userId,imageUrl),false);
  await assert.rejects(imageIsInUse(async sql=>{if(sql.includes("career_content"))throw new Error("Unavailable");return{rowCount:0};},userId,imageUrl),/Unavailable/);
});
