import { useState, type ReactNode } from "react"
import { Copy } from "lucide-react"

export type PaymentEnvironment = "production" | "sandbox"

function ApiCodeBlock({ title, code }: { title: string; code: string }) {
  const [copyState, setCopyState] = useState("")

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopyState("Copied")
    } catch {
      setCopyState("Copy unavailable; select the code to copy.")
    }
  }

  return (
    <section className="api-code-block">
      <header>
        <strong>{title}</strong>
        <button type="button" onClick={() => void copyCode()}>
          <Copy size={13} /> Copy
        </button>
      </header>
      <pre>
        <code>{code}</code>
      </pre>
      {copyState && <p role="status">{copyState}</p>}
    </section>
  )
}

function DocsSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="api-docs-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Endpoints() {
  const endpoints = [
    ["GET", "/v1/wallet/balance", "read · merchant wallet balance"],
    ["GET", "/v1/wallet/activity", "read · merchant transactions"],
    [
      "POST",
      "/v1/payment-links",
      "payments:write · create QR checkout and link",
    ],
    ["GET", "/v1/payment-links/:code", "read · refresh owned payment status"],
    ["GET", "/v1/payment-institutions", "read · collection institution list"],
    [
      "GET",
      "/v1/disbursement-institutions",
      "read · transfer institution list",
    ],
    [
      "GET",
      "/v1/internal-wallet",
      "read · separate PayPulse-funded floating wallet",
    ],
    [
      "GET",
      "/v1/crypto/usdt-wallet",
      "read · assigned wallet, qualifying balance, and activation milestones",
    ],
    [
      "GET",
      "/v1/crypto/usdt-deposits",
      "read · confirmed deposits since address assignment",
    ],
  ] as const

  return (
    <div className="api-docs-endpoints">
      {endpoints.map(([method, path, description]) => (
        <div key={`${method}-${path}`}>
          <b>{method}</b>
          <code>{path}</code>
          <span>{description}</span>
        </div>
      ))}
    </div>
  )
}

export default function MerchantApiDocumentation({
  apiBaseUrl,
  paymentEnvironment,
}: {
  apiBaseUrl: string
  paymentEnvironment: PaymentEnvironment
}) {
  const configuredApiBaseUrl = apiBaseUrl.trim()
  const isProduction = paymentEnvironment === "production"
  const environmentLabel = isProduction
    ? "Production / live money"
    : "Sandbox / test money"
  const checkoutHost = isProduction
    ? "pulsepay.live"
    : "pay.sandbox.denpay.cc"
  const checkoutOrigin = `https://${checkoutHost}`

  return (
    <div className="api-docs">
      <div className="profile-info-intro api-docs-hero">
        <strong>Integrate your PayPulse wallet and collections</strong>
        <p>
          Read your merchant-specific PHP wallet, create a QR-backed hosted
          payment link from your platform, and confirm payment status. Your
          customer pays on a PayPulse-hosted checkout page; your server receives
          the link and returns it to your customer.
        </p>
        <p>
          Account enablement keeps sign-in and collections available. The
          one-time PHP activation fee is debited from your available merchant
          wallet balance and credited to Super Admin. Transfers and API
          integrations unlock after the fee is paid and you add at least 100
          USDT above the balance recorded when Super Admin assigns your TRON
          address. The API guide email is sent after both requirements are
          confirmed.
        </p>
      </div>

      <DocsSection title="1. Set up API access">
        <p>
          Create a key in <strong>Profile → Developer hub → API access</strong>. Use{" "}
          <code>read</code> to retrieve your wallet and activity. Use{" "}
          <code>payments:write</code> to create collections; choose both scopes
          to use the complete integration. Keys are environment-specific.
        </p>
        <p>
          After both activation milestones are complete, PayPulse emails the API
          guide and payload PDF separately from your invitation. Then generate
          your own key here; it is shown once and is never included in an email.
          Set the Postman collection&apos;s <code>apiKey</code> to that key and
          its <code>baseUrl</code> to the API URL shown below.
        </p>
        <div className="api-docs-base">
          <span>API base URL for this session</span>
          <code>{configuredApiBaseUrl || "Not configured"}</code>
          <small>Environment: {environmentLabel}</small>
        </div>
        {configuredApiBaseUrl ? (
          <p>
            Use the base URL shown above for this environment. Store the key in
            your server&apos;s secret manager and send it as a bearer token over
            HTTPS. Never put the key or SwiftPay credentials in browser code, a
            mobile app, source control, or client-side environment variables.
          </p>
        ) : (
          <p role="status">
            The API base URL is not configured for this app. Set
            VITE_DRPAY_BACKEND_URL or the matching live/sandbox backend URL in
            the frontend build environment before using these integration
            examples.
          </p>
        )}
        <ApiCodeBlock
          title="Authorization header"
          code={`Authorization: Bearer $DRPAY_API_KEY`}
        />
        {configuredApiBaseUrl && (
          <ApiCodeBlock
            title="Server environment variables"
            code={`DRPAY_API_BASE_URL=${configuredApiBaseUrl}
DRPAY_API_KEY=your_environment_specific_key`}
          />
        )}
      </DocsSection>

      <DocsSection title="2. Read wallet balance">
        <p>
          <code>GET /v1/wallet/balance</code> returns this merchant&apos;s
          operational ledger only. <code>balance</code> is the posted ledger
          amount; <code>availableBalance</code> subtracts reservations for
          transfers still in progress. The PayPulse-funded floating balance is a
          separate wallet.
        </p>
        <ApiCodeBlock
          title="Request"
          code={`curl "$DRPAY_API_BASE_URL/v1/wallet/balance" \\
  -H "Authorization: Bearer $DRPAY_API_KEY" \\
  -H "Accept: application/json"`}
        />
        <ApiCodeBlock
          title="200 response"
          code={`{
  "balance": 1250.50,
  "availableBalance": 1000.50,
  "reservedBalance": 250.00,
  "walletMode": "pooled",
  "paymentEnvironment": "${paymentEnvironment}",
  "cumulativeKrwCollections": 420000
}`}
        />
        <p>
          Collection credits are posted net of platform fees. Successful
          transfers debit the ledger. Pending or unknown-outcome transfers
          reduce available balance until resolved. Do not treat the shared
          provider account as your merchant balance.
        </p>
      </DocsSection>

      <DocsSection title="3. Create a collection on your platform">
        <p>
          <code>POST /v1/payment-links</code> creates a fixed PHP QRPH payment
          and a self-hosted PayPulse checkout page. The response includes{" "}
          <code>paymentUrl</code> to redirect your customer to,{" "}
          <code>qrCode</code> for rendering a QR in your own experience, and{" "}
          <code>qrImageUrl</code> for the QR image. The <code>currency</code>{" "}
          field only accepts PHP and defaults to PHP when omitted. Optionally
          include <code>customerEmail</code> to email the customer the checkout
          link and a separate payment-confirmed notice after SwiftPay reports{" "}
          <code>EXECUTED</code> or the PayPulse team independently verifies the
          payment. Checkout links use your environment&apos;s branded host:{" "}
          <code>{checkoutHost}</code>.
        </p>
        <p>
          To generate a Virtual Account QRPH checkout, set{" "}
          <code>institutionCode</code> to{" "}
          <code>DRPAY_VIRTUAL_ACCOUNT</code> and{" "}
          <code>institutionName</code> to <code>Virtual Account</code>. The
          response and hosted checkout include SwiftPay&apos;s{" "}
          <code>bankAccountNumber</code>, <code>instapayBankCode</code>, and{" "}
          <code>referenceNo</code> under <code>virtualAccountInfo</code> when
          those documented fields are returned.
        </p>
        <p>
          For physical orders, optionally include{" "}
          <code>estimatedDeliveryDate</code> in <code>YYYY-MM-DD</code> format.
          When both it and <code>customerEmail</code> are provided, the checkout
          offers the Google Customer Reviews opt-in after payment is confirmed.
        </p>
        <p>
          Generate a new, unique idempotency key for each intended payment (at
          least 16 characters). If the request times out, retry the same payment
          with the same key; do not create another payment with a new key until
          you have checked its outcome.
        </p>
        <ApiCodeBlock
          title="Request"
          code={`curl -X POST "$DRPAY_API_BASE_URL/v1/payment-links" \\
  -H "Authorization: Bearer $DRPAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: invoice-1048-attempt-1" \\
  -d '{
    "amount": 125.50,
    "currency": "PHP",
    "description": "Invoice 1048",
    "customerEmail": "customer@example.com",
    "estimatedDeliveryDate": "2026-11-15"
  }'`}
        />
        <ApiCodeBlock
          title="201 response"
          code={`{
  "id": "payment-record-uuid",
  "code": "opaque_checkout_code",
  "paymentUrl": "${checkoutOrigin}/?checkout=opaque_checkout_code",
  "qrCode": "qrph://...",
  "qrImageUrl": "https://denpay.cc/v1/public/checkout/opaque_checkout_code/qr.png",
  "status": "PENDING",
  "amount": 125.50,
  "currency": "PHP"
}`}
        />
        <p>
          The API creates the QR payment, so no SwiftPay credentials or payment
          data need to touch your frontend. The hosted page displays your
          payment request, QR, secure checkout branding, reference, and payment
          status. In production mode, payment collection moves real money.
        </p>
      </DocsSection>

      <DocsSection title="4. Example: create the link from your server">
        <p>
          Call PayPulse from a trusted backend route, then return only the safe
          payment URL and reference to your browser or app. This example uses
          Node.js 18+:
        </p>
        <ApiCodeBlock
          title="Node.js server example"
          code={`import { createHash } from "node:crypto";

export async function createInvoiceCheckout({ amount, invoiceId, customerEmail }) {
  const idempotencyKey = createHash("sha256")
    .update("invoice:" + invoiceId + ":collection")
    .digest("hex");
  const response = await fetch(
    process.env.DRPAY_API_BASE_URL + "/v1/payment-links",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.DRPAY_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify({
        amount,
        currency: "PHP",
        description: "Invoice " + invoiceId,
        customerEmail
      })
    }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Could not create payment link");
  }
  return {
    paymentUrl: result.paymentUrl,
    reference: result.code,
    status: result.status
  };
}`}
        />
        <p>
          On your own frontend, redirect the customer to the returned{" "}
          <code>paymentUrl</code> or show it as a payment button/link. Keep the
          idempotency key associated with your invoice so retries reuse it.
        </p>
      </DocsSection>

      <DocsSection title="5. Check payment status">
        <p>
          Use <code>GET /v1/payment-links/:code</code> from your server to
          refresh the status of a link owned by your merchant account. Poll at a
          reasonable interval, or configure a webhook for server-to-server
          updates. Treat only <code>EXECUTED</code> as paid.
        </p>
        <ApiCodeBlock
          title="Request"
          code={`curl "$DRPAY_API_BASE_URL/v1/payment-links/CHECKOUT_CODE" \\
  -H "Authorization: Bearer $DRPAY_API_KEY" \\
  -H "Accept: application/json"`}
        />
        <ApiCodeBlock
          title="Response"
          code={`{
  "code": "opaque_checkout_code",
  "paymentUrl": "${checkoutOrigin}/?checkout=opaque_checkout_code",
  "status": "EXECUTED",
  "amount": 125.50,
  "currency": "PHP",
  "referenceNo": "482731"
}`}
        />
        <p>
          Status values include <code>PENDING</code>, <code>EXECUTED</code>,{" "}
          <code>CANCELED</code>, <code>REJECTED</code>, and <code>EXPIRED</code>
          . A successful response to link creation means the checkout was
          created, not that the customer has paid.
        </p>
      </DocsSection>

      <DocsSection title="6. Wallet activity">
        <p>
          <code>GET /v1/wallet/activity?limit=50&amp;offset=0</code> returns this
          merchant&apos;s latest transactions. <code>limit</code> is 1–100. Use
          offset pagination. The transaction <code>amount</code> is the gross
          payment or transfer amount; <code>walletAmount</code> is the signed
          posted ledger impact after fees/refund accounting, and is null until
          posted.
        </p>
        <ApiCodeBlock
          title="Request"
          code={`curl "$DRPAY_API_BASE_URL/v1/wallet/activity?limit=50&offset=0" \\
  -H "Authorization: Bearer $DRPAY_API_KEY"`}
        />
        <p>
          Each returned item includes <code>id</code>, <code>referenceNo</code>,{" "}
          <code>amount</code>, <code>walletAmount</code>, <code>status</code>,{" "}
          <code>channel</code>, <code>transactionType</code>,{" "}
          <code>description</code>, and <code>createdAt</code>. Additional
          transfer details may include recipient and institution fields.
        </p>
      </DocsSection>

      <DocsSection title="Endpoints and permissions">
        <Endpoints />
        <p>
          API keys are limited to 120 requests per minute. Payment-link creation
          is additionally limited to 20 requests per minute per client IP. API
          keys cannot initiate disbursements or access other merchants&apos;
          records.
        </p>
      </DocsSection>

      <DocsSection title="Payment webhooks">
        <p>
          In <strong>Profile → Developer hub → API access</strong>, save a
          public HTTPS endpoint and select one or more events. Supported events
          are <code>payment.succeeded</code>, <code>payment.failed</code>,{" "}
          <code>disbursement.succeeded</code>, and{" "}
          <code>disbursement.failed</code>. An optional callback URL receives
          the same event. Saving settings generates a signing secret shown once;
          copy it to your server&apos;s secret manager. Saving again rotates
          the secret, so update your receiver at the same time.
        </p>
        <p>
          Webhook settings are managed in the Developer hub with your merchant
          session; they are not accessible using a merchant API key. A
          successful payment event can have status <code>EXECUTED</code> or{" "}
          <code>MANUALLY_PAID</code>. Successful disbursement statuses include{" "}
          <code>EXECUTED</code>, <code>SUCCESS</code>, and{" "}
          <code>COMPLETED</code>.
        </p>
        <p><strong>How delivery works</strong></p>
        <ol>
          <li>
            When a payment or disbursement reaches a supported success or
            failure outcome, PayPulse creates an event if you selected that event
            type.
          </li>
          <li>
            PayPulse queues the event and sends an HTTPS POST with the JSON event
            body to your endpoint. If configured, the callback URL receives
            the same event too.
          </li>
          <li>
            Your server verifies the signature, deduplicates the event, stores
            it, then quickly responds with any 2xx status.
          </li>
          <li>
            A timeout or non-2xx response causes a retry with exponential
            backoff, for up to eight attempts. Delivery is at least once, so
            the same event may arrive more than once.
          </li>
        </ol>
        <ApiCodeBlock
          title="Example payment event"
          code={`{
  "id": "event-uuid",
  "type": "payment.succeeded",
  "createdAt": "2026-11-07T05:30:00.000Z",
  "data": {
    "id": "payment-record-uuid",
    "reference": "482731",
    "amount": 125.5,
    "currency": "PHP",
    "status": "EXECUTED"
  }
}`}
        />
        <p>
          Every request includes <code>DRPAY-Event</code> and{" "}
          <code>DRPAY-Signature</code> headers. The signature is{" "}
          <code>sha256=&lt;hex HMAC-SHA256&gt;</code>, calculated over the exact
          raw request-body bytes using the signing secret—not a parsed and
          re-serialized JSON object. Verify it before parsing or acting on the
          event. For example, in Node.js:
        </p>
        <ApiCodeBlock
          title="Verify the raw request body (Node.js)"
          code={`import { createHmac, timingSafeEqual } from "node:crypto";

function verifyWebhook(rawBody, signatureHeader, secret) {
  if (!Buffer.isBuffer(rawBody) ||
      typeof signatureHeader !== "string" ||
      !signatureHeader.startsWith("sha256=")) return false;
  const supplied = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest();
  return timingSafeEqual(expected, Buffer.from(supplied, "hex"));
}`}
        />
        <p>
          Preserve the raw bytes in your HTTP framework before JSON parsing.
          After verification, deduplicate using the event <code>id</code>,
          durably record the event, and return any 2xx response. Acknowledge
          before doing slower downstream work; process it asynchronously.
          Check both the event <code>type</code> and{" "}
          <code>data.status</code> before updating your records.
          Failed deliveries retry with exponential backoff for up to eight
          attempts. Review{" "}
          <code>GET /v1/webhook/deliveries</code> for attempt history; exhausted
          deliveries can be queued again with{" "}
          <code>POST /v1/webhook/deliveries/:id/retry</code>.
        </p>
      </DocsSection>

      <DocsSection title="Errors and safe retries">
        <p>
          Errors use <code>{'{ "error": "..." }'}</code>. Common HTTP statuses:{" "}
          <code>400</code> invalid input, <code>401</code> invalid key,{" "}
          <code>403</code> missing scope, <code>404</code> unknown/foreign
          payment link, <code>409</code> idempotency or wallet conflict,{" "}
          <code>429</code> rate limit, <code>503</code> temporary service or
          ambiguous provider outcome.
        </p>
        <p>
          For an ambiguous create result or timeout, keep the original
          idempotency key and reconcile through wallet activity or payment
          status before attempting another collection. Do not mark an invoice
          paid based only on the customer&apos;s return to your site—verify the
          status via authenticated API or a verified webhook.
        </p>
      </DocsSection>

      <p className="profile-info-note">
        Import the{" "}
        <a
          href="/postman/DRPAY-Merchant-API.postman_collection.json"
          download
        >
          Postman collection
        </a>{" "}
        for ready-to-run requests. Configure its base URL for the chosen API
        environment and use a matching merchant API key.
        {" "}
        You can also import the{" "}
        <a href="/openapi.json" target="_blank" rel="noreferrer">
          OpenAPI 3.1 specification
        </a>{" "}
        into Swagger UI or another OpenAPI-compatible tool.
      </p>
    </div>
  )
}
