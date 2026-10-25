# DRPAY

Vite marketing site and merchant workspace, with a server-side SwiftPay adapter.

## Render

Review `render.yaml` and create its Blueprint in Render. It defines a static site, separate sandbox and live Node APIs, and isolated persistent PostgreSQL databases in Oregon. The APIs and databases use paid plans; review Render's current pricing before provisioning. The site publishes `dist` and rewrites application routes to the client app.

### Merchant and checkout subdomains

All three hostnames are served by the same `drpay-web` static site, with the API selected by hostname:

- `https://merchant.denpay.cc` opens merchant sign-in and uses the live API.
- `https://pay.live.denpay.cc/checkout/<code>` serves live self-hosted checkouts and uses the live API/database.
- `https://pay.sandbox.denpay.cc/checkout/<code>` serves sandbox self-hosted checkouts and uses the sandbox API/database.

After the Blueprint is deployed, add `merchant.denpay.cc`, `pay.live.denpay.cc`, and `pay.sandbox.denpay.cc` under the `drpay-web` service's **Settings → Custom Domains** in Render. For each hostname, create the CNAME record Render displays at your DNS provider (the target is the `drpay-web.onrender.com` service hostname), then verify the domain in Render and wait for its TLS certificate to become active. Do not point these hostnames to the API services. The API services are reached through their separate API origins.

The production API and sandbox API each have their own database, merchant registrations, API keys, KYB records, webhook settings, transactions, and signing configuration. Create/configure merchant accounts in the environment where they will be used; sandbox records do not carry over to production. Set the live SwiftPay credentials only on `drpay-live-api`, and sandbox credentials only on `drpay-api`. The frontend's hostname routing uses the corresponding API origins configured in `VITE_DRPAY_LIVE_BACKEND_URL` and `VITE_DRPAY_SANDBOX_BACKEND_URL`.

Set these secrets directly in Render when prompted:

- `DRPAY_MERCHANT_EMAIL`: the first merchant email to seed into the account list.
- `DRPAY_SUPER_ADMIN_EMAIL` and `DRPAY_SUPER_ADMIN_PASSWORD`: separate credentials for the restricted admin console.
- `DRPAY_PASSWORD_SALT`: random salt with at least 32 characters for the super-admin password.
- `DRPAY_JWT_SECRET`: random signing secret with at least 32 characters.
- `RESEND_API_KEY`: API key for sending first-device verification codes through Resend.
- `RESEND_FROM_EMAIL`: sender address on a domain verified with Resend.
- `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_EMAIL`, and `FCM_SERVICE_ACCOUNT_PRIVATE_KEY`: Firebase Cloud Messaging server credentials for Android transaction push alerts. Store the private key as a deployment secret; convert escaped `\n` sequences to newlines at runtime.
- `SWIFTPAY_ACCESS_KEY` and `SWIFTPAY_SECRET_KEY`: credentials for the selected SwiftPay environment.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`: Cloudflare R2 S3-compatible credentials for private KYB documents. Grant the API service only the required bucket read/write permissions. Never make the bucket public or add these values to any `VITE_*` variable.
- `VITE_ANDROID_APK_URL`: URL of the signed Android APK artifact. The Android wrapper and release workflow are included, but the link stays disabled until CI publishes the first signed release.
- The live API service requires production SwiftPay credentials and the explicit `SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED=I_UNDERSTAND_REAL_MONEY` acknowledgement. Keep live and sandbox credentials on their respective API services; do not reuse the sandbox database for production.

The API starts in `sandbox` mode. Verify the full flow against SwiftPay sandbox first. For live mode, explicitly set `SWIFTPAY_ENV=production`, add `SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED=I_UNDERSTAND_REAL_MONEY`, and use live credentials in the API service's Render secret environment. The API refuses to start in production mode without that explicit acknowledgement. Never put SwiftPay credentials in any `VITE_*` variable; Vite bundles those values into public browser code.

Merchant sign-in uses an email one-time code to verify a new device, then a four-digit MPIN for future sign-ins on that device. Every outgoing transfer also requires MPIN approval. Verification codes are delivered by Resend; configure a verified sender address and API key in the Render API service environment. The merchant's device token is stored locally and only its SHA-256 hash is stored by the API. Super-admin access remains separate and password-protected.

On a previously verified device, the app remembers the last merchant email locally and opens directly to MPIN sign-in. Merchants can use configured biometrics instead, recover access through email verification, or switch to another account.

On Android devices with strong biometrics enrolled, merchants can optionally enable biometric sign-in after setting up their MPIN, or manage it in Profile → Security. The app stores a random device-bound key in Android's biometric-protected secure storage; the MPIN is never stored. Biometric sign-in is tied to the merchant's verified device and can be disabled from Security. Email device verification and MPIN sign-in remain available as fallbacks. Biometric sign-in is not available on web or for super-admin accounts.

## Floating-balance transfers

Super admins set each merchant's PHP floating balance in the admin console. Merchants may save a payout account once; only a super admin can change it afterward. Merchants can submit transfer requests against available admin-set funds even before the collection unlock threshold is reached. Requests have Pending, Successful, or Failed status. Pending requests reserve their amount; marking a request Successful debits the balance, while marking it Failed releases the reservation and requires a reason that is shown to the merchant. Successful status does not initiate a provider payout: the super admin must arrange the payout manually outside the app. This floating balance is separate from the merchant's operational wallet ledger.

Super admins can edit merchant business/display name, contact person, phone number, business address, payout account, and login email from Merchant accounts. Changing the login email updates related merchant records and requires the merchant to sign in again.

Super admins configure a global percentage collection fee and fixed floating-balance transfer fee in Settings. Successful collections record the configured fee in the super-admin fee wallet but do not increase the merchant's floating balance. Every floating-balance transfer request reserves its fixed fee together with the requested payout; the fee is charged and credited to the super-admin fee wallet only when marked Successful. Failed requests release both reserved amounts. These are accounting-ledger entries; they do not move money within the shared SwiftPay account.

## Merchant operational wallet

Each merchant has a separate PHP operational ledger. A completed collection credits that merchant's collection amount after the recorded platform fee; a successful outgoing transfer debits that merchant's ledger. A successful collection refund reverses the merchant's net collection credit while retaining the platform fee. Pending and outcome-unknown transfers reserve the amount they would debit (the net collection credit for a refund), and the API rejects new transfers that exceed the merchant's available ledger balance. Reservations and balance checks are serialized per merchant to prevent concurrent requests from overspending.

The server backfills ledger entries for existing completed, merchant-attributed collections and transfers idempotently at startup. Transactions that cannot be attributed to a merchant are not assigned to any merchant. The underlying SwiftPay provider account may be pooled; its shared provider-wide balance is not returned or displayed as an individual merchant's balance. The separate admin-funded floating balance is not included in this operational ledger.

Unsettled-funds progress is calculated from the merchant's own completed KRW collections and remaining available operational ledger balance, rather than the common SwiftPay account balance.

The merchant dashboard displays a seven-day chart of this merchant's posted collection credits and transfer debits. It refreshes its merchant-scoped ledger aggregates every 10 seconds without reconciling or fetching the full transaction history.

Merchants can hide or show balances using the dashboard or wallet visibility control. The preference is saved locally for that merchant account and remains in effect across app restarts and sign-outs on the same device.

## Transaction notifications

Confirmed successful incoming QR payments and outgoing transfers are emailed to the merchant account that created the transaction, using the existing Resend sender configuration. The API reconciles pending transactions and retries queued email delivery.

If a checkout includes a customer email, DRPAY sends the checkout request and a separate success notice. SwiftPay-confirmed payments use `EXECUTED`; when an admin has independently verified a payment, the Payments page can record it as `MANUALLY_PAID` and send the customer a confirmation that clearly identifies it as merchant-verified. Admins must provide a 10–500 character verification note, retained with their identity and the confirmation timestamp. A manual confirmation does not cancel the underlying SwiftPay QR or increase the SwiftPay account balance, so verify the incoming funds and avoid duplicate payment before confirming. If manually confirmed before the request email is sent, DRPAY skips the now-obsolete checkout request and sends only the success notice.

Android push alerts use Capacitor Push Notifications and Firebase Cloud Messaging. Create a Firebase Android app with package ID `ph.drpays.merchant`, place its `google-services.json` in `android/app/`, and configure `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_EMAIL`, and `FCM_SERVICE_ACCOUNT_PRIVATE_KEY` on the API service. Grant the service account permission to send Firebase Cloud Messaging messages. After signing in, the app requests notification permission and registers the device token with the API. Rebuild and reinstall the Android app after adding Firebase configuration. Push delivery remains disabled until the Firebase client and server configuration are both present; email notifications continue independently.

## Payment behavior

Merchant collection creates a self-hosted DRPAY checkout page with its own design, payment QR, and live status updates. The result includes a shareable payment URL and QR; merchants can copy or share the URL with customers. Production links use `pay.live.denpay.cc`, while sandbox links use `pay.sandbox.denpay.cc`. The customer-facing checkout is served by the DRPAY frontend, while its status and QR requests go to the matching environment API.

The API submits InstaPay/PESONet disbursements using SwiftPay's HTTP Basic-authenticated `POST /api/disbursements/send` endpoint, with a unique `merchantReferenceNo`; accepted transfers remain pending until SwiftPay reports a terminal status. InstaPay is limited to PHP 50,000 per transfer, and transfer remarks are required and limited to 80 characters. Provider validation errors are returned to the merchant instead of being mislabeled as gateway failures. Payment and payout records are stored in PostgreSQL. The server never accepts card data.

The current implementation uses provider polling for reconciliation. It does not claim or depend on an unverified webhook signature format. A payment link timeout is recorded as an unknown outcome and must be reconciled before a new request is attempted.

Merchants can refund eligible completed QR Ph collections from Wallet activity. The refund is a full InstaPay/PESONET transfer to the payer details returned by SwiftPay and must be confirmed with the merchant MPIN. A collection cannot be refunded again while a transfer is pending or after it succeeds; failed transfers may be retried. The merchant's net collection credit is reversed only after SwiftPay confirms the refund transfer, while the original platform fee is retained.

## Local API configuration

Start the API with `pnpm start:api` after setting the server environment variables above and a PostgreSQL `DATABASE_URL`. Keep the API credentials out of source control and local `.env` files that may be shared.

## KYB, merchant API keys, and webhooks

Merchants submit legal business and beneficial-owner details in Profile → KYB verification, then upload a registration certificate and both sides of the owner's identity document (PDF, JPEG, or PNG; up to 10 MB each). Proof of business address can also be uploaded. The super-admin console → KYB page provides review, approval, rejection notes, and short-lived private document download links. Approval requires the business registration certificate and both identity sides. KYB metadata is stored in PostgreSQL; document contents are stored in a private Cloudflare R2 bucket. Without the four `R2_*` variables, document upload and review downloads return an explicit service-unavailable error.

Create a Cloudflare R2 bucket and an S3 API token scoped to that bucket. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` on the API service. Configure bucket CORS to permit `PUT` from the exact merchant web origin (and `capacitor://localhost` for the Android app), with `Content-Type` as an allowed request header and `ETag` as an exposed response header. Keep the bucket private: uploads use five-minute presigned URLs and review downloads use one-minute signed URLs. The API verifies a server-issued upload reservation, object size and content type, document-id metadata, and the PDF/JPEG/PNG file signature before accepting the file.

Merchants can create and revoke up to 10 active API keys in Profile → Developer settings. Keys are shown once, stored in PostgreSQL only as SHA-256 hashes, and scoped to `read` (wallet, activity, institution lists, internal wallet, and owned payment-link status) and/or `payments:write` (hosted payment-link creation). Each write request must include a unique `Idempotency-Key`. API keys cannot submit disbursements or administer accounts, and are limited to 120 requests per minute per key. Send keys only from trusted servers using `Authorization: Bearer <API_KEY>` over HTTPS.

Webhook settings accept public HTTPS endpoints and optional callback URLs. DRPAY emits `payment.succeeded`, `payment.failed`, `disbursement.succeeded`, and `disbursement.failed` events, signed in the `DRPAY-Signature: sha256=<hex>` header using HMAC-SHA256 over the exact raw JSON body. Each event includes a unique `id`; consumers should deduplicate using that id. Non-2xx/timeout deliveries retry with exponential backoff, up to eight attempts. Saving webhook settings rotates the signing secret, which is returned only once. Requests are pinned to validated public IPv4 or IPv6 addresses and redirects/private destinations are not followed.

The full endpoint examples are available in [the Postman collection](./public/postman/DRPAY-Merchant-API.postman_collection.json) and in Profile → API documentation. The API base URL is the configured `VITE_DRPAY_BACKEND_URL`; for Postman, set `baseUrl` to that API origin and `apiKey` to a newly generated merchant key. Do not put production keys in exported collections or browser applications.

Supported merchant-key API routes:

| Method | Route | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/wallet/balance` | `read` | This merchant's posted ledger balance, available balance after pending-transfer reservations, and payment environment |
| `GET` | `/v1/wallet/activity?limit=50&offset=0` | `read` | This merchant's activity and per-transaction wallet ledger impact; `limit` is 1–100 |
| `GET` | `/v1/internal-wallet` | `read` | PHP ledger and available balance |
| `GET` | `/v1/payment-institutions` | `read` | Supported collection institutions |
| `GET` | `/v1/disbursement-institutions` | `read` | Supported transfer institutions |
| `POST` | `/v1/payment-links` | `payments:write` | Create a hosted QR Ph checkout; requires `Idempotency-Key` |
| `GET` | `/v1/payment-links/:code` | `read` | Refresh the status of an owned checkout |

Payment-link JSON uses `amount` (positive PHP amount, up to two decimal places), `currency` (`PHP`), and `description` (required, up to 100 characters). A successful creation returns `id`, `code`, `paymentUrl`, `qrCode`, `qrImageUrl`, `status`, `amount`, and `currency`. A timed-out/ambiguous create returns `503`; check wallet activity and reconcile before retrying with a new idempotency key. Typical errors include `400` invalid input, `401` invalid/expired session or key, `403` missing key scope, `404` unknown merchant resource, `409` idempotency, state, or insufficient-wallet-balance conflict, `429` rate limit, and `503` temporary provider/storage failure. Error responses use `{"error":"..."}`.

Webhook bodies have the shape `{"id":"<event-id>","type":"payment.succeeded","createdAt":"<ISO-8601>","data":{"id":"<resource-id>","reference":"<merchant-reference>","amount":125.5,"currency":"PHP","status":"EXECUTED"}}`. Validate the lowercase hexadecimal HMAC in `DRPAY-Signature` using a constant-time comparison against the signature of the exact raw bytes; do not parse and re-serialize the JSON before checking it. A successful payment status is `EXECUTED`; a successful disbursement may use `EXECUTED`, `SUCCESS`, or `COMPLETED`.

## Android release

The Android wrapper is generated with Capacitor. Android Studio plus Android SDK build tools are required for local APK builds. A signed release is prepared by `.github/workflows/android-release.yml` when a tag matching `android-vMAJOR.MINOR.PATCH` is pushed (for example, `android-v1.0.26`). The release version is taken from the tag and converted to an increasing Android version code. GitHub Actions uses these repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The workflow publishes `drpay.apk` to the GitHub Release, and the marketing homepage links to the latest release. Never commit the keystore; keep a secure backup of the signing key and its passwords.
