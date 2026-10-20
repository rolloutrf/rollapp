# Safari navigation report — 2026-10-20

User reported overlapping header controls in Safari on iPhone. The exact device
failure was not reproduced. Production health returned d116857 and the published
JS already contained the separate mobile navigation.

Changed `useIsMobile` to use the CSS media query both initially and on changes,
instead of `innerWidth`. This prevents contradictory JS/CSS layouts when their
viewport measurements differ. Navigation regression forces innerWidth=980 at
393px and checks initial rendering plus 393→820→390 transitions.

Workspace was dirty at entry (d116857). Other concurrent work committed this
change during verification; final observed HEAD was f461c5f1773dafcf4ce2ac2aa2398d8dbd2ad3e5.
These results cover the live checkout, not one frozen release tree.

- `test:navigation`: PASS, all nine widths 320–1920 and viewport mismatch case.
  Log: `/tmp/rollapp-nav-photo-fixed.log`.
- `test:controls`: PASS, full matrix including short viewport and DPR3.
  Log: `/tmp/rollapp-photo-controls.log`.
- `test:ui`: PASS; `build`: PASS.
- `npm test`: PASS 777, skipped 1 after rerunning outside sandbox; initial four
  failures were loopback listen EPERM. Log: `/tmp/rollapp-photo-unit.log`.
- `npm audit`: 7 high tooling vulnerabilities; production audit: 0. No dependency
  updates made for this navigation fix.
- `git diff --check`: PASS.

No deployment or real-iPhone confirmation. A new full comprehensive run was not
performed for this focused fix; the separate integration audit is independent.
Navigation screenshot inspected; geometry assertions are the primary evidence.
No production data was saved. Existing production-backed dev API health was OK
on 5172, but that port belongs to another worktree. This workspace's keepalive is
enabled and cannot start its frontend on the occupied port; no process was killed
or PID file deleted. No database substitute was used.
