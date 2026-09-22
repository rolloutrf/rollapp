# Public sharing

Public profiles use `/<username>`. Spaces have stable readable URLs such as
`/<username>/media`, `/places`, `/food`, `/transport`, `/events` and `/products`.
Existing `?tab=` links, list IDs, wish IDs and `/u/` and `/users/` links remain supported.
Link-only collections continue to use `/s/<token>`; sharing never changes visibility.

The URL determines the selected space and list. Public pages retain the owner's
list/group structure, with counts computed from wishes visible to the viewer.
Group membership is filtered on the server by both accessible lists and wishes.
Opening a wish preserves its collection and group in navigation state.

Saving a profile updates session data immediately and refreshes the public page.
Username changes are serialized with username allocation. The additive
`profile_username_aliases` table reserves previous addresses for the same owner;
old addresses resolve to the current profile and the client replaces the URL.
This protects addresses starting with the first rename after this feature is installed.
Display-name changes do not change the username. Token links resolve the current
owner through the user ID. Public responses omit account/contact flags and are
marked `private, no-store` with `Vary: Cookie`.

Brand navigation generates `?source=brands`; legacy bookmarks are canonicalized.
Provider identifiers remain internal to import/storage adapters for compatibility.
Merchant links omit provider storefronts and provider tracking parameters.

## Verification

- `node --test src/lib/*.test.js shared/*.test.js server/profile-paths.test.js`
- `npm run test:ui`
- `npm run build`
- `SHARING_CHECK_URL=http://127.0.0.1:8188 node scripts/check-public-sharing.mjs`
- Add `--verify-rename-rollback` to verify name/username propagation, historical
  address ownership and token ownership in a transaction that always rolls back.
  The script uses only the configured production database and never commits a rename.

Browser regression scenarios: guest profile, space selection from a list URL,
back/forward, list deep link/reload, group → wish → group, sharing a space,
and missing/private wish/list links. The normal visual smoke creates and deletes
fixtures, so it is not a substitute for the production-safe sharing check above.
