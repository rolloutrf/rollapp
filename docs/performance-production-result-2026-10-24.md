# Performance production rollout — 2026-10-24

PR https://github.com/rolloutrf/rollapp/pull/12 merged into main as 49946b937e35d5680762728f4739edf884ce6456.
Final run: https://github.com/rolloutrf/rollapp/actions/runs/40063599138
Status at this record: mandatory Test and build still running, deployment not yet confirmed.

Clean ea9587a passed all eleven comprehensive stages; committed evidence is docs/performance-release-comprehensive-2026-10-24.json on main. Final integrated unit suite: 830 PASS, 1 SKIP, zero failures. Added page-scrollers/lab-results/identity-reports/To Do matrices on ab17c08 all passed. This is distinct from the earlier complete comprehensive and is not a second full comprehensive claim.

Previous healthy version and rollback: 18bb093354bb8ea5c36f2696c6321381d8cd68a5. Verified VM fv4chl6pdb4lnhsj7139 / rollapp-recovery-20261010, folder b1gebpfrhvkd43r38q98, runtime account ajers2ngi708sf3i1t4g. Read-only SSH check: root filesystem 19 GB, 7.2 GB free; one running container on previous healthy SHA, eight images. No image/container/volume deletion, restart or schema operation performed. Existing production schema verified read-only earlier. Existing development service preserved.

Production browser session is available and currently shows prior UI and all saved review content. After CI: require exact expected SHA in health, check redirects/profile, reload production performance, verify period tiles and absent introduction/cards, record screenshots and complete this report. Runtime diagnostic state is also saved in /tmp/rollapp-performance-rollout-state-2026-10-24.json.

## Superseding run

Run 40063599138 ended cancelled after approximately one hour of checks, not a test failure, without image/cloud publication. It was replaced by main 71dcc8e7e8e7af4c2351fd6d3be7a3a4ef7cc82f (long personality test/PDF title layout), run https://github.com/rolloutrf/rollapp/actions/runs/40067426398. Verified 49946b9 is its ancestor and both performance source/test files are byte-identical. Adopted this run and exact SHA as the release target; did not start another competing rollout.

## Completed

Production is healthy on exact SHA 71dcc8e7e8e7af4c2351fd6d3be7a3a4ef7cc82f. Final run 40067426398 completed SUCCESS, including the full Test and build release gate, immutable image publication, VM metadata deployment, production exact-SHA/redirect/profile checks and Telegram configuration. No manual VM restart or image cleanup was needed.

VM full metadata confirms the expected immutable 71dcc8e image, correct runtime SA, ROLLAPP_DATABASE_INITIALIZATION=verify, and no conflicting container declaration. After rollout: 6.0 GB free on the root disk, rollback image 18bb093 retained. An earlier CLI read without --full omitted metadata and was not used as configuration evidence; full metadata was then checked explicitly.

Production user session reloaded successfully. Eight live sizes 320/390/768/820/1024/1440/1920 and 390×400: zero decorative Card nodes, removed introduction absent, all five period tiles 130×100px, no root horizontal overflow, mobile tab rail reaches both screen edges. Selected Summer 2023 and verified its 3-result period, then restored Summer 2025. Actual mobile and desktop screenshots inspected; no review content was edited during live QA.

Evidence: /tmp/rollapp-performance-production-geometry-2026-10-24.json and /tmp/rollapp-performance-deployed-2026-10-24.png. Full report/PDF-title smoke on exact 71dcc8e also passed independently. Comprehensive evidence remains specifically for clean ea9587a; final 71dcc8e evidence is its mandatory CI release gate plus affected live/fixture checks. Physical iOS/Telegram IME and unrelated complex flows are not newly claimed verified.

Final local state: the serving b2bb checkout reports keepalive enabled, service ready (PID 68474), API/frontend ready at 127.0.0.1:53197; left running. The primary d33e checkout has no node_modules, so its status command cannot import dotenv; the real serving checkout status above is the readiness evidence. Primary presentation edits and unrelated workspace state were preserved. The isolated release worktree is clean at 71dcc8e and can be archived; committed audit evidence remains on main and final rollout evidence stays in the primary checkout.
