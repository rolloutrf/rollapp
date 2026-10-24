# Performance deployment — 2026-10-24

User requested deployment of the performance presentation edits. Isolated branch based on main cae73c33ca6ce19890a718ad88d3afb377e6788c; unrelated dirty checkouts preserved. Original implementation ca018993c993c506afaf971cdd5adb8c974fa4dd. PR #12.

The deployment removes the redundant introduction and nested decorative cards and uses shared 130×100px period tiles with result counts. No private archive text or source files added. No data/schema change.

Preflight: production healthy at 18bb093354bb8ea5c36f2696c6321381d8cd68a5; concurrent main run 40055889949 already in progress, not interrupted. Existing configured production schema verified by initializeRuntimeDatabase in READ ONLY with migrations disabled. Local persistent development service left running.

Dependency review found dev-only fast-uri 3.1.8 advisories. Maintainer sources confirm 3.1.9 is patched:
https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg
https://github.com/fastify/fast-uri/security/advisories/GHSA-wjr9-j795-jxcr
Only this compatible lockfile entry changed; shadcn stays a development dependency. npm update fast-uri --package-lock-only --ignore-scripts reports zero vulnerabilities. Full and production-only npm audits will be repeated on the final lockfile.

The superseded branch audit 40055971039 was cancelled while pending, before any audit/deployment mutation; final immutable commit will run full check:comprehensive before integration. Main deployment retains mandatory check:release and production exact-SHA health verification. Final results are recorded in the task and CI artifacts; this preparation record does not claim rollout success.
