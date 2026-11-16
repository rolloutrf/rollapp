# Telegram Stars purchases

`Пополнить` opens packages of 100 / 500 / 1,000 rolls for 10 / 50 / 100 Stars. The user accepts the versioned purchase terms and pays from the Telegram identity linked to their Rollapp account. In Mini Apps the client uses `openInvoice`; in browsers it offers the invoice link. Support and `/paysupport` use the operational support contact loaded from PostgreSQL. `/terms` returns the purchase terms.

## Accounting and delivery

- `GET /api/rolls/stars`: availability, packages, terms, identity-link status.
- `POST /api/rolls/stars/orders`: `{ packageId, idempotencyKey, termsVersion }`. Prices, recipient and Telegram identity come from the server. A committed order survives invoice-provider failures and lost HTTP responses.
- `GET /api/rolls/stars/orders/by-request/:requestKey`: authenticated READ ONLY lookup of the original request. It returns `order: null` until the order is stored. The response includes the stored package and accepted terms version, uses private no-store caching, and makes no call to Telegram.
- `GET /api/rolls/stars/orders/:id`: owner-only payment status.
- `roll_star_orders`: order, fixed price, accepted terms version, invoice, checkout ID and unique `telegram_payment_charge_id`. This is also the immutable credit ledger for paid Stars purchases.
- `pre_checkout_query`: validates XTR, exact amount, bound Telegram account, expiry and unused checkout. A given order permits one checkout query (redelivery of the same query is safe). A cancelled checkout requires a new order; the original payment is still reconciled if Telegram later confirms it.
- `successful_payment`: locks the wallet and order, validates the receipt, and atomically credits rolls and stores the unique Telegram charge. Repeated updates do not credit again. An expired invoice or disabled sales does not discard a previously accepted payment. A database failure returns an error so delivery retries.
- The browser callback never credits rolls. It polls the authenticated API and refreshes the wallet after server confirmation.

No outbound messages are sent to support automatically. Customers contact support themselves. The existing store-order refund endpoint returns **rolls** and is not a Stars refund endpoint. Stars refunds are handled by the operator via Telegram's `refundStarPayment`; resolve roll accounting explicitly before issuing any refund. Automatic chargeback reconciliation and automatic Stars refunds are outside this purchase implementation.

## Recovering an invoice

The wallet keeps the package, accepted terms version and request UUID in the
current account’s tab before sending the request. After a network failure or
reload, «Открыть счёт Stars» opens the saved request, including when sales are
paused. «Найти счёт» reads by UUID and checks that both terms and package match.
It never opens Telegram. When there is no order yet and sales are available,
«Повторить создание счёта» sends the same request. A conflict keeps the original
request available until the user closes it. An existing direct invoice waiting
for a link can retry link generation on that same order. External workers still
deliver links through the existing queue and the browser reads their status.
Previously accepted payments still appear as credited while sales are paused.

## Runtime and rollout

Schema initialization adds `roll_star_orders` after the wallet tables. The change is additive. Never enable the new frontend before its backend schema and handlers are running.

`TELEGRAM_STARS_ENABLED=false` pauses new invoices and checkout approvals; successful payments still settle. `TELEGRAM_PAYMENT_SUPPORT_URL` explicitly overrides the database setting; otherwise the product bot is the generic fallback. The configured bot token remains in Lockbox. Invoice endpoints never expose it.

Both `message` and `pre_checkout_query` must be allowed updates. The repository's production deployment uses **external-polling**, so deploy the updated backend first, then restart the GitHub `Run Telegram bot` worker with the updated code. That worker reads both `bot_token` and `webhook_secret` from Lockbox, forwards payment updates to the authenticated Rollapp webhook, executes checkout answers returned by it, and advances its offset only after settlement is acknowledged. `/start`, `/terms`, and `/paysupport` are answered by the worker directly. Do not start a competing local poller for the same bot.

In external-polling mode the VM does **not** call Telegram to create invoices: its outbound Telegram connection can time out. The order endpoint commits and returns the pending order immediately. The same external worker checks `/api/telegram/star-invoices` every two seconds in a separate loop (independent of long polling), creates the XTR invoice, and delivers its URL to `/api/telegram/star-invoices/:orderId`. Both endpoints require the webhook secret, return no customer identities, and cannot credit balances. Only unexpired, unpaid orders without checkout are eligible; the first persisted URL wins. Failed deliveries are retried with the same order payload. The client polls the saved order until the link is available. Deploy backend **and restart the worker** to enable this path; a backend-only deployment leaves orders waiting. No live payment is part of the automated verification.

For webhook delivery, run the updated `npm run telegram:configure` against the intended bot after deploying the receiver. This also registers `/paysupport` and `/terms` in the command menu. The handlers work without menu registration. Native server polling now starts only after database initialization and uses the same payment handler.

## Verification

```sh
node --test server/modules/payments/roll-stars.test.js server/modules/runtime/telegram-bot.test.js server/modules/payments/rolls.test.js
npm run test:ui
npm run test:stars
npm run build
npm run test:stars:production
npm run test:stars:visual
```

Database tests require the configured production PostgreSQL and read the
existing schema. They check READ ONLY mode on a real transaction and roll back
every fixture account and order. Their Telegram transport is a test double, so
these checks never charge Stars or contact real customers. `test:stars` checks
the wallet and recovery on eight browser viewports and rejects real API calls.
`test:stars:visual` serves the built app in Chrome against the rollback-only API
and saves desktop and mobile screenshots in `exports/stars/`.

After deployment, a real purchase by the owner is still needed to verify Telegram's live checkout and the worker's delivery end to end. Check one 10-Star purchase, its unique charge ID, a +100 ledger entry, and the new balance. Do not label a simulated receipt or an invoice-created response as a live payment test.

References: [Stars flow](https://core.telegram.org/bots/payments-stars), [createInvoiceLink](https://core.telegram.org/bots/api#createinvoicelink), [openInvoice](https://core.telegram.org/bots/webapps#initializing-mini-apps).
