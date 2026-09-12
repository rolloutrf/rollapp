# Telegram Stars purchases

`Пополнить` opens packages of 100 / 500 / 1,000 rolls for 10 / 50 / 100 Stars. The user accepts the versioned purchase terms and pays from the Telegram identity linked to their Rollapp account. In Mini Apps the client uses `openInvoice`; in browsers it offers the invoice link. Support and `/paysupport` point to https://t.me/koloskof. `/terms` returns the purchase terms.

## Accounting and delivery

- `GET /api/rolls/stars`: availability, packages, terms, identity-link status.
- `POST /api/rolls/stars/orders`: `{ packageId, idempotencyKey, termsVersion }`. Prices, recipient and Telegram identity come from the server. A committed order survives invoice-provider failures and lost HTTP responses.
- `GET /api/rolls/stars/orders/:id`: owner-only payment status.
- `roll_star_orders`: order, fixed price, accepted terms version, invoice, checkout ID and unique `telegram_payment_charge_id`. This is also the immutable credit ledger for paid Stars purchases.
- `pre_checkout_query`: validates XTR, exact amount, bound Telegram account, expiry and unused checkout. A given order permits one checkout query (redelivery of the same query is safe). A cancelled checkout requires a new order; the original payment is still reconciled if Telegram later confirms it.
- `successful_payment`: locks the wallet and order, validates the receipt, and atomically credits rolls and stores the unique Telegram charge. Repeated updates do not credit again. An expired invoice or disabled sales does not discard a previously accepted payment. A database failure returns an error so delivery retries.
- The browser callback never credits rolls. It polls the authenticated API and refreshes the wallet after server confirmation.

No outbound messages are sent to support automatically. Customers contact support themselves. The existing store-order refund endpoint returns **rolls** and is not a Stars refund endpoint. Stars refunds are handled by the operator via Telegram's `refundStarPayment`; resolve roll accounting explicitly before issuing any refund. Automatic chargeback reconciliation and automatic Stars refunds are outside this purchase implementation.

## Runtime and rollout

Schema initialization adds `roll_star_orders` after the wallet tables. The change is additive. Never enable the new frontend before its backend schema and handlers are running.

`TELEGRAM_STARS_ENABLED=false` pauses new invoices and checkout approvals; successful payments still settle. `TELEGRAM_PAYMENT_SUPPORT_URL` defaults to `https://t.me/koloskof`. The configured bot token remains in Lockbox. Invoice endpoints never expose it.

Both `message` and `pre_checkout_query` must be allowed updates. The repository's production deployment uses **external-polling**, so deploy the updated backend first, then restart the GitHub `Run Telegram bot` worker with the updated code. That worker reads both `bot_token` and `webhook_secret` from Lockbox, forwards payment updates to the authenticated Rollapp webhook, executes checkout answers returned by it, and advances its offset only after settlement is acknowledged. `/start`, `/terms`, and `/paysupport` are answered by the worker directly. Do not start a competing local poller for the same bot.

In external-polling mode the VM does **not** call Telegram to create invoices: its outbound Telegram connection can time out. The order endpoint commits and returns the pending order immediately. The same external worker checks `/api/telegram/star-invoices` every two seconds in a separate loop (independent of long polling), creates the XTR invoice, and delivers its URL to `/api/telegram/star-invoices/:orderId`. Both endpoints require the webhook secret, return no customer identities, and cannot credit balances. Only unexpired, unpaid orders without checkout are eligible; the first persisted URL wins. Failed deliveries are retried with the same order payload. The client polls the saved order until the link is available. Deploy backend **and restart the worker** to enable this path; a backend-only deployment leaves orders waiting. No live payment is part of the automated verification.

For webhook delivery, run the updated `npm run telegram:configure` against the intended bot after deploying the receiver. This also registers `/paysupport` and `/terms` in the command menu. The handlers work without menu registration. Native server polling now starts only after database initialization and uses the same payment handler.

## Verification

```sh
node --test server/roll-stars.test.js server/telegram-bot.test.js server/rolls.test.js
npm run test:ui
npm run build
npm run test:stars:production
npm run test:stars:visual
```

Database tests require the configured production PostgreSQL, with a working tunnel and Lockbox access when applicable. They create fixture accounts/orders and additive schema inside one outer transaction, then roll back every write. They never substitute another database. Their Telegram transport is a test double, so these checks never charge Stars or contact real customers. Visual tests use installed Chrome and save desktop/mobile screenshots in `exports/stars/`.

After deployment, a real purchase by the owner is still needed to verify Telegram's live checkout and the worker's delivery end to end. Check one 10-Star purchase, its unique charge ID, a +100 ledger entry, and the new balance. Do not label a simulated receipt or an invoice-created response as a live payment test.

References: [Stars flow](https://core.telegram.org/bots/payments-stars), [createInvoiceLink](https://core.telegram.org/bots/api#createinvoicelink), [openInvoice](https://core.telegram.org/bots/webapps#initializing-mini-apps).
