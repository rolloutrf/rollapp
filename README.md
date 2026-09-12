# Rollapp

Rollapp is a full-stack wishlist service: users collect wishes, share lists, follow friends, and reserve gifts without spoiling the surprise.

The product is an independent functional alternative to popular wishlist services. It does not reuse Oh My Wishes branding, code, editorial content, or visual assets.

## What is included

- Email/password authentication, Yandex ID, and optional SMS OTP login with HTTP-only sessions.
- Telegram Mini App authentication with explicit one-time account linking.
- Public profiles and shareable list links.
- Multiple lists with public, followers-only, link-only, and private visibility.
- Wishes that may belong to several lists at once.
- Product metadata recognition from Open Graph/Product JSON-LD with SSRF protection, trusted image-CDN checks, and an isolated Chromium fallback for protected retailer pages.
- Prices, priorities, private wishes, multiple reservations, and fulfilled archive.
- Anonymous reservations that never expose the giver to the wish owner.
- Follows, friend search, and birthdays.
- Rolls wallets: a one-time 100-roll welcome credit, private transaction history, and participant-to-participant transfers without fees.
- Responsive desktop and mobile UI.

### Grocery retailer metadata

For exact Yandex Lavka, Lenta, and Samokat product links, the metadata endpoint
first tries the ordinary SSRF-protected HTML fetch. Lavka currently exposes its
Product JSON-LD directly. Lenta can use an isolated Chromium fallback. Samokat
browser rendering is enabled only when an approved CDP renderer is explicitly
configured. A result is accepted only when
the final URL still identifies the same product, Product JSON-LD is present, and
its image belongs to that retailer's product CDN. Prices are snapshots for the
server/default store region and may differ at the user's address.

The runtime Docker image contains Chromium and Xvfb. Rollapp deliberately does
not solve or bypass interactive CAPTCHAs. For reliable production Samokat
imports, point `RETAILER_BROWSER_CDP_URL` at an approved browser renderer or use
an official retailer data integration. The browser's
network allowlist changes per retailer, requests are serialized and deduplicated,
service workers are disabled, and application secrets are not passed to the
browser process. A remote CDP renderer must additionally enforce an outbound
firewall that blocks loopback, private, link-local, and metadata-service ranges;
the application checks public DNS but cannot pin DNS inside a third-party
browser. Existing `SAMOKAT_*` settings remain supported as aliases.

For a local browser-assisted food-retailer workflow, load the companion
extension from `browser-extension/` in Chrome or Comet. On an explicit import it
opens the exact Samokat, Yandex Lavka or Lenta product in an inactive tab of the
user's regular browser profile, returns only the product metadata to Rollapp and
closes the temporary tab. The extension is limited to product pages on those
three stores, localhost and the production Rollapp origin.

## Local development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. When `DATABASE_URL`/`PGHOST` is absent, the server uses an in-memory PostgreSQL-compatible demo database. Use **Try demo** or sign in as `demo@rollapp.test` / `demo1234`.

`APP_ORIGIN` must contain the local frontend origin (normally `http://localhost:5173`). The development server treats it as trusted when Vite proxies `/api` to port 8080. To keep the local copy connected to persistent PostgreSQL, set `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and either `PGPASSWORD` or the Yandex Lockbox variables in `.env`, then run `npm run dev`. For a private Managed PostgreSQL cluster through an SSH tunnel, point the connection at `127.0.0.1:<local-port>` and set `PGSSL_SERVERNAME` to the original cluster FQDN; TLS certificate verification stays enabled.

### Persistent production database tunnel

For local work with a private production database, set `ROLLAPP_TUNNEL_SSH_HOST`, `ROLLAPP_TUNNEL_SSH_USER` and (when needed) `ROLLAPP_TUNNEL_SSH_KEY` in the untracked `.env`. Then use:

```bash
npm run dev:production
```

The command starts a localhost-only SSH tunnel, reconnects it after network changes or Mac sleep, and restarts the local dev service with `PGSSL_SERVERNAME` set to the original database host. Check and stop the pair with `npm run dev:production:status` and `npm run dev:production:stop`.

Useful commands:

```bash
npm test
npm run build
npm run check
```

### OhMyWishes brand import

`npm run catalog:import:ohmywishes:brands -- --output=/tmp/ohmywishes-brands.json` reads the eleven selected public storefronts, paginates at the provider's 30-item limit, and fetches each full product card. It verifies counts, duplicate IDs and brand ownership before any database writes. The output path must not already exist.

Import a reviewed snapshot with `npm run catalog:import:ohmywishes:brands -- --input=/tmp/ohmywishes-brands.json --apply`. This uses the configured production PostgreSQL and Lockbox credentials; add `--production` only when using the configured SSH tunnel. All brands and products are upserted in one transaction, with no user-wishlist changes or catalog deletions. The importer creates only its two brand metadata tables and requires the existing catalog table.

The brand selector and storefront pages read these stored records. Full descriptions, prices and shop URLs are stored in `external_catalog_items`; the original product payloads (including every photo), provider URLs and brand associations are stored in `external_catalog_brand_items`. Reimports replace the current storefront snapshot without duplicating products. The selection importer preserves these brand records. Recommendation loading remains separate.

Use `--input=/tmp/ohmywishes-brands.json --verify` for a read-only comparison of the production data and 48-item application pagination against the collected snapshot.

### Rolls

Open **Роллы** in the service switcher (`/app/rolls`). Every registered account receives 100 whole rolls once. Email and Yandex registrations create the wallet in the same transaction as the account; older accounts are covered by the explicit backfill and by first wallet access. Accounts registered after the wish-reward launch also receive 100 rolls for each of their first 10 newly created wishes, including wishes added manually, copied from another participant, or added from the catalog. Deleting, fulfilling, restoring, or editing a wish never grants the reward again. Rolls are internal community units used for transfers and purchases in the Rollapp store; they can be purchased with Telegram Stars and cannot be withdrawn.

`npm run rolls:grant` checks the configured production database and reports the target without writes. `npm run rolls:grant -- --apply` creates the two additive wallet tables and credits accounts that have no welcome transaction. Repeating it does not reset balances or credit anyone twice. The audit compares every balance with the transaction ledger and checks total balances against issued rolls.

`GET /api/rolls` returns only the authenticated user's balance and history (`offset` pagination). `GET /api/rolls/recipients?q=...` searches public names/usernames without exposing contact information or balances. `POST /api/rolls/transfers` accepts `{ recipientId, amount, note, idempotencyKey }`; the sender always comes from the session. Amounts are whole numbers from 1 to 1,000,000,000, comments are limited to 280 characters, and a UUID request key is required. Wallet locks are acquired in a stable order; debit, credit and ledger entry commit together. A retry with the same key returns the original transfer, while changed parameters are rejected. The browser retains unresolved request keys through reloads.

The store order list is available at `/app/orders`. `GET /api/rolls/orders` returns every purchase for the authenticated user. `POST /api/rolls/orders/:purchaseId/refund` atomically marks an active order as refunded and restores its exact roll amount. Repeating a refund returns the existing result without another credit; orders owned by another user are never disclosed.

Run `npm run test:rolls:production` to verify real PostgreSQL behavior. All test writes, including fixture users and wallet/schema changes, are rolled back. It never substitutes a local or in-memory database.

**Пополнить** offers 100 / 500 / 1,000 rolls for 10 / 50 / 100 Telegram Stars. Purchases require a linked Telegram identity and accepted terms. Only a server-verified `successful_payment` credits the wallet; invoice retries and repeated Telegram updates are idempotent. Support is @koloskof. See [Telegram Stars setup, delivery, and verification](docs/telegram-stars.md) before rollout, including updating the external polling worker. `npm run test:stars:production` runs rollback-only PostgreSQL checks; after building, `npm run test:stars:visual` also checks desktop/mobile purchase flows without charging Stars.

### CDEK pickup for store cats

Buying a cat in `/app/store` first opens CDEK pickup selection, then a purchase review. Start typing in the city combobox and choose a match, then optionally enter a street, house number, metro station or pickup code in the address field below. Results are restricted to the exact CDEK city code; changing the city clears the address and selected pickup point. Three results are shown per page to keep the dialog compact. Once a point is chosen, the search controls and result list collapse into a single selected-point card with an interactive Yandex map and a control to choose another point. The selected and review states fit normal desktop and mobile viewports without nested scrollbars, and every child is constrained to the dialog width. Rolls are charged only after confirmation. The server requires `pickupPointCode`, resolves it from the production catalog and stores an authoritative delivery snapshot in `roll_store_purchases.delivery` in the same transaction as the debit. Unresolved purchases retain their request key and pickup point in session storage, including across reloads.

`npm run cdek:import` checks the configured production database and downloads the official [CDEK XML feed](https://integration.cdek.ru/pvzlist.php?type=PVZ) without writes. `npm run cdek:import -- --apply` adds the catalog table and nullable delivery column, then atomically replaces the catalog snapshot. Existing orders and balances are unchanged. Only active Russian PVZ with `IsHandout=true` are included; lockers and non-handout offices are excluded. No API key is required for this public feed.

`GET /api/delivery/cdek/cities` returns unique cities with region labels to distinguish namesakes. `GET /api/delivery/cdek/points?cityCode=...&q=...&offset=0` returns that city’s pickup points; an empty address returns all its points. Both endpoints require authentication. The server reads the persisted PostgreSQL catalog, refreshes it on demand after 24 hours and retries failed refreshes after five minutes. A previous snapshot is usable for at most seven days with an explicit stale notice; older data or a missing catalog returns an error. Malformed, empty or unexpectedly small feeds never replace the saved catalog. The purchase endpoint rejects unknown or expired pickup points before debiting rolls. No delivery shipment, shipping tariff or carrier label is created by this selection mechanism.

Run `node --test server/cdek.test.js server/rolls.test.js` for parsing and request-validation checks. `npm run test:cdek:production` verifies real catalog search, purchase persistence, insufficient balance and idempotency using production PostgreSQL with all fixture writes rolled back. After `npm run build`, `npm run test:cdek:visual` additionally checks desktop/mobile layout, cancellation and lost-response recovery in Chrome; screenshots are written to `/tmp/rollapp-cdek-checks`.

After building, `node scripts/rolls-visual-preview.mjs --rollback-preview` opens a local-only verification server at `http://127.0.0.1:5184/app/rolls`. Two fixture users and their operations exist only inside an uncommitted production PostgreSQL transaction. The server uses the real wallet routes, never authenticates as an existing user, and restricts transfers to the two fixtures. Stop it with Ctrl+C to roll everything back; it also shuts down automatically after ten minutes. This is a UI test harness, not the application server.

## Production architecture

```text
GitHub push to main
  -> GitHub Actions tests and builds linux/amd64 image
  -> GitHub OIDC is exchanged for a temporary Yandex IAM token
  -> immutable SHA image is pushed to Yandex Container Registry
  -> Container Optimized Image VM is updated
  -> Caddy obtains/renews HTTPS and proxies to the Node application
  -> application reads its PostgreSQL password from Lockbox via VM metadata IAM
  -> CI restores the @rollappRFbot Mini App menu and bot commands from a dedicated Lockbox secret
  -> Yandex Managed PostgreSQL stores application data
```

Production URL: [https://роллапп.рф](https://роллапп.рф)

Yandex Cloud resources:

- folder `b1gebpfrhvkd43r38q98`;
- Managed PostgreSQL cluster `c9q11j9k294u5dmlk127`, database `rollapp`, user `rollapp_app`;
- Container Registry `crpvg7pqnbpjl26q93f6`;
- recovered Compute VM `epdn3osv2a7l82iqoo3v`;
- runtime service account `ajers2ngi708sf3i1t4g`;
- CI service account `ajea75b2e3r8kiigmice`;
- database password stays in Connection Manager Lockbox secret `e6qn7uuqpp2jg3krbh4u`;
- Telegram bot token and webhook secret stay in protected Lockbox secret `e6qqi6inhrnvg67mkhhs`;
- static IP `51.250.110.17`; `роллапп.рф` is canonical, while `www.роллапп.рф` and `rollapp.51-250-110-17.sslip.io` permanently redirect to it so authentication stays on one cookie host.

No long-lived Yandex key is stored in GitHub. The federated credential accepts only the immutable GitHub subject for `rolloutrf/rollapp` on `refs/heads/main`. CI can push to this registry, update this VM, and read only the Telegram deployment secret; runtime can pull images and read the database and Telegram runtime secrets.

## Configuration

Local `.env` variables are documented in `.env.example`. Production non-secret settings live in `deploy/docker-compose.template.yml`; the PostgreSQL password is loaded at runtime by `server/start.js` and never enters the repository, VM metadata, or GitHub Actions.

The server initializes idempotent tables at startup. Production seeding is disabled unless `SEED_DEMO=true` is explicitly set.

### Marketplace offer search

Product wishes can always use the direct Wildberries and Yandex Market
resolvers. AI-assisted search across the wider store set additionally needs an
OpenRouter key. In production, keep that key in Yandex Lockbox under `api_key`,
set `YC_OPENROUTER_LOCKBOX_SECRET_ID`, and grant the runtime service account
`lockbox.payloadViewer`; never put the raw key in Compose or GitHub.

Personal OpenRouter keys require a separate, stable encryption secret of at
least 32 characters. Store it in Lockbox under `encryption_secret`, set
`YC_USER_CREDENTIALS_LOCKBOX_SECRET_ID`, and grant the same runtime access.
Losing or rotating this value without a credential migration makes previously
stored personal keys unreadable. If either AI credential path is unavailable,
the refresh endpoint continues with direct catalogues and reports that fallback
to the client instead of failing the whole search.

Profile settings let each user connect, replace, or disconnect a personal key
and select their own model. Connecting a key validates it with OpenRouter's
read-only `/api/v1/key` endpoint before writing the encrypted value. Model-only
changes preserve the key. The searchable model catalogue comes from
`/api/v1/models` (cached for five minutes); it includes synchronous text models
supporting tools, structured outputs, and a response token limit. Personal model
preferences apply only to requests using that user's key; the server fallback
continues to use `OPENROUTER_MODEL`. No paid completion is made when saving settings.

### Yandex ID login

Yandex ID uses the server-side Authorization Code flow with PKCE S256. The
browser receives only a short-lived, HTTP-only state cookie; authorization
attempts are consumed once from PostgreSQL, and Yandex access/refresh tokens are
discarded after the profile request. Existing Rollapp accounts are never merged
silently by email because Yandex userinfo does not expose an `email_verified`
flag. Instead, the user signs in locally once and explicitly completes linking.

Create a Yandex OAuth application of type **For user authentication** with the
web platform, enable login/name and email access (avatar may be optional), and
register the exact callback:

```text
https://xn--80avakiab.xn--p1ai/api/auth/yandex/callback
```

For local development, register a separate application with
`http://localhost:5173/api/auth/yandex/callback`. Set
`YANDEX_OAUTH_CLIENT_ID` and `YANDEX_OAUTH_CLIENT_SECRET`; the callback is
derived from `PUBLIC_APP_URL` unless `YANDEX_OAUTH_REDIRECT_URI` is set. In
production, store `client_id` and `client_secret` in Yandex Lockbox and set
`YC_YANDEX_OAUTH_LOCKBOX_SECRET_ID`. The runtime reads those values without
putting the client secret in the compose file.

### Password recovery

Email/password accounts can request a one-time reset link from `/forgot-password`. Reset tokens expire after 30 minutes, are stored only as SHA-256 hashes, become invalid after one use, and revoke every existing session when the password changes. The request endpoint always returns the same public response for known and unknown email addresses.

In-memory local development can use `EMAIL_PROVIDER=console` and print the reset link only to the local server terminal. That provider is blocked in production and whenever `DATABASE_URL` or `PGHOST` points at persistent PostgreSQL. Automated tests use the test-only provider. Production sends from the verified `noreply@роллапп.рф` Cloud Postbox identity through the VM's short-lived IAM token, without a static mail credential; the runtime service account has the least-privilege `postbox.sender` role. `PUBLIC_APP_URL` must be the canonical HTTPS origin used in reset links.

### Phone login

Phone login is an additional sign-in method for existing accounts. A signed-in user first verifies and links a Russian mobile number in settings; email/password login remains available and existing sessions are not invalidated. Unknown phone numbers never create accounts and receive the same API response shape as linked numbers.

The OTP backend supports three provider modes:

- `disabled` (default): the public configuration reports that phone login is unavailable;
- `test`: deterministic delivery for automated tests only and rejected outside `NODE_ENV=test`;
- `yandex`: SMS delivery through Yandex Cloud Notification Service.

Yandex mode obtains a short-lived IAM token from the Compute VM metadata service and calls the CNS HTTP API directly, so no static cloud access key is stored in the app. The VM runtime service account needs the `notifications.publisher` role, an active SMS channel, and a registered authorization-message template/sender. Set `PHONE_AUTH_SECRET` to a random value of at least 32 bytes through the runtime secret mechanism before enabling the provider.

OTP codes expire after five minutes, are single-use, and are stored only as HMAC digests. Full phone numbers and requester IP addresses are also represented by keyed HMAC digests in PostgreSQL; the API exposes only a masked last-four-digit display. Persistent resend, per-phone, per-IP, attempt, and global daily limits protect the SMS quota. See `.env.example` for configurable bounds.

`PHONE_AUTH_SECRET` is also the stable lookup key for linked phone numbers. Rotating it without a planned re-verification migration makes existing phone links unavailable, so keep it in Lockbox, back it up, and rotate it only through an explicit account migration.

### Telegram Mini App

`@rollappRFbot` opens the production app over HTTPS. The browser sends only Telegram's raw `initData`; the server verifies its HMAC signature and freshness before it trusts the Telegram user ID. A Telegram identity is never merged by display name or `@username`: an existing Rollapp user signs in once and explicitly links the accounts, then later bot launches create the normal HTTP-only Rollapp session without a password.

Store `bot_token` and an independent random `webhook_secret` in a dedicated Yandex Lockbox secret. Configure its ID through `YC_TELEGRAM_LOCKBOX_SECRET_ID` and grant payload-viewer access to the runtime and CI service accounts. Telegram currently times out in both directions to Yandex Cloud, so production updates are long-polled by the dedicated GitHub Actions worker while the web application and database remain in Yandex Cloud. The worker exchanges GitHub OIDC for a dedicated least-privilege service account that can read only this secret, loads the bot token once, and clears the temporary Yandex IAM token before polling. Neither token is sent to the browser, stored in GitHub, or committed to the repository. Every successful `main` deployment removes stale webhooks and restores the global Mini App menu button and bot commands.
