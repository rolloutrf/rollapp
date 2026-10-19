# Group dialog controls — 17 October 2026

- Tested commit: `7104575`; working tree dirty (132 changed or untracked paths before this report). Existing edits preserved.
- Fixed: the education and course group dialog header now uses `ControlBar`; its menu and close buttons use the shared 48px circular outline style and 20px glyphs.
- Checks: `npm run test:ui` passed; `npm run build` passed; `git diff --check` passed. A browser render of the actual group header at 390×844 and 1440×844 measured both buttons as 48×48px, with 20px icons, 1px borders, 24px radii and identical backgrounds.
- Not verified: live production UI and a complete viewport matrix.
