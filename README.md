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
- `VITE_ANDROID_APK_URL`: URL of the signed Android APK artifact. No APK or Android project is included, so the download remains unavailable until a release file is uploaded.

The API starts in `sandbox` mode. Verify the full flow against SwiftPay sandbox first. Only after reviewing the integration, explicitly set `SWIFTPAY_ENV=production` and provide live credentials in the API service's Render secret environment. Never put SwiftPay credentials in any `VITE_*` variable; Vite bundles those values into public browser code.

## Payment behavior

The API uses SwiftPay hosted payment links and checks link status server-side. It submits InstaPay/PESONet disbursements with a unique reference and idempotency key; accepted transfers remain pending until SwiftPay reports a terminal status. Payment and payout records are stored in PostgreSQL. The server never accepts card data.

The current implementation uses provider polling for reconciliation. It does not claim or depend on an unverified webhook signature format. A payment link timeout is recorded as an unknown outcome and must be reconciled before a new request is attempted.

## Local API configuration

Start the API with `pnpm start:api` after setting the server environment variables above and a PostgreSQL `DATABASE_URL`. Keep the API credentials out of source control and local `.env` files that may be shared.
