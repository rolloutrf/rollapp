# Unified local application release — 2026-10-21

Baseline production: c8b7dc22b1259159aea112e7c412dec431020485.
Integration branch: codex/unified-release-20261021, existing attached worktree
inline-file-transfer. Original working copies and their dirty edits preserved.

## Included sources

- Planning notes: 918978a, own API/storage, shared rich editor and notes tests.
- Sleep/nutrition, shared day ribbon and atomic To Do submit: immutable snapshot
  46f40bc of cdbd's dirty working copy, parent9522341.
- Section order: immutable snapshot983c290 of2481, parent9522341.
- Historical deployment evidence: afddc50, preserving newer caption statements.
- Authenticated live caption deployment proof from this chat.
- Remaining local branches were already ancestors of origin/main before this
  integration; they are not restored as older copies of current runtime files.

Merge conflicts resolved by retaining BOTH notes and health API registrations,
both READ ONLY schema checks/tests and both browser suites in check:release.
Caption implementation and417-case editor matrix remain present.

## Database and persistent development

Actual persistent dev owner is905f, PID92146, API/frontend ready; retained.
Main checkout's own PID file is absent, which is not proof the application is
down. Its normal enable command was attempted before identifying905f.
No PID files removed and no running process killed.

Initial integration schema probe loaded only .env.local and failed before
connecting: production configuration absent in that single file. Corrected
probe loaded existing905f .env plus .env.local without printing credentials.
Verified target database=rollapp, role=rollapp_app. Actual merged startup verify
passed in READ ONLY transaction, including existing planning_notes and
health_tracker_entries. No migration, backfill, cleanup or user-data writes.

## Dependencies and pending gates

Initial fresh audits:8 high total,1 high omit-dev, newly reported Vite8.1.5
launch-editor advisory. Official GitHub advisory GHSA-587h-7wmj-h5pm identifies
8.1.6 as fixed in this minor line. Chose pinned compatible8.1.6 rather than
retaining an intermediate broad8.3.5 update; generated lockfile reviewed.
Other existing shadcn-chain advisories must remain explicitly reported; no
incompatible downgrade or forced audit fix.

Locked install and initial shadcn audit passed. Full frozen comprehensive,
final dependency audit, integration diff review, exact release SHA/CI and live
post-deployment UI remain pending at this checkpoint. Partial checks or prior
branch-specific reports must not be described as a complete combined PASS.

After release, resume the open Notion fidelity audit; do not mark real-device
iOS/Telegram/IME, arbitrary compositions or media viewer as verified here.
