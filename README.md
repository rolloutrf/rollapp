# Rollapp

Rollapp is a full-stack wishlist service: users collect wishes, share lists, follow friends, reserve gifts without spoiling the surprise, browse curated ideas, and run Secret Santa games.

The product is an independent functional alternative to popular wishlist services. It does not reuse Oh My Wishes branding, code, editorial content, or visual assets.

## What is included

- Email and password authentication with HTTP-only sessions.
- Public profiles and shareable list links.
- Multiple lists with public, followers-only, link-only, and private visibility.
- Wishes that may belong to several lists at once.
- Product metadata recognition from Open Graph tags with SSRF protection.
- Prices, priorities, private wishes, multiple reservations, and fulfilled archive.
- Anonymous reservations that never expose the giver to the wish owner.
- Follows, friend search, birthdays, and in-app notifications.
- Curated gift ideas with search, categories, and save-to-wishlist.
- Secret Santa games with invite codes, hints, drawing, wish access, and anonymous chat.
- Responsive desktop and mobile UI.

## Local development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. When `DATABASE_URL`/`PGHOST` is absent, the server uses an in-memory PostgreSQL-compatible demo database. Use **Try demo** or sign in as `demo@rollapp.test` / `demo1234`.

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
  -> Yandex Managed PostgreSQL stores application data
```

Production URL: [https://51-250-110-17.sslip.io](https://51-250-110-17.sslip.io)

Yandex Cloud resources:

- folder `b1gebpfrhvkd43r38q98`;
- Managed PostgreSQL cluster `c9q11j9k294u5dmlk127`, database `rollapp`, user `rollapp_app`;
- Container Registry `crpvg7pqnbpjl26q93f6`;
- Compute VM `epd40l0koqqqietvpd18`;
- runtime service account `ajers2ngi708sf3i1t4g`;
- CI service account `ajea75b2e3r8kiigmice`;
- database password stays in Connection Manager Lockbox secret `e6qn7uuqpp2jg3krbh4u`;
- static IP `51.250.110.17` and HTTPS hostname `51-250-110-17.sslip.io`.

No long-lived Yandex key is stored in GitHub. The federated credential accepts only the immutable GitHub subject for `rolloutrf/rollapp` on `refs/heads/main`. CI can push to this registry and update this VM; runtime can pull images and read only its database secret.

## Configuration

Local `.env` variables are documented in `.env.example`. Production non-secret settings live in `deploy/docker-compose.template.yml`; the PostgreSQL password is loaded at runtime by `server/start.js` and never enters the repository, VM metadata, or GitHub Actions.

The server initializes idempotent tables at startup. Production seeding is disabled unless `SEED_DEMO=true` is explicitly set.
