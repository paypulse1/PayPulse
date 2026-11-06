# DRPAY

Vite marketing site and merchant workspace, with a server-side SwiftPay adapter.

## Render

Review `render.yaml` and create its Blueprint in Render. It defines separate production and sandbox static sites and Node APIs, plus isolated persistent PostgreSQL databases. Production services deploy from `Production`; sandbox services deploy from `Sandbox`. The APIs and databases use paid plans; review Render's current pricing before provisioning. Each site publishes `dist` and rewrites application routes to the client app. API health checks use `/readyz` and remain unavailable until the database is initialized.

## Railway production deployment

Deploy the `Production` branch from the repository root as a single Railway service. `railway.json` downloads the latest signed APK from the private GitHub release, installs the pinned pnpm version, runs the API check, typecheck, and Vite production build, then starts the API and serves the built frontend. Set `DRPAY_GITHUB_RELEASE_TOKEN` in Railway Variables to a fine-grained GitHub token with read-only Contents access to this repository. The build verifies the downloaded APK checksum before including it at `/drpay.apk`; the homepage download buttons use that public route. Its `/readyz` health check passes only after the required configuration is present and the database is initialized.

Attach a Railway PostgreSQL service and set `DATABASE_URL` using that service's connection string reference. Configure the API secrets listed below in Railway's Variables settings, including `DRPAY_FRONTEND_ORIGIN` for the deployed merchant site, `DRPAY_MERCHANT_EMAIL`, `DRPAY_SUPER_ADMIN_EMAIL`, `DRPAY_SUPER_ADMIN_PASSWORD`, `DRPAY_PASSWORD_SALT`, `DRPAY_JWT_SECRET`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL`. Set `DRPAY_LIVE_CHECKOUT_ORIGIN` and `DRPAY_PUBLIC_API_ORIGIN` to the corresponding public production URLs when they differ from their defaults.

To send super-admin transaction alerts through Telegram, create a bot with BotFather, send it `/start` from the super-admin's Telegram account, retrieve the private chat ID from the bot's `getUpdates` response, then configure `TELEGRAM_BOT_TOKEN` and that `TELEGRAM_CHAT_ID` on the API service. Keep the bot token server-side; never expose these settings in a `VITE_*` variable.

Live payment collection is enabled only when `SWIFTPAY_ENV=production`, `SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED=I_UNDERSTAND_REAL_MONEY`, and live `SWIFTPAY_ACCESS_KEY` and `SWIFTPAY_SECRET_KEY` values are set. Keep all secrets in Railway Variables; never add them to source control or any `VITE_*` variable. The service exits with an error when required configuration is missing, so Railway will not mark an incomplete production deployment healthy.

The Railway production service serves the API and Vite application together. Its live API URL is `https://drpay-merchant-production.up.railway.app`; the frontend uses this service URL rather than `api.live.denpay.cc`. Attach `merchant.denpay.cc` and `pay.live.denpay.cc` to this service and use the CNAME and TXT verification records Railway displays. Confirm DNS propagation and certificate issuance in Railway before directing production traffic.

### Merchant and checkout subdomains

On Render, production hostnames are served by `drpay-web` and sandbox hostnames by `drpay-sandbox-web`. During the Railway production cutover, `merchant.denpay.cc` and `pay.live.denpay.cc` are attached to the combined `drpay-merchant` service:

- `https://merchant.denpay.cc/` opens the marketing homepage; `https://merchant.denpay.cc/login` opens merchant sign-in and uses the production API at `https://drpay-merchant-production.up.railway.app`.
- `https://pay.live.denpay.cc/checkout/<code>` serves live self-hosted checkouts and uses the production API/database at `https://drpay-merchant-production.up.railway.app`.
- `https://merchant.sandbox.denpay.cc` opens sandbox merchant sign-in at `/login` and uses the sandbox API at `https://api.sandbox.denpay.cc`.
- `https://pay.sandbox.denpay.cc/checkout/<code>` serves sandbox self-hosted checkouts and uses the sandbox API/database at `https://api.sandbox.denpay.cc`.

After the Blueprint is deployed, add `merchant.denpay.cc` and `pay.live.denpay.cc` under `drpay-web` **Settings → Custom Domains**. Add `merchant.sandbox.denpay.cc` and `pay.sandbox.denpay.cc` under `drpay-sandbox-web`. Create the CNAME records using the targets Render displays, verify each domain, and wait for its TLS certificate to become active. Add `api.live.denpay.cc` to `drpay-live-api` and `api.sandbox.denpay.cc` to `drpay-api` as their respective custom domains and configure their matching DNS CNAME records. Do not point website hostnames at the API services.

The production and sandbox APIs each have their own database, merchant registrations, API keys, KYB records, webhook settings, transactions, and signing configuration. Create/configure merchant accounts in the environment where they will be used; sandbox records do not carry over to production. Set live SwiftPay credentials only on `drpay-live-api`, and sandbox credentials only on `drpay-api`. Each frontend build has its own default API origin and merchant sign-in URL; checkout hostnames continue to select their matching API.

Set these secrets directly in Render when prompted:

- `DRPAY_MERCHANT_EMAIL`: the first merchant email to seed into the account list.
- `DRPAY_SUPER_ADMIN_EMAIL` and `DRPAY_SUPER_ADMIN_PASSWORD`: separate credentials for the restricted operations console.
- `DRPAY_PASSWORD_SALT`: random salt with at least 32 characters for the operations account password.
- `DRPAY_JWT_SECRET`: random signing secret with at least 32 characters.
- `RESEND_API_KEY`: API key for sending first-device verification codes, customer payment requests, and payment confirmations through Resend.
- `RESEND_FROM_EMAIL`: sender address on a domain verified with Resend.
- `DRPAY_EMAIL_LOGO_URL` (optional): public HTTPS URL for the DRPAY logo shown in all outgoing email templates. Defaults to `https://merchant.denpay.cc/drpay-mark.png`.
- `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_EMAIL`, and `FCM_SERVICE_ACCOUNT_PRIVATE_KEY`: Firebase Cloud Messaging server credentials for Android transaction push alerts. Store the private key as a deployment secret; convert escaped `\n` sequences to newlines at runtime.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`: Telegram bot credentials and the super-admin chat destination for confirmed merchant payments, transfers, USDT deposits/withdrawals, and completed floating-balance payouts.
- `SWIFTPAY_ACCESS_KEY` and `SWIFTPAY_SECRET_KEY`: credentials for the selected SwiftPay environment.
- `TATUM_API_KEY`: server-only Tatum RPC credential. Configure only on `drpay-live-api`; never add it to any `VITE_*` variable.
- `TRONGRID_API_KEY`: optional TRON Grid API key for mainnet wallet/deposit requests on `drpay-live-api`; leave unset if not using a key.
- `TRON_USDT_NETWORK`: set to `mainnet` on `drpay-live-api`; the sandbox API blueprint sets it to `disabled`.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`: Cloudflare R2 S3-compatible credentials for private KYB documents. Grant the API service only the required bucket read/write permissions. Never make the bucket public or add these values to any `VITE_*` variable.
- GitHub Releases are private. The production static-site build downloads the latest signed APK into `public/drpay.apk` using `DRPAY_GITHUB_RELEASE_TOKEN`, a fine-grained GitHub token with read-only Contents access to this repository. Configure it as a secret on the `drpay-web` Render static site; the homepage then serves the APK from `/drpay.apk` without exposing the token. Each production site build picks up the latest release.
- The live API service requires production SwiftPay credentials and the explicit `SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED=I_UNDERSTAND_REAL_MONEY` acknowledgement. Keep live and sandbox credentials on their respective API services; do not reuse the sandbox database for production.

The API starts in `sandbox` mode. Verify the full flow against SwiftPay sandbox first. For live mode, explicitly set `SWIFTPAY_ENV=production`, add `SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED=I_UNDERSTAND_REAL_MONEY`, and use live credentials in the API service's Render secret environment. The API refuses to start in production mode without that explicit acknowledgement. Never put SwiftPay credentials in any `VITE_*` variable; Vite bundles those values into public browser code.

Merchant sign-in uses an email one-time code to verify a new device, then a four-digit MPIN for future sign-ins on that device. Every outgoing transfer also requires MPIN approval. Verification codes, customer payment requests, and payment confirmations are delivered by Resend; configure a verified sender address and API key in the Render API service environment. The merchant's device token is stored locally and only its SHA-256 hash is stored by the API. Operations-console access remains separate and password-protected.

On a previously verified device, the app remembers the last merchant email locally and opens directly to MPIN sign-in. Merchants can use configured biometrics instead, recover access through email verification, or switch to another account.

On Android devices with strong biometrics enrolled, merchants can optionally enable biometric sign-in after setting up their MPIN, or manage it in Profile → Security. The app stores a random device-bound key in Android's biometric-protected secure storage; the MPIN is never stored. Biometric sign-in is tied to the merchant's verified device and can be disabled from Security. Email device verification and MPIN sign-in remain available as fallbacks. Biometric sign-in is not available on web or for operations-console accounts.

## Floating-balance transfers

The DRPAY team sets each merchant's PHP floating balance in the operations console. Merchants may save a payout account once; only the DRPAY team can change it afterward. Merchants can submit transfer requests against available DRPAY-provided funds even before the collection unlock threshold is reached. Requests have Pending, Successful, or Failed status. Pending requests reserve their amount; marking a request Successful debits the balance and requires a bank payout reference, with an optional reconciliation note. Marking it Failed releases the reservation and requires a reason visible to the merchant. The team must arrange the payout manually outside the app and record its bank reference after confirming settlement; DRPAY does not initiate the payout. Payout request history is not displayed in the unsettled-funds panel. This floating balance is separate from the merchant's operational wallet ledger.

The DRPAY team can edit merchant business/display name, contact person, phone number, business address, payout account, and login email from Merchant accounts. Changing the login email updates related merchant records and requires the merchant to sign in again.

The DRPAY team configures a global percentage collection fee and fixed floating-balance transfer fee in Settings. Successful collections record the configured fee in the platform fee wallet but do not increase the merchant's floating balance. Every floating-balance transfer request reserves its fixed fee together with the requested payout; the fee is charged and credited to the platform fee wallet only when marked Successful. Failed requests release both reserved amounts. These are accounting-ledger entries; they do not move money within the shared SwiftPay account.

## Merchant operational wallet

Each merchant has a separate PHP operational ledger. A completed collection credits that merchant's collection amount after the recorded platform fee; a successful outgoing transfer debits that merchant's ledger. A successful collection refund reverses the merchant's net collection credit while retaining the platform fee. Pending and outcome-unknown transfers reserve the amount they would debit (the net collection credit for a refund), and the API rejects new transfers that exceed the merchant's available ledger balance. Reservations and balance checks are serialized per merchant to prevent concurrent requests from overspending.

The server backfills ledger entries for existing completed, merchant-attributed collections and transfers idempotently at startup. Transactions that cannot be attributed to a merchant are not assigned to any merchant. The underlying SwiftPay provider account may be pooled; its shared provider-wide balance is not returned or displayed as an individual merchant's balance. The separate DRPAY-funded floating balance is not included in this operational ledger.

## USDT mainnet wallet

The DRPAY team can assign one unique TRON mainnet address to each merchant from Merchant accounts. The merchant Wallet screen reads the assigned address's TRC20 USD₮ balance through the server-side Tatum Blockchain RPC Gateway. It uses the official Tether TRON contract `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` with 6 decimals. Configure `TATUM_API_KEY` and `TRON_USDT_NETWORK=mainnet` only on `drpay-live-api`; the sandbox service is configured with `TRON_USDT_NETWORK=disabled`. Keep the Tatum key in the Render API service's secret environment and never expose it through `VITE_*` or browser code. The API blueprint does not contain the secret value; add it in Render after obtaining it from Tatum. If the key is missing or mainnet is disabled, balance is reported unavailable rather than simulated.

USDT withdrawal submissions are requests to Super Admin, not on-chain transactions initiated by the merchant app. Merchants enter a TRON destination, an amount of at least 20 USDT, and their MPIN; there is no configured maximum request amount. The API validates the MPIN and minimum amount. Super Admin reviews requests in the Requests section, manually sends approved payouts outside DRPAY, and records the TRON transaction ID, or rejects the request with a reason visible to the merchant. DRPAY does not hold merchant private keys or automatically send funds.

This mainnet integration queries real asset holdings. The DRPAY team must provision the address securely outside DRPAY, confirm that it belongs to the intended merchant, and assign it to that merchant. Existing Shasta addresses stay marked as testnet and are not queried on mainnet until a team member deliberately reassigns/confirms them. Address assignments are not proof of ownership. The wallet shows up to 50 confirmed incoming TRC20 transfers for the official USDT contract using the TRON Grid transaction API; optionally configure `TRONGRID_API_KEY` on the API service to use an authenticated provider quota. Deposit history is monitoring only and is not a custody record or proof of ownership. The integration does not create or custody keys, support buy/sell, or provide fiat settlement. Verify the address and network carefully before sharing it; transactions to the wrong address/network may be irreversible.

Unsettled-funds progress is calculated from the merchant's own completed KRW collections and remaining available operational ledger balance, rather than the common SwiftPay account balance.

The merchant dashboard displays a seven-day chart of this merchant's posted collection credits and transfer debits. It refreshes its merchant-scoped ledger aggregates every 10 seconds without reconciling or fetching the full transaction history.

Merchants can hide or show balances using the dashboard or wallet visibility control. The preference is saved locally for that merchant account and remains in effect across app restarts and sign-outs on the same device.

Profile → Help center provides guided checks for payment status, pending transfers, ledger balances, and device sign-in. Its support email draft includes the merchant email and prompts for a transaction reference and status; it warns users not to send their MPIN, one-time code, or full bank account details.

## Transaction notifications

Confirmed successful incoming QR payments and outgoing transfers can be emailed to the merchant account that created the transaction, using the existing Resend sender configuration. Merchants can toggle email/push channels and successful payment/transfer event types in Profile → Notifications. Disabled events are not delivered. The API reconciles pending transactions and retries queued email delivery.

The merchant app also keeps successful payment and transfer alerts in a server-backed inbox, regardless of email or push preferences. Unread state is synchronized across signed-in devices, and merchants can mark individual alerts or the entire inbox as read. Inbox endpoints require a merchant session and are not available to API keys.

If a checkout includes a customer email, DRPAY sends the checkout request and a separate success notice. SwiftPay-confirmed payments use `EXECUTED`; when a DRPAY team member has independently verified a payment, the Payments page can record it as `MANUALLY_PAID` and send the customer a confirmation that clearly identifies it as independently verified. The team member must provide a 10–500 character verification note, retained with their identity and the confirmation timestamp. A manual confirmation does not cancel the underlying SwiftPay QR or increase the SwiftPay account balance, so verify the incoming funds and avoid duplicate payment before confirming. If manually confirmed before the request email is sent, DRPAY skips the now-obsolete checkout request and sends only the success notice.

Android push alerts use Capacitor Push Notifications and Firebase Cloud Messaging. Create a Firebase Android app with package ID `ph.drpays.merchant`, place its `google-services.json` in `android/app/`, and configure `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_EMAIL`, and `FCM_SERVICE_ACCOUNT_PRIVATE_KEY` on both `drpay-api` and `drpay-live-api` in Render. These credentials are declared as unsynced environment variables in `render.yaml`; set their values in the Render dashboard. Grant the service account permission to send Firebase Cloud Messaging messages. After signing in, the app requests notification permission and registers the device token with the API. Rebuild and reinstall the Android app after adding Firebase client configuration. Push delivery requires Firebase client/server configuration, device permission, and enabled merchant preferences; email notifications operate independently.

## Payment behavior

Merchant collection creates a self-hosted DRPAY checkout page with its own design, payment QR, and live status updates. The result includes a shareable payment URL and QR; merchants can copy or share the URL with customers. Production links use `pay.live.denpay.cc`, while sandbox links use `pay.sandbox.denpay.cc`. The customer-facing checkout is served by the DRPAY frontend, while its status and QR requests go to the matching environment API.

The API submits InstaPay/PESONet disbursements using SwiftPay's HTTP Basic-authenticated `POST /api/disbursements/send` endpoint, with a unique `merchantReferenceNo`; accepted transfers remain pending until SwiftPay reports a terminal status. InstaPay is limited to PHP 50,000 per transfer, and transfer remarks are required and limited to 80 characters. Provider validation errors are returned to the merchant instead of being mislabeled as gateway failures. Payment and payout records are stored in PostgreSQL. The server never accepts card data.

The current implementation uses provider polling for reconciliation. It does not claim or depend on an unverified webhook signature format. A payment link timeout is recorded as an unknown outcome and must be reconciled before a new request is attempted.

Merchants can refund eligible completed QR Ph collections from Wallet activity. The refund is a full InstaPay/PESONET transfer to the payer details returned by SwiftPay and must be confirmed with the merchant MPIN. A collection cannot be refunded again while a transfer is pending or after it succeeds; failed transfers may be retried. The merchant's net collection credit is reversed only after SwiftPay confirms the refund transfer, while the original platform fee is retained.

Wallet activity supports date-range filtering, merchant-side search, incremental loading, and filtered CSV export. The export includes gross transaction amount, merchant-ledger impact, and the recorded collection fee, and is protected against spreadsheet formula injection. Profile → Statements exports the full merchant activity history, up to 100,000 records per download.

## Local API configuration

Start the API with `pnpm start:api` after setting the server environment variables above and a PostgreSQL `DATABASE_URL`. Keep the API credentials out of source control and local `.env` files that may be shared.

## KYB, merchant API keys, and webhooks

Merchants submit legal business and beneficial-owner details in Profile → KYB verification, then upload a registration certificate and both sides of the owner's identity document (PDF, JPEG, or PNG; up to 10 MB each). Proof of business address can also be uploaded. The operations console → KYB page provides review, approval, rejection notes, and short-lived private document download links. Approval requires the business registration certificate and both identity sides. KYB metadata is stored in PostgreSQL; document contents are stored in a private Cloudflare R2 bucket. Without the four `R2_*` variables, document upload and review downloads return an explicit service-unavailable error.

Create a Cloudflare R2 bucket and an S3 API token scoped to that bucket. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` on the API service. Configure bucket CORS to permit `PUT` from the exact merchant web origin (and `capacitor://localhost` for the Android app), allow `Content-Type` and `x-amz-meta-document-id` request headers, and expose the `ETag` response header. Keep the bucket private: uploads use five-minute presigned URLs and review downloads use one-minute signed URLs. The API verifies a server-issued upload reservation, object size and content type, document-id metadata, and the PDF/JPEG/PNG file signature before accepting the file.

Merchants can create and revoke up to 10 active API keys in Profile → Developer hub → API access. Keys are shown once, stored in PostgreSQL only as SHA-256 hashes, and scoped to `read` (wallet, activity, institution lists, internal wallet, and owned payment-link status) and/or `payments:write` (hosted payment-link creation). Each write request must include a unique `Idempotency-Key`. API keys cannot submit disbursements or manage accounts, and are limited to 120 requests per minute per key. Send keys only from trusted servers using `Authorization: Bearer <API_KEY>` over HTTPS.

Webhook settings accept public HTTPS endpoints and optional callback URLs. DRPAY emits `payment.succeeded`, `payment.failed`, `disbursement.succeeded`, and `disbursement.failed` events, signed in the `DRPAY-Signature: sha256=<hex>` header using HMAC-SHA256 over the exact raw JSON body. Each event includes a unique `id`; consumers should deduplicate using that id. Non-2xx/timeout deliveries retry with exponential backoff, up to eight attempts. Profile → Developer hub → API access displays the latest 50 webhook deliveries, last attempt and error, and permits manually queueing an exhausted undelivered event. Saving webhook settings rotates the signing secret, which is returned only once. These management endpoints require a signed-in merchant session; merchant API keys cannot manage webhooks. Requests are pinned to validated public IPv4 or IPv6 addresses and redirects/private destinations are not followed.

Super Admin account enablement permits sign-in and collections but does not activate the other merchant services. Full service activation requires the one-time PHP activation fee to be debited from the merchant wallet and credited to Super Admin, followed by a minimum 100 USDT balance added above the starting balance recorded when Super Admin assigns the TRON address. Pre-existing funds do not count toward the milestone. If the assigned address changes, its baseline and deposit-history start date reset. Transfers, API-key creation, and webhook setup remain unavailable until both requirements are met; merchant sign-in and collections remain available. The separate API integration email, with the environment-specific PDF and Postman collection, is sent after full activation. It never contains an API key. Merchants create their own environment-specific keys in Profile → Developer hub → API access; each key is shown once and must be stored server-side.

The full endpoint examples are available in [the Postman collection](./public/postman/DRPAY-Merchant-API.postman_collection.json), in the activation-email PDF, and in Profile → Developer hub → Integration guide. Set Postman's `baseUrl` to the API URL in the merchant's activation email/API guide, then set `apiKey` to a key generated by that merchant in the same environment. The app's API base is configured by `VITE_DRPAY_BACKEND_URL`. Do not put production keys in exported collections or browser applications.

Supported merchant-key API routes:

| Method | Route | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/wallet/balance` | `read` | This merchant's posted ledger balance, available balance after pending-transfer reservations, and payment environment |
| `GET` | `/v1/wallet/activity?limit=50&offset=0` | `read` | This merchant's activity and per-transaction wallet ledger impact; `limit` is 1–100 |
| `GET` | `/v1/crypto/usdt-deposits` | `read` | Latest 50 confirmed incoming transfers since the assigned address's activation start date |
| `GET` | `/v1/internal-wallet` | `read` | PHP ledger and available balance |
| `GET` | `/v1/crypto/usdt-wallet` | `read` | Assigned TRON mainnet address, current/qualifying balance, activation milestones, and official TRC20 USD₮ balance via Tatum |
| `GET` | `/v1/payment-institutions` | `read` | Supported collection institutions; includes `deepLink` when SwiftPay supplies a safe app link |
| `GET` | `/v1/disbursement-institutions` | `read` | Supported transfer institutions |
| `POST` | `/v1/payment-links` | `payments:write` | Create a hosted QR Ph checkout; requires `Idempotency-Key` |
| `GET` | `/v1/payment-links/:code` | `read` | Refresh the status of an owned checkout |

Payment-link JSON uses `amount` (positive PHP amount, up to two decimal places), `currency` (`PHP`), and `description` (required, up to 100 characters). A successful creation returns `id`, `code`, `paymentUrl`, `qrCode`, `qrImageUrl`, `status`, `amount`, and `currency`. A timed-out/ambiguous create returns `503`; check wallet activity and reconcile before retrying with a new idempotency key. Typical errors include `400` invalid input, `401` invalid/expired session or key, `403` missing key scope, `404` unknown merchant resource, `409` idempotency, state, or insufficient-wallet-balance conflict, `429` rate limit, and `503` temporary provider/storage failure. Error responses use `{"error":"..."}`.

Webhook bodies have the shape `{"id":"<event-id>","type":"payment.succeeded","createdAt":"<ISO-8601>","data":{"id":"<resource-id>","reference":"<merchant-reference>","amount":125.5,"currency":"PHP","status":"EXECUTED"}}`. Validate the lowercase hexadecimal HMAC in `DRPAY-Signature` using a constant-time comparison against the signature of the exact raw bytes; do not parse and re-serialize the JSON before checking it. A successful payment status is `EXECUTED`; a successful disbursement may use `EXECUTED`, `SUCCESS`, or `COMPLETED`.

## Validation

Run `pnpm test` for the Vite-aware unit tests covering session storage, payment settlement, ledger reversals, floating-balance reservation, and authorization boundaries. Run `pnpm typecheck`, `pnpm check:api`, and `pnpm build` before deploying.

## Android release

The Android wrapper is generated with Capacitor. Android Studio plus Android SDK build tools are required for local APK builds. A signed release is prepared by `.github/workflows/android-release.yml` when a tag matching `android-vMAJOR.MINOR.PATCH` is pushed (for example, `android-v1.0.26`). The release version is taken from the tag and converted to an increasing Android version code. GitHub Actions uses these repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The workflow publishes `drpay.apk` to the GitHub Release; Render fetches the latest APK using its read-only `DRPAY_GITHUB_RELEASE_TOKEN` secret. Railway also fetches the latest release APK during a source build, so deploy the production source again after the release workflow publishes to refresh `/drpay.apk`. Never commit the keystore or GitHub token; keep them in their respective deployment secret stores.
