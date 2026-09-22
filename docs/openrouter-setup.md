# OpenRouter settings

## Shared marketplace search

Production marketplace AI search uses the `rollapp-openrouter` Lockbox secret
(`e6qkgbgcvu4727knndhq`, entry `api_key`) in folder `b1gebpfrhvkd43r38q98`.
The Rollapp runtime service account `ajers2ngi708sf3i1t4g` has
`lockbox.payloadViewer` on this secret only. Deletion protection is enabled.
The raw key is never stored in Compose or source files.

On 2026-09-21, the user approved storing the configured OpenRouter key in
Lockbox and enabling shared production search against its balance. The live VM
Compose metadata and repository deployment template now reference this secret.
The existing application image was preserved. Production `/api/healthz`
confirmed `capabilities.marketplaceAi: true` after the container reloaded.

### Remaining production access failure

The configured flag confirms key loading, not upstream availability. A real
search from the production container still failed on 2026-09-21. Both the
authenticated `/api/v1/key` endpoint and public `/api/v1/models` endpoint
returned HTTP 403 with this JSON response:

```json
{ "success": false, "error": "Access denied by security policy." }
```

The same key validates successfully from the development environment. This is
an upstream access block from the production server, rather than a missing key
or a model-specific error. Direct store search remains available. The
production VM's configured public IP is `51.250.110.17`; ask OpenRouter support
to identify and resolve the access block before considering AI search working.
Do not rotate the key or change models to conceal this failure.

Network diagnostics on 2026-09-21 found no HTTP/HTTPS/ALL proxy environment
variables in either runtime and no system HTTP proxy on the development Mac.
However, the Mac's route to `openrouter.ai` uses tunnel interface `utun4`.
Its public catalogue request returned 200 (Cloudflare ray
`a3e9231b9f2165d7-FRA`); the same unauthenticated request in the production
container returned 403 (ray `a3e922e329052682-ARN`). Thus the successful local
check uses a different network path. This supports a source/network access
policy issue but does not establish the exact rule causing the block.

Suggested support request (not sent):

> Our Rollapp server in Yandex Cloud, public IP 51.250.110.17, receives HTTP 403
> with `Access denied by security policy.` from both GET /api/v1/models and
> authenticated GET /api/v1/key, as well as completion requests. The same key
> validates from our development environment. Could you identify the policy
> blocking this server and advise whether access can be enabled? Observed on
> 2026-09-21. No API key is included in this request.

The shared model is `mistralai/mistral-small-2603`. Startup loads the key from
Lockbox before starting the API. When diagnosing disabled search, check both the
Compose secret reference and the runtime account's access to that secret.

## Personal keys

Users connect their own key in the profile drawer and select a compatible model
with the shadcn Combobox. Saving a key checks OpenRouter's read-only key endpoint
before encrypting and storing it. Changing the model does not require entering
the key again. Marketplace searches use the requesting user's key and model.

Keys and selected models live in `user_ai_credentials`, scoped by the stable
user ID and provider. They are independent of browser storage and login
sessions. Signing out deletes the session, not these settings. Model-only
updates preserve the encrypted key; failed key/model validation leaves the
previous row unchanged. Only the masked key hint is returned to the browser.

The profile keeps the saved model ID visible when the upstream catalogue is
unavailable, and it ignores responses from stale component loads. Saving the
main profile is blocked while the independent OpenRouter save is in flight.
HTTP 403 during key validation reports upstream access denial, not an invalid
key, and never erases the existing settings.

Changing credentials or loading the catalogue still requires OpenRouter access
from production. Personal keys cannot resolve the server access block described
above. A stable encryption secret is necessary but is not sufficient to make
those upstream requests work.

## Encryption configuration

The dedicated encryption secret has been created in Yandex Lockbox:

- Secret name: `rollapp-user-credentials`
- Secret ID: `e6qr4ur1fhbthc7ecujj`
- Folder: `b1gebpfrhvkd43r38q98`
- Payload entry: `encryption_secret`
- Deletion protection: enabled

Local development reads this secret through the existing Yandex CLI identity.
The ignored `.env.local` contains its ID and entry name only. The secret value
is never written to source files or returned to the browser.

## Production permission

On 2026-09-22, the owner approved and the runtime service account was granted
read access to this one encryption secret:

```sh
yc lockbox secret add-access-binding e6qr4ur1fhbthc7ecujj \
  --role lockbox.payloadViewer \
  --service-account-id ajers2ngi708sf3i1t4g
```

The binding was verified with `yc lockbox secret list-access-bindings`. It grants
no access to other secrets and no edit or delete permission. The production
Compose configuration now sets:

```yaml
YC_USER_CREDENTIALS_LOCKBOX_SECRET_ID: "e6qr4ur1fhbthc7ecujj"
YC_USER_CREDENTIALS_SECRET_KEY: "encryption_secret"
```

Startup loads the configured secret before starting the API. Keep this encryption
value stable; rotation requires migrating existing encrypted credentials.

## Verification

`npm run test:openrouter:production` uses the configured production PostgreSQL
database and rolls back every synthetic user, session and credential. Supply
the configured production tunnel environment when the database is private.
The real HTTP routes are tested with controlled upstream validation responses;
no paid model call is made. Coverage includes new login sessions, recreation of
the HTTP server with the same encryption secret, model-only updates, replacing
a key while preserving the model, account isolation, invalid input and outages.

The updated form was checked in a local browser against rollback-only production
fixtures: choosing and saving a model without entering a key, reloading the
form, and keeping the saved model visible during a catalogue outage, including
a narrow layout. These tests do not assert that the blocked production
OpenRouter connection works.

- The configured production PostgreSQL database has the additive `model` column.
- No personal key records were created or changed for verification.
- Targeted tests cover encryption, invalid keys, model validation, catalogue
  caching and recovery, personal/server fallback isolation, and the outgoing
  model and key. HTTP responses are stubbed in these pure unit tests; no test
  database or paid generation is used.
- The actual OpenRouter model catalogue loads in the authenticated profile.
- The profile form and Combobox were checked at 320, 390, and 1440 px, including
  keyboard selection and invalid-key format feedback.
- A real personal-key save and paid completion still require a user's key.
