# DRPAY

Vite marketing site and merchant workspace, with a server-side SwiftPay adapter.

## Render

Review `render.yaml` and create its Blueprint in Render. It defines a static site, an always-on Node API, and persistent PostgreSQL in Oregon. The API and database use paid plans; review Render's current pricing before provisioning. The site publishes `dist` and rewrites `/app` routes to the client app.

Set these secrets directly in Render when prompted:

- `DRPAY_MERCHANT_EMAIL`: the first merchant email to seed into the account list.
- `DRPAY_SUPER_ADMIN_EMAIL` and `DRPAY_SUPER_ADMIN_PASSWORD`: separate credentials for the restricted admin console.
- `DRPAY_PASSWORD_SALT`: random salt with at least 32 characters for the super-admin password.
- `DRPAY_JWT_SECRET`: random signing secret with at least 32 characters.
- `RESEND_API_KEY`: API key for sending first-device verification codes through Resend.
- `RESEND_FROM_EMAIL`: sender address on a domain verified with Resend.
- `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_EMAIL`, and `FCM_SERVICE_ACCOUNT_PRIVATE_KEY`: Firebase Cloud Messaging server credentials for Android transaction push alerts. Store the private key as a deployment secret; convert escaped `\n` sequences to newlines at runtime.
- `SWIFTPAY_ACCESS_KEY` and `SWIFTPAY_SECRET_KEY`: credentials for the selected SwiftPay environment.
- `VITE_ANDROID_APK_URL`: URL of the signed Android APK artifact. The Android wrapper and release workflow are included, but the link stays disabled until CI publishes the first signed release.

The API starts in `sandbox` mode. Verify the full flow against SwiftPay sandbox first. For live mode, explicitly set `SWIFTPAY_ENV=production`, add `SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED=I_UNDERSTAND_REAL_MONEY`, and use live credentials in the API service's Render secret environment. The API refuses to start in production mode without that explicit acknowledgement. Never put SwiftPay credentials in any `VITE_*` variable; Vite bundles those values into public browser code.

Merchant sign-in uses an email one-time code to verify a new device, then a four-digit MPIN for future sign-ins on that device. Every outgoing transfer also requires MPIN approval. Verification codes are delivered by Resend; configure a verified sender address and API key in the Render API service environment. The merchant's device token is stored locally and only its SHA-256 hash is stored by the API. Super-admin access remains separate and password-protected.

On a previously verified device, the app remembers the last merchant email locally and opens directly to MPIN sign-in. Merchants can use configured biometrics instead, recover access through email verification, or switch to another account.

On Android devices with strong biometrics enrolled, merchants can optionally enable biometric sign-in after setting up their MPIN, or manage it in Profile → Security. The app stores a random device-bound key in Android's biometric-protected secure storage; the MPIN is never stored. Biometric sign-in is tied to the merchant's verified device and can be disabled from Security. Email device verification and MPIN sign-in remain available as fallbacks. Biometric sign-in is not available on web or for super-admin accounts.

## Floating-balance transfers

Super admins set each merchant's PHP floating balance in the admin console. Merchants may save a payout account once; only a super admin can change it afterward. Merchants can submit transfer requests against available admin-set funds even before the collection unlock threshold is reached. Requests have Pending, Successful, or Failed status. Pending requests reserve their amount; marking a request Successful debits the balance, while marking it Failed releases the reservation and requires a reason that is shown to the merchant. Successful status does not initiate a provider payout: the super admin must arrange the payout manually outside the app. This floating balance is separate from the merchant's SwiftPay available balance.

Super admins can edit merchant business/display name, contact person, phone number, business address, payout account, and login email from Merchant accounts. Changing the login email updates related merchant records and requires the merchant to sign in again.

Super admins configure a global percentage collection fee and fixed floating-balance transfer fee in Settings. Successful collections record the configured fee in the super-admin fee wallet but do not increase the merchant's floating balance. Every transfer request reserves its fixed fee together with the requested payout; the fee is charged and credited to the super-admin fee wallet only when marked Successful. Failed requests release both reserved amounts. These are accounting-ledger entries; they do not move money within the shared SwiftPay account.

Unsettled-funds progress is shared across all merchants using the common SwiftPay wallet. Successful outgoing transfers and settled payout requests reduce that progress by their PHP amount converted to its KRW equivalent.

The merchant dashboard displays a seven-day chart of successful collections and transfers. It refreshes its merchant-scoped aggregate data every 10 seconds without reconciling or fetching the full transaction history.

Merchants can hide or show balances using the dashboard or wallet visibility control. The preference is saved locally for that merchant account and remains in effect across app restarts and sign-outs on the same device.

## Transaction notifications

Confirmed successful incoming QR payments and outgoing transfers are emailed to the merchant account that created the transaction, using the existing Resend sender configuration. The API reconciles pending transactions and retries queued email delivery.

Merchants can also enter a customer email when creating a QR checkout. DRPAY queues a payment-request email with the hosted checkout link, then sends a separate confirmation only after SwiftPay confirms the payment as executed. Leaving the customer email blank disables these customer emails.

Android push alerts use Capacitor Push Notifications and Firebase Cloud Messaging. Create a Firebase Android app with package ID `ph.drpays.merchant`, place its `google-services.json` in `android/app/`, and configure `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_EMAIL`, and `FCM_SERVICE_ACCOUNT_PRIVATE_KEY` on the API service. Grant the service account permission to send Firebase Cloud Messaging messages. After signing in, the app requests notification permission and registers the device token with the API. Rebuild and reinstall the Android app after adding Firebase configuration. Push delivery remains disabled until the Firebase client and server configuration are both present; email notifications continue independently.

## Payment behavior

The API uses SwiftPay hosted payment links and checks link status server-side. It submits InstaPay/PESONet disbursements using SwiftPay's HTTP Basic-authenticated `POST /api/disbursements/send` endpoint, with a unique `merchantReferenceNo`; accepted transfers remain pending until SwiftPay reports a terminal status. InstaPay is limited to PHP 50,000 per transfer, and transfer remarks are required and limited to 80 characters. Provider validation errors are returned to the merchant instead of being mislabeled as gateway failures. Payment and payout records are stored in PostgreSQL. The server never accepts card data.

The current implementation uses provider polling for reconciliation. It does not claim or depend on an unverified webhook signature format. A payment link timeout is recorded as an unknown outcome and must be reconciled before a new request is attempted.

Merchants can refund eligible completed QR Ph collections from Wallet activity. The refund is a full InstaPay/PESONet transfer to the payer details returned by SwiftPay and must be confirmed with the merchant MPIN. A collection cannot be refunded again while a transfer is pending or after it succeeds; failed transfers may be retried. The merchant's net floating-balance credit is reversed only after SwiftPay confirms the refund transfer, while the original platform fee is retained.

## Local API configuration

Start the API with `pnpm start:api` after setting the server environment variables above and a PostgreSQL `DATABASE_URL`. Keep the API credentials out of source control and local `.env` files that may be shared.

## Android release

The Android wrapper is generated with Capacitor. Android Studio plus Android SDK build tools are required for local APK builds. A signed release is prepared by `.github/workflows/android-release.yml` when a tag matching `android-vMAJOR.MINOR.PATCH` is pushed (for example, `android-v1.0.26`). The release version is taken from the tag and converted to an increasing Android version code. GitHub Actions uses these repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The workflow publishes `drpay.apk` to the GitHub Release, and the marketing homepage links to the latest release. Never commit the keystore; keep a secure backup of the signing key and its passwords.
