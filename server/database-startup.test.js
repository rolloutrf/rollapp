import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { initializeRuntimeDatabase } from "./database-startup.js";

function fixture({ username = "someone", unavailable = "" } = {}) {
  const calls=[];
  return { calls, options: {
    environment: { ROLLAPP_DATABASE_INITIALIZATION: "verify" }, isMemoryDatabase: false,
    migrate: async()=>{calls.push("MIGRATE");},
    transaction: async callback=>callback({query:async sql=>{
      calls.push(sql);
      if (unavailable && sql.includes(unavailable)) throw new Error("Existing schema unavailable");
      return {rows:sql==="SELECT username FROM users"?[{username}]:[]};
    }}),
  }};
}

test("existing production startup verifies document/auth columns in a read-only transaction without migrations or cleanup",async()=>{
  const {calls,options}=fixture();assert.equal(await initializeRuntimeDatabase(options),"verify");
  assert.equal(calls[0],"SET TRANSACTION READ ONLY");
  assert(calls.slice(1).every(sql=>sql.startsWith("SELECT ")));
  for(const table of ["sessions","identity_content","career_content","planning_tasks","planning_notes","health_tracker_entries"])assert(calls.some(sql=>sql.includes(`FROM ${table} LIMIT 0`)));
  assert(!calls.includes("MIGRATE"));
});
test("a missing production document table is an error and cannot fall back to migration or demo data",async()=>{
  for (const unavailable of ["identity_content", "planning_notes", "health_tracker_entries", "expected_result", "actual_result"]) {
    const {calls,options}=fixture({unavailable});await assert.rejects(initializeRuntimeDatabase(options),/Existing schema unavailable/);assert(!calls.includes("MIGRATE"));
  }
});
test("existing-database startup preserves the reserved profile-name security guard",async()=>{
  const {calls,options}=fixture({username:"api"});await assert.rejects(initializeRuntimeDatabase(options),/Reserved profile usernames/);assert(!calls.includes("MIGRATE"));
});
test("verify mode rejects memory databases before opening a transaction",async()=>{
  const {calls,options}=fixture();options.isMemoryDatabase=true;await assert.rejects(initializeRuntimeDatabase(options),/production PostgreSQL/);assert.deepEqual(calls,[]);
});
test("normal explicit migration startup remains available, and invalid modes never mutate",async()=>{
  const {calls,options}=fixture();options.environment={};assert.equal(await initializeRuntimeDatabase(options),"migrate");assert.deepEqual(calls,["MIGRATE"]);calls.length=0;options.environment={ROLLAPP_DATABASE_INITIALIZATION:"invalid"};await assert.rejects(initializeRuntimeDatabase(options),/migrate или verify/);assert.deepEqual(calls,[]);
});
test("the production development launcher always verifies the existing database",()=>{
  const source=readFileSync(new URL("../scripts/dev.mjs",import.meta.url),"utf8");assert.match(source,/process\.env\.ROLLAPP_DATABASE_INITIALIZATION\s*=\s*"verify";/);assert.match(source,/process\.env\.DEMO_MODE\s*=\s*"false";/);
});
