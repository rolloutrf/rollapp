# Personal OpenRouter settings

Users connect their own key in the profile drawer and select a compatible model
with the shadcn Combobox. Saving a key checks OpenRouter's read-only key endpoint
before encrypting and storing it. Changing the model does not require entering
the key again. Marketplace searches use the requesting user's key and model.

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

## Pending production permission

The following permission change was rejected by automatic approval review and
has **not** been applied. It requires explicit approval for this recipient and
resource before execution:

```sh
yc lockbox secret add-access-binding e6qr4ur1fhbthc7ecujj \
  --role lockbox.payloadViewer \
  --service-account-id ajers2ngi708sf3i1t4g
```

This grants the existing Rollapp runtime service account read access to this
single encryption secret. It grants no access to other secrets and no edit or
delete permission. After approval and verification, the production Compose
configuration can set:

```yaml
YC_USER_CREDENTIALS_LOCKBOX_SECRET_ID: "e6qr4ur1fhbthc7ecujj"
YC_USER_CREDENTIALS_SECRET_KEY: "encryption_secret"
```

The production template is intentionally unchanged until runtime access exists:
startup loads the configured secret before starting the API. The feature has not
been deployed by this task. Keep this encryption value stable; rotation requires
migrating existing encrypted credentials.

## Verification

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
