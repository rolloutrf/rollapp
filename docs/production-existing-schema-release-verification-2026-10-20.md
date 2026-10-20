# Existing-schema production releases — 2026-10-20

User authorized completing verification and deploying. Preflight found that the
production Compose omitted ROLLAPP_DATABASE_INITIALIZATION; server defaulted to
migrate. initializeDatabase runs schema/backfill and reservation cleanup, including
DELETE, so it must not run merely to publish an editor change.

## Change and evidence

- Base543e0f9, isolated codex/production-verify-startup. Only production Compose,
  its regression unit and durable verification/AGENTS contracts change; no editor,
  API, schema, dependency manifest or data migration is changed.
- Compose explicitly sets ROLLAPP_DATABASE_INITIALIZATION:"verify". Existing
  read-only validator and reserved-username guard remain unchanged; missing schema
  fails visibly. Explicit migration remains a separate authorized operation.
- New template guard first failed:10 PASS/1FAIL. After the two-line config fix,
  npm test784 total/783 PASS/1SKIP/0FAIL; UI37/79 and build PASS, all terminal0.
  npm ci used the current lockfile (shadcn4.22.1); no lockfile edits.
- Real configured production role/database verified by productionRollsDatabase.
  initializeRuntimeDatabase with explicit verify completed in READ ONLY with
  existing auth/document/planning tables and reserved-name guard, migrations0.
  No schema initialization, cleanup, backfill or committed test data.
- Main543 CI39390846598 was checked at Test and build, cloud steps pending,
  then deliberately cancelled before deployment. Terminal cancellation verified;
  no image build or VM metadata update from that run. Older unrelated cancellation
  events were not initiated by this change.
- Production remains healthy d116857, managed dev10724 remains ready. No restart,
  container/image deletion, permission change or production migration performed.

Logs: `/tmp/rollapp-production-verify-{red,unit,ui,build,live-schema}-2026-10-20.log`.
Cloud check-only verification is recorded separately in
`/tmp/rollapp-production-verify-cloud-readonly-2026-10-20.log`; it cannot establish
image availability, rollout or exact-SHA production health.

The combined parent bc7fb04 passed editor399 and all nine comprehensive stages.
Final alignment449abb5/full409/ten-stage audit remains running and immutable;
this deployment-only guard will be integrated without altering that running
editor snapshot. Production release is not complete until the final checked SHA
is healthy and affected live UI has been reviewed. Physical iOS/Telegram IME and
unimplemented rich captions/viewer are not claimed verified by this release.
