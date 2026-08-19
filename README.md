# Rollapp

Rollapp is a full-stack wishlist service: users collect wishes, share lists, follow friends, and reserve gifts without spoiling the surprise.

The product is an independent functional alternative to popular wishlist services. It does not reuse Oh My Wishes branding, code, editorial content, or visual assets.

## What is included

- Email/password authentication and optional SMS OTP login with HTTP-only sessions.
- Telegram Mini App authentication with explicit one-time account linking.
- Public profiles and shareable list links.
- Multiple lists with public, followers-only, link-only, and private visibility.
- Wishes that may belong to several lists at once.
- Product metadata recognition from Open Graph tags with SSRF protection.
- Prices, priorities, private wishes, multiple reservations, and fulfilled archive.
- Anonymous reservations that never expose the giver to the wish owner.
- Follows, friend search, and birthdays.
- Responsive desktop and mobile UI.

## Local development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. When `DATABASE_URL`/`PGHOST` is absent, the server uses an in-memory PostgreSQL-compatible demo database. Use **Try demo** or sign in as `demo@rollapp.test` / `demo1234`.

`APP_ORIGIN` must contain the local frontend origin (normally `http://localhost:5173`). The development server treats it as trusted when Vite proxies `/api` to port 8080. To keep the local copy connected to persistent PostgreSQL, set `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and either `PGPASSWORD` or the Yandex Lockbox variables in `.env`, then run `npm run dev`.

Useful commands:

```bash
npm test
npm run build
npm run check
```

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
