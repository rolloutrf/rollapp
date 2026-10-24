# Performance deployment — 2026-10-24

User requested deployment of the performance presentation edits. Isolated branch based on main cae73c33ca6ce19890a718ad88d3afb377e6788c; unrelated dirty checkouts preserved. Original implementation ca018993c993c506afaf971cdd5adb8c974fa4dd. PR #12.

The deployment removes the redundant introduction and nested decorative cards and uses shared 130×100px period tiles with result counts. No private archive text or source files added. No data/schema change.

Preflight: production healthy at 18bb093354bb8ea5c36f2696c6321381d8cd68a5; concurrent main run 40055889949 already in progress, not interrupted. Existing configured production schema verified by initializeRuntimeDatabase in READ ONLY with migrations disabled. Local persistent development service left running.

Dependency review found dev-only fast-uri 3.1.8 advisories. Maintainer sources confirm 3.1.9 is patched:
https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg
https://github.com/fastify/fast-uri/security/advisories/GHSA-wjr9-j795-jxcr
Only this compatible lockfile entry changed; shadcn stays a development dependency. npm update fast-uri --package-lock-only --ignore-scripts reports zero vulnerabilities. Full and production-only npm audits will be repeated on the final lockfile.

The superseded branch audit 40055971039 was cancelled while pending, before any audit/deployment mutation; final immutable commit will run full check:comprehensive before integration. Main deployment retains mandatory check:release and production exact-SHA health verification. Final results are recorded in the task and CI artifacts; this preparation record does not claim rollout success.

## Full audit and integration

Clean ea9587a90b10415928a60dbef33586e73baa1dd3 passed all 11 check:comprehensive stages (including full release/editor suite), terminal exit 0; JSON stored alongside this report. Both final npm audits: zero vulnerabilities. The duplicate queued branch audit 40056065962 was cancelled; local full audit supplied the evidence.

Main advanced independently through 689df9218d1125d7fe2290647910a9798079ee23. Merged it without conflicts into ab17c08 (performance component unchanged), preserving page-scroller/lab/planning/identity changes. Integrated unit suite: 831 total, 830 PASS, 1 SKIP, 0 FAIL. UI and affected added matrices are being rerun; final main CI must run the complete mandatory release gate before any image publication.

Superseded main runs 40060709489 and 40061810768 were requested cancelled after confirming the active run was still Test and build and every registry/image/VM step was pending. No production operation was interrupted. This avoids intermediate ancestor rollouts racing the final combined release. Terminal cancellation is checked before final dispatch.

The full comprehensive JSON is evidence for ea9587a, not a claim of a second full comprehensive on the later integrated tree. Final CI and affected integration results are separate evidence. No production schema migration was authorized or performed. The newly inherited custom-test schema feature remains subject to its separately documented migration requirement.
