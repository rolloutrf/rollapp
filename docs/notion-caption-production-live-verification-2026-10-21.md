# Production caption release: authenticated live verification

Date: 2026-10-21 (Europe/Moscow).
Released SHA: `c8b7dc22b1259159aea112e7c412dec431020485`.
CI run: https://github.com/rolloutrf/rollapp/actions/runs/39485719187.

Fresh production health reports `ok: true`, `service: rollapp` and exact c8 SHA.
The successful CI and earlier read-only canonical redirect/profile checks remain
recorded in `/tmp/rollapp-caption-release-c8b7dc2-2026-10-20.json`.

After the user signed into the Codex in-app browser, the authenticated production
life-strategy route loaded its editable document successfully. Live smoke was
read-only, at the actual 898×984 viewport; it is not a full responsive matrix.

- Editor exposes the textbox role and editable content.
- Computed prose: Geist Variable, 18px size, 28px line height.
- Editor border 0px, outline none, box shadow none, including focused state.
- Root has no horizontal overflow.
- Native selection of the unique first heading shows exactly one contextual
  formatting toolbar; screenshot visually confirmed its placement.
- Native Right collapses selection and leaves no visible formatting toolbar.
- No text, formatting, checkbox or document transaction was intentionally changed;
  no test save, upload, delete, schema initialization or migration was performed.

The repeated-heading selection attempt was rejected as ambiguous; selecting the
unique heading succeeded. This was a diagnostic targeting error, not a product
failure. The document contains no inline images, so live caption creation/resize
was not exercised against production data. Those behaviours retain their frozen
runtime08 comprehensive evidence: ten stages passed, 417 editor cases, and c8
differs from that tested runtime only by documentation.

The earlier missing-login blocker is resolved. This closes the release's pending
authenticated smoke check, not the entire Notion fidelity goal: media viewer,
other media, arbitrary complex compositions and real-device iOS/Telegram/IME
remain unverified/open. The release monitor stays paused; no duplicate release
or automatic production restart is needed.
