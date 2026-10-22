# DRPAY

Vite marketing site and merchant workspace, with a server-side SwiftPay adapter.

## Render

Review `render.yaml` and create its Blueprint in Render. It defines a static site, an always-on Node API, and persistent PostgreSQL in Oregon. The API and database use paid plans; review Render's current pricing before provisioning. The site publishes `dist` and rewrites `/app` routes to the client app.

Set these secrets directly in Render when prompted:

- `DRPAY_MERCHANT_EMAIL`: the single merchant sign-in email.
- `DRPAY_MERCHANT_PASSWORD`: a strong password with at least 16 characters.
- `DRPAY_PASSWORD_SALT`: random salt with at least 32 characters.
- `DRPAY_JWT_SECRET`: random signing secret with at least 32 characters.
- `SWIFTPAY_ACCESS_KEY` and `SWIFTPAY_SECRET_KEY`: credentials for the selected SwiftPay environment.
- `VITE_ANDROID_APK_URL`: URL of the signed Android APK artifact. The Android wrapper and release workflow are included, but the link stays disabled until CI publishes the first signed release.

The API starts in `sandbox` mode. Verify the full flow against SwiftPay sandbox first. For live mode, explicitly set `SWIFTPAY_ENV=production`, add `SWIFTPAY_LIVE_MONEY_ACKNOWLEDGED=I_UNDERSTAND_REAL_MONEY`, and use live credentials in the API service's Render secret environment. The API refuses to start in production mode without that explicit acknowledgement. Never put SwiftPay credentials in any `VITE_*` variable; Vite bundles those values into public browser code.

Merchant sign-in supports device passkeys with user verification (such as fingerprint, face unlock, or device screen lock). The relying-party ID defaults to the hostname in `DRPAY_FRONTEND_ORIGIN`; set `DRPAY_WEBAUTHN_RP_ID` when the production frontend uses a different passkey domain. `DRPAY_WEBAUTHN_ORIGINS` can override the allowed origin list with comma-separated exact origins for approved web clients. Passkeys require a secure browser origin and an authenticator that supports platform credentials. Merchants must enroll both a four-digit MPIN and a passkey; either can authorize each outgoing transfer.

## Payment behavior

The API uses SwiftPay hosted payment links and checks link status server-side. It submits InstaPay/PESONet disbursements using SwiftPay's HTTP Basic-authenticated `POST /api/disbursements/send` endpoint, with a unique `merchantReferenceNo`; accepted transfers remain pending until SwiftPay reports a terminal status. InstaPay is limited to PHP 50,000 per transfer, and transfer remarks are limited to 80 characters. Provider validation errors are returned to the merchant instead of being mislabeled as gateway failures. Payment and payout records are stored in PostgreSQL. The server never accepts card data.

The current implementation uses provider polling for reconciliation. It does not claim or depend on an unverified webhook signature format. A payment link timeout is recorded as an unknown outcome and must be reconciled before a new request is attempted.

## Local API configuration

Start the API with `pnpm start:api` after setting the server environment variables above and a PostgreSQL `DATABASE_URL`. Keep the API credentials out of source control and local `.env` files that may be shared.

## Android release

The Android wrapper is generated with Capacitor. Android Studio plus Android SDK build tools are required for local APK builds. A signed release is prepared by `.github/workflows/android-release.yml` when a tag matching `android-vMAJOR.MINOR.PATCH` is pushed (for example, `android-v1.0.26`). The release version is taken from the tag and converted to an increasing Android version code. GitHub Actions uses these repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The workflow publishes `drpay.apk` to the GitHub Release, and the marketing homepage links to the latest release. Never commit the keystore; keep a secure backup of the signing key and its passwords.
